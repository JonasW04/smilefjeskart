import { describe, expect, it, vi } from "vitest";
import type { Kategori } from "@/lib/classify";
import type { Sted, Tilsyn } from "@/lib/types";

const steder: Sted[] = [];
vi.mock("@/lib/server/data", () => ({
  getSteder: () => steder,
  getDatasett: () => ({ generert: "2026-06-30T00:00:00Z", kilde: "", antallTilsyn: 0, steder }),
}));

import sitemap from "@/app/sitemap";
import { kartLenke, lesUtsnitt } from "@/lib/kart";
import {
  ettAarFor,
  KATEGORI_TEKST,
  lokaleGrupper,
  lokalStats,
  MIN_LOKAL_ORDINAERE,
  MIN_LOKAL_STEDER,
  postnrSerie,
  postnrTekst,
  sorterSteder,
  STROK,
  strokForPostnr,
  utsnitt,
  type SorterbarRad,
} from "@/lib/lokal";
import { getLokalSide, kategoriSideFor, lokaleSider, lokaleSiderFor, lokalPlassering, lokalUrlSti, strokSideFor } from "@/lib/server/lokal";
import { slugify } from "@/lib/text";

const t = (dato: string, karakter: number, oppfolging = false): Tilsyn => ({ dato, karakter, oppfolging, temaer: [karakter, 0, 0, 0] });

let n = 0;
function sted(over: Partial<Sted> & { tilsyn: Tilsyn[] }): Sted {
  const id = `s${n++}`;
  return {
    id,
    slug: id,
    navn: id,
    orgnr: null,
    adresse: "",
    postnr: "9999",
    poststed: "",
    kommunenr: "0301",
    kommune: "Oslo",
    fylkenr: "03",
    fylke: "Oslo",
    kjede: null,
    kjedeSlug: null,
    kategori: "annet",
    lng: null,
    lat: null,
    ...over,
  };
}
const flere = (antall: number, lag: (i: number) => Sted) => Array.from({ length: antall }, (_, i) => lag(i));
const toOrdinaere = () => [t("2025-01-10", 0), t("2026-03-01", 2), t("2026-03-15", 0, true)];

describe("strøk og postnumre", () => {
  it("builds zero-padded postal code ranges", () => {
    expect(postnrSerie(50, 52)).toEqual(["0050", "0051", "0052"]);
    expect(postnrSerie(1250, 1250)).toEqual(["1250"]);
  });

  it("maps every postal code to at most one area, with URL-safe slugs that never collide with categories", () => {
    for (const liste of Object.values(STROK)) {
      const sett = new Set<string>();
      for (const s of liste) {
        expect(slugify(s.slug)).toBe(s.slug);
        for (const p of s.postnr) {
          expect(p).toMatch(/^\d{4}$/);
          expect(sett.has(p), `${p} finnes i to strøk`).toBe(false);
          sett.add(p);
        }
      }
      const slugs = liste.map((s) => s.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const kat of Object.keys(KATEGORI_TEKST)) {
        expect(slugify(kat)).toBe(kat);
        expect(slugs).not.toContain(kat);
      }
    }
  });

  it("looks up areas by municipality and postal code, and leaves border codes unmapped", () => {
    expect(strokForPostnr("0301", "0552")?.slug).toBe("grunerlokka");
    expect(strokForPostnr("0301", "0188")?.slug).toBe("gronland");
    expect(strokForPostnr("0301", "0154")?.slug).toBe("sentrum");
    expect(strokForPostnr("0301", "0366")?.slug).toBe("majorstuen");
    expect(strokForPostnr("0301", "0194")?.navn).toBe("Bjørvika");
    expect(strokForPostnr("0301", "0178")).toBeNull();
    expect(strokForPostnr("4601", "0552")).toBeNull();
    expect(strokForPostnr(null, "0552")).toBeNull();
  });

  it("writes postal codes as compact ranges", () => {
    expect(postnrTekst(["0187", "0185", "0186", "0656", "0190", "0188", "0189"])).toBe("0185–0190 og 0656");
    expect(postnrTekst(["0191", "0194"])).toBe("0191 og 0194");
    expect(postnrTekst(["0050", "0150", "0151", "0153"])).toBe("0050, 0150–0151 og 0153");
    expect(postnrTekst([])).toBe("");
  });
});

