import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/geo";
import {
  avstandMeter,
  boksRundt,
  formatAvstand,
  naerhetsDom,
  stederInnen,
  velgRadius,
  type NaertSted,
  type Punkt,
} from "@/lib/naerhet";
import type { KartData, KartRad } from "@/lib/types";
import { punktFraUrl, varslingLenke } from "@/lib/varsling/validering";

const SENTRUM: Punkt = { lat: 59.9139, lng: 10.7522 };
const M_PER_LAT = 111_195; // haversine med R = 6371 km

/** Et sted `meter` nord for sentrum. */
const rad = (slug: string, meter: number, siste: number, verste3: number, dato = 20260101, kat = 0): KartRad =>
  [slug, slug.toUpperCase(), "", SENTRUM.lng, SENTRUM.lat + meter / M_PER_LAT, siste, dato, 0, kat, 3, verste3, verste3];

const data = (steder: KartRad[]): KartData => ({
  v: 1,
  generert: "2026-11-19T00:00:00Z",
  kommuner: [["0301", "Oslo", "Oslo"]],
  kategorier: ["annet", "pizza"],
  steder,
});

const slugs = (l: NaertSted[]) => l.map((s) => s.rad[0]);

describe("haversine", () => {
  it("gir null for samme punkt og kjente avstander ellers", () => {
    expect(haversineKm(59.91, 10.75, 59.91, 10.75)).toBe(0);
    // Oslo–Bergen i luftlinje er rundt 305 km.
    expect(haversineKm(59.9139, 10.7522, 60.3913, 5.3221)).toBeGreaterThan(300);
    expect(haversineKm(59.9139, 10.7522, 60.3913, 5.3221)).toBeLessThan(310);
  });

  it("måler meter likt i begge retninger", () => {
    const nord = { lat: SENTRUM.lat + 500 / M_PER_LAT, lng: SENTRUM.lng };
    expect(avstandMeter(SENTRUM, nord)).toBeCloseTo(500, 0);
    expect(avstandMeter(nord, SENTRUM)).toBeCloseTo(avstandMeter(SENTRUM, nord), 9);
  });

  it("regner øst–vest med kortere lengdegrader i nord", () => {
    const oest = { lat: SENTRUM.lat, lng: SENTRUM.lng + 0.01 };
    // 0,01 lengdegrad ved 60° N er omtrent halvparten av ved ekvator (~1112 m).
    expect(avstandMeter(SENTRUM, oest)).toBeGreaterThan(540);
    expect(avstandMeter(SENTRUM, oest)).toBeLessThan(570);
  });
});

describe("stederInnen", () => {
  it("tar bare med steder innenfor radiusen, nærmeste først", () => {
    const d = data([rad("langt", 6000, 0, 0), rad("b", 900, 0, 0), rad("a", 100, 0, 0), rad("ost", 0, 0, 0)]);
    // ~3,9 km øst: utenfor en boks som glemmer at lengdegrader er kortere i nord (±0,045°).
    d.steder[3][3] = SENTRUM.lng + 0.07;
    expect(slugs(stederInnen(d, SENTRUM))).toEqual(["a", "b", "ost"]);
    expect(slugs(stederInnen(d, SENTRUM, 1000))).toEqual(["a", "b"]);
  });

  it("filtrerer på kategori", () => {
    const d = data([rad("annet", 100, 0, 0, 20260101, 0), rad("pizza", 200, 0, 0, 20260101, 1)]);
    expect(slugs(stederInnen(d, SENTRUM, 5000, "pizza"))).toEqual(["pizza"]);
  });
});

describe("velgRadius", () => {
  const avstander = (...meter: number[]): NaertSted[] => meter.map((m, i) => ({ rad: rad(`s${i}`, m, 0, 0), meter: m }));

  it("holder seg på 500 m når det er nok steder der", () => {
    expect(velgRadius(avstander(...Array(10).fill(400)))).toBe(500);
  });

  it("utvider til neste radius i glissent område", () => {
    expect(velgRadius(avstander(...Array(4).fill(300), ...Array(6).fill(800)))).toBe(1000);
    expect(velgRadius(avstander(...Array(9).fill(300), 1800))).toBe(2000);
    expect(velgRadius(avstander(...Array(9).fill(300), 4000))).toBe(5000);
  });

  it("stopper på 5 km selv uten nok steder", () => {
    expect(velgRadius(avstander(100, 200))).toBe(5000);
    expect(velgRadius([])).toBe(5000);
  });

  it("tar hensyn til et annet krav om antall", () => {
    expect(velgRadius(avstander(100, 200, 900), 3)).toBe(1000);
  });
});

