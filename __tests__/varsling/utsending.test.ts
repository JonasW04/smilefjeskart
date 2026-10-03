import { beforeEach, describe, expect, it } from "vitest";
import type { Datasett, Sted } from "@/lib/types";
import { NOKLER, slettAbonnement } from "@/lib/varsling/store";
import { verifiserToken } from "@/lib/varsling/token";
import type { Abonnement } from "@/lib/varsling/typer";
import { kjorUtsending, MAKS_FORSOK, type UtsendingDeps } from "@/lib/varsling/utsending";
import { CONFIG, FalskMailer, MinneKv, sted, tilsyn } from "./fakes";

let kv: MinneKv;
let mailer: FalskMailer;

function datasett(steder: Sted[], generert = "2026-10-03T22:00:00Z"): Datasett {
  return { generert, kilde: "test", antallTilsyn: 0, steder };
}

async function aktiv(id: string, p: Partial<Abonnement> = {}) {
  const abo: Abonnement = {
    id,
    epost: `${id}@example.no`,
    status: "aktiv",
    omrade: { type: "kommuner", kommuner: ["0301"] },
    omradeTekst: "Oslo",
    filtre: ["strek", "sur"],
    opprettet: "2026-10-01T00:00:00Z",
    ...p,
  };
  await kv.cmd("SET", NOKLER.abo(id), JSON.stringify(abo));
  await kv.cmd("SADD", NOKLER.aktive, id);
}

function kjor(d: Datasett, extra: Partial<UtsendingDeps> = {}) {
  return kjorUtsending({ kv, mailer, config: CONFIG, datasett: d, sleep: async () => {}, ...extra });
}

const gammel = sted({ id: "A", tilsyn: [tilsyn("2026-09-20", 2)] });
const nyttSur = sted({ id: "B", navn: "Burgerbua", slug: "burgerbua", tilsyn: [tilsyn("2026-09-28", 3)] });
const iBergen = sted({ id: "C", kommunenr: "4601", kommune: "Bergen", tilsyn: [tilsyn("2026-09-29", 3)] });

beforeEach(() => {
  kv = new MinneKv();
  mailer = new FalskMailer();
});

