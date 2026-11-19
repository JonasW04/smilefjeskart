import { describe, expect, it } from "vitest";
import { lesVarslingParams, varslingLenke } from "@/lib/deling";
import { merkeEierLenke, merkeEierTekst, merkeMarkdown } from "@/lib/seo";
import { renRekke } from "@/lib/stats";
import type { Sted, Tilsyn } from "@/lib/types";

const t = (dato: string, karakter: number, oppfolging = false): Tilsyn => ({ dato, karakter, temaer: [karakter, 0, 0, 0], oppfolging });

function sted(tilsyn: Tilsyn[], felter: Partial<Sted> = {}): Sted {
  return {
    id: "x", slug: "kafe-x", navn: "Kafé X", orgnr: null, adresse: "", postnr: "", poststed: "", kommunenr: null, kommune: null,
    fylkenr: null, fylke: null, kjede: null, kjedeSlug: null, kategori: "annet", lng: null, lat: null, tilsyn, ...felter,
  };
}

describe("lesVarslingParams", () => {
  it("leser et punkt i Norge med navn", () => {
    expect(lesVarslingParams({ lat: "59.9139", lng: "10.7522", navn: "Kafé X" })).toEqual({ lat: 59.9139, lng: 10.7522, navn: "Kafé X" });
  });

  it("gir et standardnavn når navn mangler eller er tomt", () => {
    expect(lesVarslingParams({ lat: "59.9", lng: "10.7" })?.navn).toBe("Valgt sted");
    expect(lesVarslingParams({ lat: "59.9", lng: "10.7", navn: "   " })?.navn).toBe("Valgt sted");
  });

  it("bruker første verdi når en parameter går igjen", () => {
    expect(lesVarslingParams({ lat: ["60.39", "1"], lng: ["5.32"], navn: ["Bergen", "Oslo"] })).toEqual({ lat: 60.39, lng: 5.32, navn: "Bergen" });
  });

  it.each([
    [{}],
    [{ lat: "59.9" }],
    [{ lat: "", lng: "10.7" }],
    [{ lat: "abc", lng: "10.7" }],
    [{ lat: "59.9e1", lng: "10.7" }],
    [{ lat: "Infinity", lng: "10.7" }],
    [{ lat: "0x3b", lng: "10.7" }],
    [{ lat: "48.85", lng: "2.35" }], // Paris
    [{ lat: "59.9", lng: "200" }],
  ])("avviser %j", (sp) => {
    expect(lesVarslingParams(sp)).toBeNull();
  });

  it("vasker og kutter navnet", () => {
    expect(lesVarslingParams({ lat: "59.9", lng: "10.7", navn: "Bar\nGrill" })?.navn).toBe("Bar Grill");
    const p = lesVarslingParams({ lat: "59.9", lng: "10.7", navn: `  Bar\n\t "Grill"  ${"x".repeat(200)}` });
    expect(p?.navn.startsWith(`Bar "Grill" x`)).toBe(true);
    expect(p?.navn.length).toBe(80);
  });

  it("leser tilbake det varslingLenke lager", () => {
    const lenke = varslingLenke({ lat: 59.913912345, lng: 10.752212345, navn: "Bar & Grill" });
    expect(lenke).toBe("/varsling?lat=59.9139&lng=10.7522&navn=Bar+%26+Grill");
    const sp = Object.fromEntries(new URL(lenke, "https://smilefjeskartet.no").searchParams);
    expect(lesVarslingParams(sp)).toEqual({ lat: 59.9139, lng: 10.7522, navn: "Bar & Grill" });
  });
});

