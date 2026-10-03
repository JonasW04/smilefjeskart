import { describe, expect, it } from "vitest";
import { lagToken, nyId, verifiserToken } from "@/lib/varsling/token";
import { gyldigEpost, iNorge, maskerEpost, validerAbonnement } from "@/lib/varsling/validering";

const S = "en-hemmelighet-som-er-minst-32-tegn-lang!!";
const id = nyId();

describe("token", () => {
  it("signerer og verifiserer", () => {
    const t = lagToken(S, { f: "bekreft", id, exp: 2000 });
    expect(verifiserToken(S, t, "bekreft", 1000)).toEqual({ ok: true, data: { f: "bekreft", id, exp: 2000 } });
  });

  it("avviser utløpte bekreftelser", () => {
    const t = lagToken(S, { f: "bekreft", id, exp: 2000 });
    expect(verifiserToken(S, t, "bekreft", 2001)).toEqual({ ok: false, grunn: "utlopt" });
  });

  it("krever utløp på bekreftelser, men ikke på avmelding", () => {
    expect(verifiserToken(S, lagToken(S, { f: "bekreft", id }), "bekreft").ok).toBe(false);
    expect(verifiserToken(S, lagToken(S, { f: "avmeld", id }), "avmeld", 9e12).ok).toBe(true);
  });

  it("kan ikke brukes til et annet formål", () => {
    const t = lagToken(S, { f: "avmeld", id });
    expect(verifiserToken(S, t, "bekreft").ok).toBe(false);
  });

  it("avviser forfalskninger og søppel", () => {
    const t = lagToken(S, { f: "bekreft", id, exp: 2000 });
    const [payload, sig] = t.split(".");
    const falsk = Buffer.from(JSON.stringify({ f: "bekreft", id: nyId(), exp: 2000 })).toString("base64url");
    expect(verifiserToken(S, `${falsk}.${sig}`, "bekreft", 1000).ok).toBe(false);
    expect(verifiserToken(S, `${payload}.${sig.slice(0, -2)}AA`, "bekreft", 1000).ok).toBe(false);
    expect(verifiserToken("en-annen-hemmelighet-som-er-lang-nok-123", t, "bekreft", 1000).ok).toBe(false);
    for (const s of [null, undefined, "", "abc", "a.b.c", `${payload}.`, "x".repeat(2000), `${payload}.${sig}!`]) {
      expect(verifiserToken(S, s, "bekreft", 1000).ok).toBe(false);
    }
  });

  it("lager tilfeldige id-er", () => {
    expect(nyId()).not.toBe(nyId());
    expect(nyId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe("validering", () => {
  const finnes = (nr: string) => ["0301", "4601"].includes(nr);
  const gyldig = { epost: " Ola@Example.NO ", omrade: { type: "radius", lat: 59.912345678, lng: 10.7512345, km: 5 }, filtre: ["sur", "strek"] };

  it("godtar og normaliserer en gyldig påmelding", () => {
    const r = validerAbonnement(gyldig, finnes);
    expect(r).toEqual({
      ok: true,
      input: { epost: "ola@example.no", omrade: { type: "radius", lat: 59.912, lng: 10.751, km: 5 }, filtre: ["strek", "sur"] },
    });
  });

  it("validerer e-post", () => {
    for (const e of ["a@b.no", "ola.nordmann+smil@gmail.com", "x@sub.domene.co.uk"]) expect(gyldigEpost(e)).toBe(true);
    for (const e of ["", "ola", "ola@", "@x.no", "ola@x", "ola @x.no", "ola@x..no", ".ola@x.no", "o<l>a@x.no", "ola@x.no\r\nBcc: y@z.no", `${"a".repeat(250)}@x.no`, 42]) {
      expect(gyldigEpost(e)).toBe(false);
    }
  });

  it("krever posisjon i Norge og en radius fra listen", () => {
    expect(iNorge(59.9, 10.7)).toBe(true);
    expect(iNorge(78.2, 15.6)).toBe(true); // Longyearbyen
    expect(iNorge(55.7, 12.6)).toBe(false); // København
    expect(iNorge(NaN, 10)).toBe(false);
    expect(validerAbonnement({ ...gyldig, omrade: { type: "radius", lat: 48.85, lng: 2.35, km: 5 } }, finnes).ok).toBe(false);
    expect(validerAbonnement({ ...gyldig, omrade: { type: "radius", lat: 59.9, lng: 10.7, km: 7 } }, finnes).ok).toBe(false);
    expect(validerAbonnement({ ...gyldig, omrade: { type: "radius", lat: "59.9", lng: 10.7, km: 5 } }, finnes).ok).toBe(false);
  });

  it("krever kommuner som finnes i datasettet", () => {
    const k = (kommuner: unknown) => validerAbonnement({ ...gyldig, omrade: { type: "kommuner", kommuner } }, finnes);
    expect(k(["4601", "0301", "0301"])).toMatchObject({ ok: true, input: { omrade: { type: "kommuner", kommuner: ["0301", "4601"] } } });
    expect(k([]).ok).toBe(false);
    expect(k(["9999"]).ok).toBe(false);
    expect(k(["03011"]).ok).toBe(false);
    expect(k([301]).ok).toBe(false);
    expect(k(Array(11).fill("0301")).ok).toBe(false);
  });

  it("krever gyldige filtre og gir feil per felt", () => {
    const r = validerAbonnement({ epost: "nei", omrade: { type: "sirkel" }, filtre: ["glad"] }, finnes);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.feil).sort()).toEqual(["epost", "filtre", "omrade"]);
    expect(validerAbonnement({ ...gyldig, filtre: [] }, finnes).ok).toBe(false);
    expect(validerAbonnement(null, finnes).ok).toBe(false);
    expect(validerAbonnement([], finnes).ok).toBe(false);
  });

  it("maskerer e-post i logger", () => {
    expect(maskerEpost("feil for ola.nordmann@gmail.com her")).toBe("feil for ol***@g***.com her");
    expect(maskerEpost("ingen adresse")).toBe("ingen adresse");
  });
});