describe("naerhetsDom", () => {
  // siste / verste 3 år: 0–1 smil, 2 strek, 3 sur, -1 ukjent
  const steder = stederInnen(
    data([
      rad("smil-naer", 50, 0, 0, 20261110),
      rad("strek-naer", 100, 0, 2),
      rad("sur-langt", 400, 0, 3),
      rad("smil-langt", 450, 1, 1),
      rad("strek-langt", 300, 2, 2, 20261115),
      rad("sur-naer", 200, 3, 3),
      rad("ukjent", 250, -1, -1),
      rad("utenfor", 800, 3, 3, 20261118),
    ]),
    SENTRUM,
  );

  it("teller smilefjes etter verste resultat siste 3 år", () => {
    const d = naerhetsDom(steder, 500, "tre-aar");
    expect(d.antall).toBe(7);
    expect(d.telling).toEqual({ smil: 2, strek: 2, sur: 2, ukjent: 1 });
    expect(d.sistKontrollert).toBe("2026-11-15");
  });

  it("teller etter siste tilsyn i den modusen", () => {
    expect(naerhetsDom(steder, 500, "siste").telling).toEqual({ smil: 4, strek: 1, sur: 1, ukjent: 1 });
  });

  it("rangerer verst etter alvorlighet, så avstand", () => {
    expect(slugs(naerhetsDom(steder, 500, "tre-aar").verst)).toEqual(["sur-naer", "sur-langt", "strek-naer", "strek-langt"]);
    expect(slugs(naerhetsDom(steder, 500, "siste").verst)).toEqual(["sur-naer", "strek-langt"]);
  });

  it("rangerer tryggest som smil, nærmeste først", () => {
    expect(slugs(naerhetsDom(steder, 500, "tre-aar").tryggest)).toEqual(["smil-naer", "smil-langt"]);
    expect(slugs(naerhetsDom(steder, 500, "siste").tryggest)).toEqual(["smil-naer", "strek-naer", "sur-langt", "smil-langt"]);
  });

  it("tar med steder i en større radius og kutter listene", () => {
    const d = naerhetsDom(steder, 1000, "tre-aar", 2);
    expect(d.antall).toBe(8);
    expect(slugs(d.verst)).toEqual(["sur-naer", "sur-langt"]);
    expect(d.tryggest).toHaveLength(2);
    expect(d.sistKontrollert).toBe("2026-11-18");
  });

  it("gir en tom dom uten steder", () => {
    expect(naerhetsDom([], 5000, "tre-aar")).toEqual({
      radius: 5000,
      antall: 0,
      telling: { smil: 0, strek: 0, sur: 0, ukjent: 0 },
      sistKontrollert: null,
      verst: [],
      tryggest: [],
    });
  });
});

describe("formatering og lenker", () => {
  it("formaterer avstand", () => {
    expect(formatAvstand(3)).toBe("10 m");
    expect(formatAvstand(347)).toBe("350 m");
    expect(formatAvstand(1240)).toBe("1,2 km");
    expect(formatAvstand(12_400)).toBe("12 km");
  });

  it("lager en boks som dekker radiusen", () => {
    const [v, s, o, n] = boksRundt(SENTRUM, 1000);
    expect(avstandMeter(SENTRUM, { lat: n, lng: SENTRUM.lng })).toBeCloseTo(1000, -1);
    expect(avstandMeter(SENTRUM, { lat: s, lng: SENTRUM.lng })).toBeCloseTo(1000, -1);
    expect(avstandMeter(SENTRUM, { lat: SENTRUM.lat, lng: o })).toBeCloseTo(1000, -1);
    expect(avstandMeter(SENTRUM, { lat: SENTRUM.lat, lng: v })).toBeCloseTo(1000, -1);
  });

  it("lenker til varsling med avrundet posisjon og nærmeste radius som dekker", () => {
    expect(varslingLenke(59.913912, 10.752245, 500)).toBe("/varsling?lat=59.914&lng=10.752&km=2");
    expect(varslingLenke(59.9139, 10.7522, 2000)).toBe("/varsling?lat=59.914&lng=10.752&km=2");
    expect(varslingLenke(59.9139, 10.7522, 5000)).toBe("/varsling?lat=59.914&lng=10.752&km=5");
  });

  it("leser punktet tilbake på varslingssiden", () => {
    expect(punktFraUrl("?lat=59.914&lng=10.752&km=5")).toEqual({ lat: 59.914, lng: 10.752, km: 5 });
    expect(punktFraUrl("?lat=59.914&lng=10.752&km=3")).toEqual({ lat: 59.914, lng: 10.752, km: 2 });
    expect(punktFraUrl("?lat=48.85&lng=2.35")).toBeNull();
    expect(punktFraUrl("?lat=abc&lng=10")).toBeNull();
    expect(punktFraUrl("")).toBeNull();
  });
});
