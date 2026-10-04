import { describe, expect, it } from "vitest";
import { anmerkninger, ferskeTilsyn, ferskType, kontekst, rssXml } from "@/lib/siste";
import type { Sted, Tilsyn } from "@/lib/types";

const t = (dato: string, karakter: number, temaer: Tilsyn["temaer"] = [0, 0, 0, 0], oppfolging = false): Tilsyn => ({
  dato,
  karakter,
  temaer,
  oppfolging,
});

const sted = (slug: string, navn: string, tilsyn: Tilsyn[]): Sted => ({
  id: slug,
  slug,
  navn,
  orgnr: null,
  adresse: "Gata 1",
  postnr: "0150",
  poststed: "OSLO",
  kommunenr: "0301",
  kommune: "Oslo",
  fylkenr: "03",
  fylke: "Oslo",
  kjede: null,
  kjedeSlug: null,
  kategori: "annet",
  lng: 10.7,
  lat: 59.9,
  tilsyn,
});

const steder = [
  sted("comeback", "Comeback Café", [t("2026-09-01", 3, [3, 0, 2, 0]), t("2026-09-28", 0, [0, 0, 0, 0], true)]),
  sted("fall", "Fall & Co <Bar>", [t("2025-01-01", 0), t("2026-09-30", 2, [0, 2, 0, 1])]),
  sted("ny", "Nykommer", [t("2026-10-01", 1)]),
  sted("gammel", "Gammel", [t("2026-01-01", 3)]),
  sted("stabil", "Stabil", [t("2025-05-05", 0), t("2026-10-02", 0)]),
];

describe("ferskeTilsyn", () => {
  it("classifies inspections in the window into stories", () => {
    const liste = ferskeTilsyn(steder, "2026-10-02", 14);
    expect(liste.map((f) => [f.sted.slug, f.type])).toEqual([
      ["stabil", "smil"],
      ["ny", "ny"],
      ["fall", "strek"],
      ["comeback", "comeback"],
    ]);
  });

  it("explains what changed", () => {
    const [stabil, ny, fall, comeback] = ferskeTilsyn(steder, "2026-10-02", 14);
    expect(kontekst(comeback)).toBe("Fra sur munn til smil");
    expect(kontekst(fall)).toBe("Hadde smil sist");
    expect(kontekst(ny)).toBe("Første tilsyn");
    expect(kontekst(stabil)).toBeNull();
    expect(fall.anmerkninger).toEqual(["Lokaler"]);
  });

  it("handles unknown and first-time bad results", () => {
    expect(ferskType(t("2026-10-01", -1), null)).toBe("ukjent");
    expect(ferskType(t("2026-10-01", 3), null)).toBe("sur");
    expect(anmerkninger(t("x", 3, [3, 2, 1, 5]))).toEqual(["Rutiner", "Lokaler"]);
  });
});

describe("rssXml", () => {
  it("includes only news items and escapes names", () => {
    const xml = rssXml(ferskeTilsyn(steder, "2026-10-02", 14), "https://smilefjeskartet.no", "2026-10-03T06:00:00Z");
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("Strekmunn: Fall &amp; Co &lt;Bar&gt;, Oslo");
    expect(xml).toContain("<link>https://smilefjeskartet.no/sted/comeback</link>");
    expect(xml).toContain("<pubDate>Wed, 30 Sep 2026 12:00:00 GMT</pubDate>");
    expect(xml).not.toContain("Nykommer");
  });
});