describe("renRekke", () => {
  const iDag = "2023-12-01";

  it("finner rekka fra første tilsyn når alt er smil", () => {
    expect(renRekke(sted([t("2019-03-01", 0), t("2021-05-01", 1), t("2023-06-01", 0)]), iDag)).toEqual({ fra: "2019-03-01", ordinaere: 3, siden: "2019" });
  });

  it("starter etter siste tilsyn uten smil", () => {
    const s = sted([t("2018-01-01", 0), t("2019-02-01", 2), t("2020-04-01", 0), t("2022-01-01", 1), t("2023-11-01", 0)]);
    expect(renRekke(s, iDag)).toEqual({ fra: "2020-04-01", ordinaere: 3, siden: "2020" });
  });

  it("tar med måneden når bruddet var samme år", () => {
    const s = sted([t("2020-02-01", 3), t("2020-03-10", 0, true), t("2021-01-01", 0), t("2022-01-01", 0), t("2023-01-01", 0)]);
    expect(renRekke(s, iDag)).toEqual({ fra: "2020-03-10", ordinaere: 3, siden: "mars 2020" });
  });

  it("teller ikke oppfølgingstilsyn mot minstekravet", () => {
    const s = sted([t("2020-01-01", 2), t("2020-02-01", 0, true), t("2021-01-01", 0), t("2022-01-01", 0)]);
    expect(renRekke(s, iDag)).toBeNull();
    expect(renRekke(s, iDag, { minOrdinaere: 2 })?.ordinaere).toBe(2);
  });

  it("gir null når siste tilsyn ikke er smil", () => {
    expect(renRekke(sted([t("2019-01-01", 0), t("2020-01-01", 0), t("2021-01-01", 0), t("2022-01-01", 2)]), iDag)).toBeNull();
  });

  it("gir null når siste tilsyn er over to år gammelt", () => {
    const s = sted([t("2019-01-01", 0), t("2020-01-01", 0), t("2022-12-01", 0)]);
    expect(renRekke(s, "2024-11-30")?.siden).toBe("2019");
    expect(renRekke(s, "2025-01-01")).toBeNull();
  });

  it("lar et tilsyn uten karakter bryte rekka", () => {
    const s = sted([t("2018-01-01", 0), t("2019-01-01", -1), t("2020-01-01", 0), t("2021-01-01", 0), t("2022-01-01", 0)]);
    expect(renRekke(s, iDag)?.fra).toBe("2020-01-01");
  });
});

describe("merke-snutter", () => {
  it("lager Markdown som lenker merket til stedsiden", () => {
    expect(merkeMarkdown(sted([t("2025-01-01", 0)]))).toBe(
      "[![Se smilefjeset til Kafé X på smilefjeskartet.no](https://smilefjeskartet.no/sted/kafe-x/merke.png)](https://smilefjeskartet.no/sted/kafe-x)",
    );
  });

  it("escaper klammer og skråstrek i Markdown-teksten", () => {
    const md = merkeMarkdown(sted([t("2025-01-01", 0)], { navn: "Pub [Sentrum] \\o/" }));
    expect(md).toContain("Se smilefjeset til Pub \\[Sentrum\\] \\\\o/ på");
    expect(md.endsWith("](https://smilefjeskartet.no/sted/kafe-x)")).toBe(true);
  });

  it("peker eierlenken på merke-delen av siden", () => {
    expect(merkeEierLenke(sted([t("2025-01-01", 0)]))).toBe("https://smilefjeskartet.no/sted/kafe-x#merke");
  });

  it("nevner rekka i meldingen til eieren bare når den finnes", () => {
    const s = sted([t("2025-01-01", 0)]);
    expect(merkeEierTekst(s, "2019")).toBe(
      "Hei! Kafé X har fått smil på alle tilsyn fra Mattilsynet siden 2019. Smilefjeskartet.no har et gratis merke dere kan vise på nettsiden. Det oppdaterer seg selv etter hvert tilsyn fra Mattilsynet:",
    );
    expect(merkeEierTekst(s, null)).toBe(
      "Hei! Smilefjeskartet.no har et gratis merke Kafé X kan vise på nettsiden. Det oppdaterer seg selv etter hvert tilsyn fra Mattilsynet:",
    );
  });
});