describe("lokale grupper", () => {
  const kat = (kategori: Kategori, kommunenr = "0301", kommune = "Oslo") => () =>
    sted({ kategori, kommunenr, kommune, tilsyn: toOrdinaere() });

  it("only creates pages at or above both thresholds and never for «annet»", () => {
    expect(MIN_LOKAL_STEDER).toBe(10);
    expect(MIN_LOKAL_ORDINAERE).toBe(20);
    const liste = [
      ...flere(10, kat("sushi")),
      ...flere(9, kat("pizza")),
      ...flere(30, kat("annet")),
      // Ti kebabsteder, men bare ti ordinære tilsyn: for tynt.
      ...flere(10, () => sted({ kategori: "kebab", tilsyn: [t("2026-01-01", 0), t("2026-02-01", 0, true)] })),
      ...flere(10, kat("sushi", "4601", "Bergen")),
    ];
    const g = lokaleGrupper(liste);
    expect(g.map((x) => `${x.kommunenr}/${x.slug}`)).toEqual(["0301/sushi", "4601/sushi"]);
    expect(g[0]).toMatchObject({ type: "kategori", navn: "Sushi", kategori: "sushi", strok: null, tilsyn: 30 });
    expect(g[0].ordinaer).toEqual({ smil: 10, strek: 10, sur: 0, total: 20 });
  });

  it("groups areas by postal code alongside categories, categories first and largest first", () => {
    const liste = [
      ...flere(10, (i) => sted({ postnr: i % 2 ? "0552" : "0560", tilsyn: toOrdinaere() })),
      ...flere(12, (i) => sted({ postnr: "0188", kategori: i < 11 ? "kebab" : "annet", tilsyn: toOrdinaere() })),
      ...flere(10, () => sted({ postnr: "0178", tilsyn: toOrdinaere() })),
    ];
    const g = lokaleGrupper(liste);
    expect(g.map((x) => x.slug)).toEqual(["kebab", "gronland", "grunerlokka"]);
    expect(g[1]).toMatchObject({ type: "strok", navn: "Grønland", kategori: null });
    expect(g[1].steder).toHaveLength(12);
  });
});

describe("nøkkeltall", () => {
  it("computes one year back from the last inspection date, also from 29 February", () => {
    expect(ettAarFor("2026-06-30")).toBe("2025-06-30");
    expect(ettAarFor("2024-02-29")).toBe("2023-02-28");
  });

  it("finds the worst and best ordinary inspections in the last 12 months", () => {
    const a = sted({ navn: "A", tilsyn: [t("2025-06-30", 3), t("2025-09-01", 2), t("2025-09-20", 0, true), t("2026-05-01", 0)] });
    const b = sted({ navn: "B", tilsyn: [t("2026-01-01", 3), t("2026-01-10", 3, true), t("2026-02-01", 0), t("2026-04-01", 1)] });
    const c = sted({ navn: "C", tilsyn: [t("2026-06-01", 2), t("2026-07-01", 3)] });
    const s = lokalStats([a, b, c], "2026-06-30");
    // 2025-06-30 er utenfor (eksakt ett år), oppfølging og datoer etter sluttDato telles ikke.
    expect(s.sisteAar).toEqual({ smil: 3, strek: 2, sur: 1, total: 6 });
    expect(s.verste.map((v) => `${v.sted.navn} ${v.tilsyn.dato}`)).toEqual(["B 2026-01-01", "C 2026-06-01", "A 2025-09-01"]);
    expect(s.beste.map((v) => `${v.sted.navn} ${v.tilsyn.dato}`)).toEqual(["A 2026-05-01", "B 2026-02-01"]);
    expect(lokalStats([a, b, c], "2026-06-30", 1).verste).toHaveLength(1);
  });

  it("frames the map around the places without being dragged off by a stray coordinate", () => {
    const oslo = flere(99, (i) => sted({ lng: 10.70 + i * 0.001, lat: 59.90 + i * 0.0005, tilsyn: [] }));
    const tromso = sted({ lng: 18.95, lat: 69.65, tilsyn: [] });
    const [v, s, o, nn] = utsnitt([...oslo, tromso, sted({ tilsyn: [] })])!;
    expect(v).toBeGreaterThanOrEqual(10.7);
    expect(o).toBeLessThan(10.8);
    expect(s).toBeGreaterThanOrEqual(59.9);
    expect(nn).toBeLessThan(60);
    expect(utsnitt([sted({ tilsyn: [] })])).toBeNull();
  });

  it("sorts the place list by date, name and share of smiles, with uninspected places last", () => {
    const rad = (navn: string, siste: string, smil: number, total: number): SorterbarRad => ({
      slug: navn, navn, kind: "smil", label: "Smil", under: "", siste, smil, total,
    });
    const rader = [rad("Ørret", "2026-01-01", 1, 4), rad("Alfa", "2025-01-01", 3, 3), rad("Beta", "2026-05-01", 0, 0), rad("Ceta", "2024-01-01", 3, 4)];
    const navn = (l: SorterbarRad[]) => l.map((r) => r.navn);
    expect(navn(sorterSteder(rader, "siste"))).toEqual(["Beta", "Ørret", "Alfa", "Ceta"]);
    expect(navn(sorterSteder(rader, "navn"))).toEqual(["Alfa", "Beta", "Ceta", "Ørret"]);
    expect(navn(sorterSteder(rader, "daarligst"))).toEqual(["Ørret", "Ceta", "Alfa", "Beta"]);
    expect(navn(sorterSteder(rader, "best"))).toEqual(["Alfa", "Ceta", "Ørret", "Beta"]);
    expect(navn(rader)[0]).toBe("Ørret");
  });
});