describe("utsending", () => {
  it("første kjøring husker alt og sender ingenting", async () => {
    await aktiv("abonnent0000000001");
    const r = await kjor(datasett([gammel, nyttSur]));
    expect(r.modus).toBe("seedet");
    expect(mailer.sendt).toHaveLength(0);
    expect(await kv.cmd("SCARD", NOKLER.sett)).toBe(2);
  });

  it("sender ett sammendrag per abonnent med nye treff, med avmeldingsheadere", async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    await aktiv("abonnent0000000002", { omrade: { type: "kommuner", kommuner: ["4601"] } });
    await aktiv("abonnent0000000003", { filtre: ["smil"] });

    const r = await kjor(datasett([gammel, nyttSur, iBergen]));
    expect(r).toMatchObject({ modus: "normal", nye: 2, abonnenter: 3, lagtIUtboks: 2, sendt: 2 });
    expect(mailer.sendt.map((e) => e.til).sort()).toEqual(["abonnent0000000001@example.no", "abonnent0000000002@example.no"]);

    const e = mailer.sendt.find((m) => m.til.startsWith("abonnent0000000001"))!;
    expect(e.emne).toBe("😠 Sur munn for Burgerbua");
    expect(e.html).toContain("/sted/burgerbua");
    expect(e.html).not.toContain("Sted A"); // gammelt tilsyn er ikke nytt
    expect(e.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = e.headers!["List-Unsubscribe"].slice(1, -1);
    const token = new URL(url).searchParams.get("token");
    expect(verifiserToken(CONFIG.secret, token, "avmeld")).toMatchObject({ ok: true, data: { id: "abonnent0000000001" } });
    expect(e.idempotensNokkel).toMatch(/^sammendrag-abonnent0000000001-[0-9a-f]{20}$/);
  });

  it("er idempotent: en ny kjøring med samme data sender ikke på nytt", async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    await kjor(datasett([gammel, nyttSur]));
    const r = await kjor(datasett([gammel, nyttSur]));
    expect(r.nye).toBe(0);
    expect(mailer.sendt).toHaveLength(1);
  });

  it("tåler krasj etter at utboksen er fylt, uten å miste eller doble varsler", async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    kv.feilPaa = "HGETALL"; // krasjer når utboksen skal tømmes
    await expect(kjor(datasett([gammel, nyttSur]))).rejects.toThrow();
    expect(mailer.sendt).toHaveLength(0);
    kv.feilPaa = null;
    const r = await kjor(datasett([gammel, nyttSur]));
    expect(r.sendt).toBe(1);
    expect(mailer.sendt).toHaveLength(1);
  });

  it("slår sammen med ventende sammendrag hvis forrige sending feilet", async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    mailer.svar.push({ ok: false, permanent: false, status: 500, melding: "nede" });
    const r1 = await kjor(datasett([gammel, nyttSur]));
    expect(r1).toMatchObject({ sendt: 0, utsatt: 1 });

    const senere = sted({ id: "D", navn: "Dønerdama", tilsyn: [tilsyn("2026-10-01", 2)] });
    const r2 = await kjor(datasett([gammel, nyttSur, senere]));
    expect(r2).toMatchObject({ nye: 1, sendt: 1 });
    expect(mailer.sendt[0].emne).toBe("2 nye smilefjes i Oslo: 1 sur munn, 1 strekmunn");
  });

  it(`gir opp etter ${MAKS_FORSOK} forsøk og ved permanente feil`, async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    for (let i = 0; i < MAKS_FORSOK; i++) mailer.svar.push({ ok: false, permanent: false, status: 500, melding: "nede" });
    const d = datasett([gammel, nyttSur]);
    await kjor(d);
    await kjor(d);
    const r = await kjor(d);
    expect(r.feilet).toBe(1);
    expect(await kv.cmd("HLEN", NOKLER.utboks)).toBe(0);
  });

  it("stopper når kvoten er brukt opp og fortsetter neste gang", async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    await aktiv("abonnent0000000002");
    mailer.svar.push({ ok: false, permanent: false, kvote: true, status: 429, melding: "kvote" });
    const r1 = await kjor(datasett([gammel, nyttSur]));
    expect(r1).toMatchObject({ stoppetAvKvote: true, sendt: 0 });
    const r2 = await kjor(datasett([gammel, nyttSur]));
    expect(r2.sendt).toBe(2);
  });

  it("sender ikke til noen som har meldt seg av i mellomtiden", async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    mailer.svar.push({ ok: false, permanent: false, status: 500, melding: "nede" });
    await kjor(datasett([gammel, nyttSur]));
    await slettAbonnement(kv, CONFIG.secret, "abonnent0000000001");
    const r = await kjor(datasett([gammel, nyttSur]));
    expect(r.sendt).toBe(0);
    expect(mailer.sendt).toHaveLength(0);
  });

  it("varsler ikke ved mistenkelig mange nye tilsyn (f.eks. nye ID-er)", async () => {
    await kjor(datasett([gammel]));
    await aktiv("abonnent0000000001");
    const r = await kjor(datasett([gammel, nyttSur, iBergen]), { maksNye: 1 });
    expect(r.modus).toBe("anomali");
    expect(mailer.sendt).toHaveLength(0);
    expect((await kjor(datasett([gammel, nyttSur, iBergen]))).nye).toBe(0);
  });

  it("glemmer tilsyn som faller ut av vinduet", async () => {
    await kjor(datasett([gammel]));
    expect(await kv.cmd("SCARD", NOKLER.sett)).toBe(1);
    await kjor(datasett([gammel], "2027-01-01T00:00:00Z"));
    expect(await kv.cmd("SCARD", NOKLER.sett)).toBe(0);
  });
});
