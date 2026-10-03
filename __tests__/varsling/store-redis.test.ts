/** Validerer de ekte Lua-skriptene, ikke bare testdobbelens JavaScript-dispatch.
 * Kjør med VARSLING_TEST_REDIS=1 når redis-server/redis-cli er tilgjengelig.
 * Ellers hoppes testen over, så vanlig testkjøring også virker i en sandbox uten socket-tilgang.
 * Serveren har bare en privat Unix-socket og ingen nettverksport eller varig lagring.
 */
import { execFile, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Arg, Kv } from "@/lib/varsling/kv";
import {
  bekreftAbonnement, epostHash, hentAbonnement, hentAktive, lagreKvitteringHvisAktiv,
  lagreUtboksHvisAktiv, lagreVenter, NOKLER, overGrense, slettAbonnement, slettForEpost,
} from "@/lib/varsling/store";
import type { Abonnement } from "@/lib/varsling/typer";
import { CONFIG } from "./fakes";

const kjor = promisify(execFile);
const harRedis = process.env.VARSLING_TEST_REDIS === "1" && ["redis-server", "redis-cli"].every((bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);

describe.skipIf(!harRedis)("lagring mot ekte Redis", () => {
  let server: ChildProcess;
  let mappe: string;
  let kv: Kv;

  beforeAll(async () => {
    mappe = mkdtempSync(path.join(tmpdir(), "varsling-"));
    const socket = path.join(mappe, "r");
    server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--save", "", "--appendonly", "no"], { stdio: "ignore" });
    kv = {
      async cmd<T>(...args: Arg[]): Promise<T> {
        const { stdout } = await kjor("redis-cli", ["-s", socket, "--json", ...args.map(String)]);
        return JSON.parse(stdout) as T;
      },
      pipeline: (cmds) => Promise.all(cmds.map((c) => kv.cmd(...c))),
    };
    for (let forsok = 0; forsok < 100; forsok++) {
      try { if (await kv.cmd("PING") === "PONG") return; } catch { /* Venter på socketen. */ }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("Den isolerte Redis-serveren startet ikke");
  }, 10_000);

  afterAll(async () => {
    if (server?.exitCode === null) {
      const avsluttet = once(server, "exit");
      server.kill("SIGTERM");
      await avsluttet;
    }
    if (mappe) rmSync(mappe, { recursive: true, force: true });
  });

  beforeEach(async () => { await kv.cmd("FLUSHDB"); });

  function abo(id: string, epost = "redis@example.no"): Abonnement {
    return { id, epost, status: "venter", omrade: { type: "kommuner", kommuner: ["0301"] }, omradeTekst: "Oslo", filtre: ["strek", "sur"], opprettet: "2026-10-04T08:00:00Z" };
  }

  it("aktiverer og erstatter atomisk med korrekte JSON-felter, utløp og opprydding", async () => {
    await lagreVenter(kv, abo("gammel"));
    expect(await kv.cmd<number>("TTL", NOKLER.abo("gammel"))).toBeGreaterThan(0);
    await bekreftAbonnement(kv, CONFIG.secret, "gammel", new Date("2026-10-04T09:00:00Z"));
    expect(await kv.cmd("TTL", NOKLER.abo("gammel"))).toBe(-1);
    expect(await hentAbonnement(kv, "gammel")).toMatchObject({ status: "aktiv", filtre: ["strek", "sur"], bekreftet: "2026-10-04T09:00:00.000Z" });
    expect(await lagreUtboksHvisAktiv(kv, "gammel", "ventende")).toBe(true);
    expect(await lagreKvitteringHvisAktiv(kv, "gammel", '{"dag":"2026-10-04","nokkel":"sendt"}')).toBe(true);
    await lagreVenter(kv, abo("ny"));
    expect(await bekreftAbonnement(kv, CONFIG.secret, "ny")).toBe("ok");
    expect((await hentAktive(kv)).map((a) => a.id)).toEqual(["ny"]);
    expect(await kv.cmd("MGET", NOKLER.abo("gammel"), NOKLER.sendt("gammel"))).toEqual([null, null]);
    expect(await kv.cmd("HGET", NOKLER.utboks, "gammel")).toBeNull();
    expect(await slettAbonnement(kv, CONFIG.secret, "ny")).toBe(true);
    expect(await slettAbonnement(kv, CONFIG.secret, "ny")).toBe(false);
    expect(await lagreUtboksHvisAktiv(kv, "ny", "skal ikke gjenopprettes")).toBe(false);
    expect(await lagreKvitteringHvisAktiv(kv, "ny", "skal ikke gjenopprettes")).toBe(false);
    expect(await kv.cmd("DBSIZE")).toBe(0);
  });

  it("har bare én aktiv adresse etter samtidige bekreftelser fra forskjellige klienter", async () => {
    await Promise.all(["a", "b", "c"].map((id) => lagreVenter(kv, abo(id))));
    await Promise.all(["a", "b", "c"].map((id) => bekreftAbonnement(kv, CONFIG.secret, id)));
    const aktive = await hentAktive(kv);
    expect(aktive).toHaveLength(1);
    expect(await kv.cmd("GET", NOKLER.epost(epostHash(CONFIG.secret, "redis@example.no")))).toBe(aktive[0].id);
    for (const id of ["a", "b", "c"].filter((id) => id !== aktive[0].id)) expect(await hentAbonnement(kv, id)).toBeNull();
  });

  it("teller samtidige forespørsler atomisk med utløp", async () => {
    const key = NOKLER.rl("test", "redis");
    const svar = await Promise.all(Array.from({ length: 12 }, () => overGrense(kv, key, 10, 60)));
    expect(svar.filter(Boolean)).toHaveLength(2);
    expect(await kv.cmd("GET", key)).toBe("12");
    expect(await kv.cmd<number>("TTL", key)).toBeGreaterThan(0);
  });

  it("admin sletter aktive og ventende data uten å påvirke andre adresser", async () => {
    await lagreVenter(kv, abo("aktiv"));
    await bekreftAbonnement(kv, CONFIG.secret, "aktiv");
    await lagreVenter(kv, abo("venter"));
    await lagreVenter(kv, abo("annen", "annen@example.no"));
    expect(await slettForEpost(kv, CONFIG.secret, "redis@example.no")).toBe(true);
    expect(await hentAbonnement(kv, "aktiv")).toBeNull();
    expect(await hentAbonnement(kv, "venter")).toBeNull();
    expect(await hentAbonnement(kv, "annen")).not.toBeNull();
    expect(await kv.cmd("GET", NOKLER.epost(epostHash(CONFIG.secret, "redis@example.no")))).toBeNull();
  });
});