describe("kartlenker", () => {
  it("reads a start view from the URL and rejects malformed or out-of-country boxes", () => {
    expect(lesUtsnitt("?utsnitt=10.7,59.9,10.8,59.95")).toEqual([10.7, 59.9, 10.8, 59.95]);
    expect(lesUtsnitt("")).toBeNull();
    expect(lesUtsnitt("?utsnitt=10.7,59.9,10.8")).toBeNull();
    expect(lesUtsnitt("?utsnitt=10.7,59.9,x,59.95")).toBeNull();
    expect(lesUtsnitt("?utsnitt=10.7,,10.8,59.95")).toBeNull();
    expect(lesUtsnitt("?utsnitt=10.8,59.9,10.7,59.95")).toBeNull();
    expect(lesUtsnitt("?utsnitt=-120,30,-100,40")).toBeNull();
  });

  it("links to the map with category filter and view", () => {
    expect(kartLenke([10.7, 59.9, 10.8, 59.95], "sushi")).toBe("/?kategori=sushi&utsnitt=10.7%2C59.9%2C10.8%2C59.95");
    expect(lesUtsnitt(kartLenke([10.7, 59.9, 10.8, 59.95]).slice(1))).toEqual([10.7, 59.9, 10.8, 59.95]);
    expect(kartLenke(null)).toBe("/");
  });
});

describe("lokale sider fra datasettet", () => {
  steder.length = 0;
  steder.push(
    ...flere(10, (i) => sted({ slug: `sushi-${i}`, kategori: "sushi", postnr: "0552", tilsyn: [t("2026-03-01", 0), t("2026-04-01", 0)] })),
    ...flere(10, (i) => sted({ slug: `pizza-${i}`, kategori: "pizza", postnr: "0188", tilsyn: [t("2026-03-01", 2), t("2026-04-01", 0)] })),
    sted({ slug: "ensom-kebab", kategori: "kebab", postnr: "0552", tilsyn: [t("2026-03-01", 0)] }),
    ...flere(10, (i) => sted({ slug: `bergen-${i}`, kategori: "kafe", kommunenr: "4601", kommune: "Bergen", fylkenr: "46", fylke: "Vestland", tilsyn: [t("2026-05-01", 0), t("2026-06-01", 0)] })),
  );

  it("resolves pages by municipality slug and sub-slug, and 404s everything else", () => {
    expect(lokaleSider().map(lokalUrlSti)).toEqual([
      "/kommune/oslo/pizza",
      "/kommune/oslo/sushi",
      "/kommune/oslo/grunerlokka",
      "/kommune/oslo/gronland",
      "/kommune/bergen/kafe",
    ]);
    expect(getLokalSide("oslo", "sushi")?.steder).toHaveLength(10);
    expect(getLokalSide("oslo", "grunerlokka")?.steder).toHaveLength(11);
    expect(getLokalSide("oslo", "kebab")).toBeNull();
    expect(getLokalSide("bergen", "sushi")).toBeNull();
    expect(getLokalSide("oslo", "majorstuen")).toBeNull();
    expect(lokaleSiderFor("0301", "strok").map((s) => s.slug)).toEqual(["grunerlokka", "gronland"]);
  });

  it("links a place to its category and area pages only when they exist", () => {
    expect(kategoriSideFor("0301", "sushi")?.slug).toBe("sushi");
    expect(kategoriSideFor("0301", "kebab")).toBeNull();
    expect(kategoriSideFor(null, "sushi")).toBeNull();
    expect(strokSideFor({ kommunenr: "0301", postnr: "0552" })?.navn).toBe("Grünerløkka");
    expect(strokSideFor({ kommunenr: "0301", postnr: "0366" })).toBeNull();
    expect(strokSideFor({ kommunenr: "4601", postnr: "0552" })).toBeNull();
  });

  it("ranks pages of the same type within the municipality by share of smiles", () => {
    expect(lokalPlassering(getLokalSide("oslo", "sushi")!)).toEqual({ plass: 1, av: 2 });
    expect(lokalPlassering(getLokalSide("oslo", "pizza")!)).toEqual({ plass: 2, av: 2 });
    expect(lokalPlassering(getLokalSide("bergen", "kafe")!)).toEqual({ plass: 1, av: 1 });
  });

  it("lists every local page in the sitemap with the latest inspection date", () => {
    const urls = sitemap().filter((e) => /\/kommune\/[^/]+\/[^/]+$/.test(e.url));
    expect(urls.map((e) => e.url)).toEqual(lokaleSider().map((s) => `https://smilefjeskartet.no${lokalUrlSti(s)}`));
    expect(urls.find((e) => e.url.endsWith("/bergen/kafe"))?.lastModified).toEqual(new Date("2026-06-01"));
  });
});
