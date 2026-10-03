import { beforeEach, describe, expect, it } from "vitest";
import { behandleAbonnement, GRENSER, SJEKK_INNBOKSEN, type AbonnerDeps } from "@/lib/varsling/abonner";
import { bekreftAbonnement, epostHash, hentAbonnement, hentAktive, NOKLER, slettAbonnement, slettForEpost } from "@/lib/varsling/store";
import { verifiserToken } from "@/lib/varsling/token";
import { CONFIG, FalskMailer, MinneKv, sted, tilsyn } from "./fakes";

const steder = [sted({ id: "A", tilsyn: [tilsyn("2026-09-20", 2)] })];
const body = (epost = "ola@example.no") => ({
  epost,
  omrade: { type: "radius", lat: 59.91, lng: 10.75, km: 5 },
  filtre: ["strek", "sur"],
  nettside: "",
});

let kv: MinneKv;
let mailer: FalskMailer;
let deps: AbonnerDeps;

beforeEach(() => {
  kv = new MinneKv();
  mailer = new FalskMailer();
  deps = { kv, mailer, config: CONFIG, steder, kommuneFinnes: (nr) => nr === "0301", naa: new Date("2026-10-04T08:00:00Z") };
});

function tokenFra(html: string): string {
  const m = html.match(/bekreft\?token=([A-Za-z0-9_.%-]+)/);
  return decodeURIComponent(m![1]);
}

describe("påmelding", () => {
  it("lagrer et ventende abonnement og sender en signert bekreftelseslenke", async () => {
    const svar = await behandleAbonnement(body(), { ip: "1.2.3.4" }, deps);
    expect(svar).toEqual({ status: 200, body: { ok: true, melding: SJEKK_INNBOKSEN } });
    expect(mailer.sendt).toHaveLength(1);
    const e = mailer.sendt[0];
    expect(e.til).toBe("ola@example.no");
    expect(e.emne).toContain("Bekreft");

    const v = verifiserToken(CONFIG.secret, tokenFra(e.html), "bekreft", Date.parse("2026-10-04T09:00:00Z") / 1000);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const abo = await hentAbonnement(kv, v.data.id);
    expect(abo).toMatchObject({ status: "venter", epost: "ola@example.no", omradeTekst: "5 km rundt et punkt i Oslo" });
    expect(kv.ttl(NOKLER.abo(v.data.id))).toBeDefined(); // utløper etter 48 t
    // IP lagres aldri i klartekst.
    expect(JSON.stringify([...kv.data.keys()])).not.toContain("1.2.3.4");
    expect(JSON.stringify([...kv.data.keys()])).not.toContain("ola@example.no");
  });

  it("later som alt gikk bra når honningkrukka er fylt ut", async () => {
    const svar = await behandleAbonnement({ ...body(), nettside: "http://spam" }, { ip: "1" }, deps);
    expect(svar.status).toBe(200);
    expect(mailer.sendt).toHaveLength(0);
    expect(kv.data.size).toBe(0);
  });

  it("gir 400 med feltfeil ved ugyldig input", async () => {
    const svar = await behandleAbonnement({ ...body("ikke-epost"), filtre: [] }, { ip: "1" }, deps);
    expect(svar.status).toBe(400);
    expect(Object.keys(svar.body.feil ?? {}).sort()).toEqual(["epost", "filtre"]);
  });

  it("svarer likt uansett om adressen er kjent, og begrenser e-poster per adresse i stillhet", async () => {
    const svar: unknown[] = [];
    for (let i = 0; i < GRENSER.epost.antall + 2; i++) svar.push(await behandleAbonnement(body(), { ip: `ip${i}` }, deps));
    expect(new Set(svar.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(mailer.sendt).toHaveLength(GRENSER.epost.antall);
  });

  it("begrenser per IP", async () => {
    let siste = null;
    for (let i = 0; i <= GRENSER.ip.antall; i++) siste = await behandleAbonnement(body(`p${i}@example.no`), { ip: "9.9.9.9" }, deps);
    expect(siste!.status).toBe(429);
    kv.naa += GRENSER.ip.vinduSek * 1000 + 1;
    expect((await behandleAbonnement(body("ny@example.no"), { ip: "9.9.9.9" }, deps)).status).toBe(200);
  });

  it("rydder opp hvis e-posten ikke kan sendes", async () => {
    mailer.svar.push({ ok: false, permanent: false, status: 500, melding: "nede" });
    const svar = await behandleAbonnement(body(), { ip: "1" }, deps);
    expect(svar.status).toBe(502);
    expect([...kv.data.keys()].filter((k) => k.includes(":abo:"))).toEqual([]);
  });

  it("gir 503 hvis Redis feiler", async () => {
    kv.feilPaa = "INCR";
    expect((await behandleAbonnement(body(), { ip: "1" }, deps)).status).toBe(503);
  });
});

describe("bekreftelse og avmelding", () => {
  async function meldPaa(epost: string): Promise<string> {
    await behandleAbonnement(body(epost), { ip: epost }, deps);
    const v = verifiserToken(CONFIG.secret, tokenFra(mailer.sendt.at(-1)!.html), "bekreft", 0);
    if (!v.ok) throw new Error("ugyldig token");
    return v.data.id;
  }

  it("aktiverer, er idempotent, og erstatter et eldre abonnement for samme adresse", async () => {
    const forste = await meldPaa("kari@example.no");
    expect(await bekreftAbonnement(kv, CONFIG.secret, forste)).toBe("ok");
    expect(await bekreftAbonnement(kv, CONFIG.secret, forste)).toBe("ok");
    expect(kv.ttl(NOKLER.abo(forste))).toBeUndefined(); // aktive utløper ikke

    const andre = await meldPaa("kari@example.no");
    // Før bekreftelse er det gamle fortsatt aktivt.
    expect((await hentAktive(kv)).map((a) => a.id)).toEqual([forste]);
    await bekreftAbonnement(kv, CONFIG.secret, andre);
    expect((await hentAktive(kv)).map((a) => a.id)).toEqual([andre]);
    expect(await hentAbonnement(kv, forste)).toBeNull();
  });

  it("ubekreftede abonnementer forsvinner etter 48 timer", async () => {
    const id = await meldPaa("per@example.no");
    kv.naa += 48 * 3600 * 1000 + 1;
    expect(await bekreftAbonnement(kv, CONFIG.secret, id)).toBe("ukjent");
  });

  it("avmelding sletter alt og er idempotent", async () => {
    const id = await meldPaa("lise@example.no");
    await bekreftAbonnement(kv, CONFIG.secret, id);
    expect(await slettAbonnement(kv, CONFIG.secret, id)).toBe(true);
    expect(await slettAbonnement(kv, CONFIG.secret, id)).toBe(false);
    const igjen = [...kv.data.entries()].filter(([k, v]) => !k.includes(":rl:") && (typeof v.v === "string" || (v.v as Set<string>).size > 0));
    expect(igjen).toEqual([]);
    expect(await kv.cmd("GET", NOKLER.epost(epostHash(CONFIG.secret, "lise@example.no")))).toBeNull();
  });

  it("eieren kan slette på e-postadresse", async () => {
    const id = await meldPaa("ole@example.no");
    await bekreftAbonnement(kv, CONFIG.secret, id);
    expect(await slettForEpost(kv, CONFIG.secret, "ole@example.no")).toBe(true);
    expect(await hentAktive(kv)).toEqual([]);
  });
});
