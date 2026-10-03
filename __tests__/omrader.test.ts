import { describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
import type { Sted, Tilsyn } from "@/lib/types";

const steder: Sted[] = [];
vi.mock("@/lib/server/data", () => ({ getSteder: () => steder }));

import { GET } from "@/app/(site)/analyse/kommuner.csv/route";
import { fylker, fylkeSlugFraNr, getOmrade, kjeder, kommuneSlug, kommuner, omradePerAar, plassering, rangert } from "@/lib/server/omrader";

function sted(id: string, kommunenr: string, kommune: string, fylkenr: string, fylke: string, tilsyn: Tilsyn[], kjede: string | null = null): Sted {
  return {
    id, slug: id, navn: id, orgnr: null, adresse: "", postnr: "", poststed: "",
    kommunenr, kommune, fylkenr, fylke, kategori: "annet", kjede, kjedeSlug: kjede?.toLowerCase() ?? null,
    lng: null, lat: null, tilsyn,
  };
}
const t = (karakter: number, oppfolging = false): Tilsyn => ({ dato: "2025-12-31", karakter, oppfolging, temaer: [karakter, 0, 0, 0] });
steder.push(
  sted("heroy-nord", "1818", "Herøy", "18", "Nordland", Array.from({ length: 50 }, () => t(0))),
  sted("heroy-nord-2", "1818", "Herøy", "18", "Nordland", [t(3), t(0, true), t(3), t(0, true), t(3)]),
  sted("heroy-more", "1515", "Herøy", "15", "Møre og Romsdal", Array.from({ length: 49 }, () => t(0))),
  ...Array.from({ length: 10 }, (_, i) => sted(`stor-${i}`, "0301", "Oslo", "03", "Oslo", [t(0)], "Storkjede")),
  ...Array.from({ length: 9 }, (_, i) => sted(`liten-${i}`, "0301", "Oslo", "03", "Oslo", [t(3), t(3)], "Litenkjede")),
);

describe("area pages and CSV use the same dataset", () => {
  it("disambiguates equal municipality names and resolves links by municipality number", () => {
    expect(kommuner()).toHaveLength(3);
    expect(kommuneSlug("1818")).toBe("heroy-nordland");
    expect(kommuneSlug("1515")).toBe("heroy-more-og-romsdal");
    expect(getOmrade("kommune", "heroy")).toBeNull();
    expect(getOmrade("kommune", "heroy-nordland")?.visningsnavn).toBe("Herøy (Nordland)");
    expect(kommuneSlug(null)).toBeNull();
    expect(kommuneSlug("9999")).toBeNull();
    expect(fylkeSlugFraNr("15")).toBe("more-og-romsdal");
  });

  it("excludes follow-up inspections from outcomes and annual comparisons", () => {
    const nord = getOmrade("kommune", "heroy-nordland")!;
    expect(nord.ordinaer).toEqual({ total: 53, smil: 50, strek: 0, sur: 3 });
    expect(nord.tilsyn).toBe(55);
    expect(omradePerAar(nord).at(-1)?.ordinaer).toEqual(nord.ordinaer);
    expect(omradePerAar(nord).at(-1)?.delvis).toBe(false);
    expect(fylker()).toHaveLength(3);
    expect(getOmrade("fylke", "nordland")?.ordinaer).toEqual(nord.ordinaer);
  });

  it("applies sample thresholds to rankings while retaining the smaller area pages", () => {
    expect(rangert("kommune").map((k) => k.id)).toEqual(["1818"]);
    expect(plassering(getOmrade("kommune", "heroy-more-og-romsdal")!)).toBeNull();
    expect(plassering(getOmrade("kommune", "heroy-nordland")!)).toEqual({ plass: 1, av: 1 });
    expect(kjeder()).toHaveLength(2);
    expect(rangert("kjede").map((k) => k.navn)).toEqual(["Storkjede"]);
    expect(getOmrade("kjede", "litenkjede")?.steder).toHaveLength(9);
  });

  it("exports all municipalities with leading-zero IDs, outcome totals and valid page links", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const csv = await response.text();
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(3);
    expect(parsed.data.find((r) => r.kommunenr === "0301")?.kommune).toBe("Oslo");
    expect(parsed.data.find((r) => r.kommunenr === "1818")).toMatchObject({
      kommune: "Herøy", tilsyn_alle: "55", ordinaere_tilsyn: "53", smil: "50", sur_munn: "3",
      rangert_min_50: "ja", url: "https://smilefjeskartet.no/kommune/heroy-nordland",
    });
    expect(parsed.data.find((r) => r.kommunenr === "1515")?.rangert_min_50).toBe("nei");
  });
});
