import { describe, expect, it } from "vitest";
import {
  anmerkningAndel,
  comebacks,
  endringPp,
  feilfrie,
  flestAnmerkninger,
  grupper,
  hittilIAar,
  median,
  oppfolgingstid,
  perAar,
  perMaaned,
  perUkedag,
  rangerEtterSmil,
  sisteDato,
  sisteHeleAar,
  sisteTilsynPeriode,
  temaPerAar,
  temaStatistikk,
  tilCsv,
  unikeSlugs,
  wilson,
} from "@/lib/analyse";
import { aksePst, penSkala, pp, tall } from "@/lib/chart";
import type { Sted, Tilsyn } from "@/lib/types";

const t = (dato: string, karakter: number, oppfolging = false, temaer?: Tilsyn["temaer"]): Tilsyn => ({
  dato,
  karakter,
  temaer: temaer ?? [karakter, 0, 0, 0],
  oppfolging,
});

function sted(id: string, tilsyn: Tilsyn[], extra: Partial<Sted> = {}): Sted {
  return {
    id,
    slug: id,
    navn: id.toUpperCase(),
    orgnr: null,
    adresse: "",
    postnr: "",
    poststed: "",
    kommunenr: null,
    kommune: null,
    fylkenr: null,
    fylke: null,
    kjede: null,
    kjedeSlug: null,
    kategori: "annet",
    lng: null,
    lat: null,
    tilsyn,
    ...extra,
  };
}

const a = sted("a", [t("2015-06-01", 0), t("2016-03-01", 2), t("2016-03-11", 0, true), t("2017-05-01", 0), t("2026-02-01", 1)], {
  kommunenr: "0301",
  kommune: "Oslo",
  kategori: "pizza",
});
const b = sted(
  "b",
  [t("2016-07-01", 3), t("2016-07-04", 0, true), t("2018-01-01", 0), t("2019-01-01", 1), t("2020-01-01", 0), t("2026-09-30", 0)],
  {
    kommunenr: "4601",
    kommune: "Bergen",
    kategori: "sushi",
  },
);
const c = sted("c", [t("2017-01-15", 0), t("2018-01-15", 2), t("2018-01-20", 2, true), t("2018-02-01", 0, true)], {
  kommunenr: "0301",
  kommune: "Oslo",
  kategori: "pizza",
});

describe("helpers", () => {
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("percentage-point change", () => {
    expect(endringPp(0.855, 0.89)).toBe(3.5);
    expect(endringPp(0.9, 0.85)).toBe(-5);
  });

  it("anmerkningAndel avoids division by zero", () => {
    expect(anmerkningAndel({ smil: 0, strek: 0, sur: 0, total: 0 })).toBe(0);
    expect(anmerkningAndel({ smil: 2, strek: 1, sur: 1, total: 4 })).toBe(0.5);
  });

  it("wilson interval contains p and narrows with n", () => {
    const [lo, hi] = wilson(8, 10);
    expect(lo).toBeLessThan(0.8);
    expect(hi).toBeGreaterThan(0.8);
    const [lo2, hi2] = wilson(800, 1000);
    expect(hi2 - lo2).toBeLessThan(hi - lo);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });

  it("sisteDato finds the latest inspection", () => {
    expect(sisteDato([a, b, c])).toBe("2026-09-30");
  });
});

describe("perAar", () => {
  const rader = perAar([a, b, c], "2026-09-30");

  it("starts in 2016 (ignoring the stray 2015 row) and marks the last year as partial", () => {
    expect(rader[0].aar).toBe(2016);
    expect(rader.at(-1)!.aar).toBe(2026);
    expect(rader.at(-1)!.delvis).toBe(true);
    expect(rader.filter((r) => r.delvis)).toHaveLength(1);
    expect(sisteHeleAar(rader)!.aar).toBe(2025);
  });

  it("counts only ordinary inspections in the distribution", () => {
    const r2016 = rader[0];
    expect(r2016.ordinaer).toEqual({ smil: 0, strek: 1, sur: 1, total: 2 });
    expect(r2016.alle).toBe(4);
    expect(r2016.oppfolging).toBe(2);
    const r2018 = rader[2];
    expect(r2018.ordinaer).toEqual({ smil: 1, strek: 1, sur: 0, total: 2 });
  });

  it("a full year is not partial", () => {
    expect(perAar([a], "2025-12-31").at(-1)!.delvis).toBe(false);
  });

  it("compares the same calendar period", () => {
    expect(hittilIAar([a, b], 2026, "09-29")).toEqual({ smil: 1, strek: 0, sur: 0, total: 1 });
    expect(hittilIAar([a, b], 2026, "09-30").total).toBe(2);
  });
});

describe("season and weekdays", () => {
  it("averages volume per year and excludes years outside the range", () => {
    const m = perMaaned([a, b, c], 2016, 2017);
    expect(m).toHaveLength(12);
    expect(m[2].alle).toBe(1); // mars 2016: 2 tilsyn over 2 år
    expect(m[0].ordinaer.total).toBe(1); // jan. 2017 (c)
    expect(m[1].ordinaer.total).toBe(0); // feb. 2026 utenfor
  });

  it("weekday counts start on Monday", () => {
    // 2026-02-02 er en mandag, 2026-02-08 en søndag
    const s = sted("w", [t("2026-02-02", 0), t("2026-02-08", 0)]);
    expect(perUkedag([s])).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });
});

describe("temaer", () => {
  it("counts breaches per tema and which tema set the face", () => {
    const s = sted("t", [
      t("2020-01-01", 2, false, [0, 2, 1, -1]),
      t("2020-01-05", 0, true, [0, 2, 0, 0]),
      t("2021-01-01", 3, false, [3, 3, 0, 0]),
      t("2022-01-01", 0, false, [0, 0, 0, 5]),
    ]);
    const { rader, daarlige } = temaStatistikk([s]);
    expect(daarlige).toBe(2);
    expect(rader[0]).toMatchObject({ vurdert: 3, strek: 0, sur: 1, feltSmilet: 1 });
    expect(rader[1]).toMatchObject({ vurdert: 3, strek: 1, sur: 1, feltSmilet: 2 });
    expect(rader[3].vurdert).toBe(1); // -1 og 5 telles ikke
    const perAar = temaPerAar([s], 2020, 2022);
    expect(perAar[0].andel[1]).toBe(1);
    expect(perAar[2].andel[1]).toBe(0);
    expect(perAar[0].andel[3]).toBe(0); // ingen vurdert → 0, ikke NaN
  });
});

describe("grupper and ranking", () => {
  it("groups places and ranks by ordinary smile share with a minimum sample", () => {
    const g = grupper([a, b, c], (s) => s.kommune);
    expect(g.get("Oslo")!.steder).toBe(2);
    expect(g.get("Oslo")!.ordinaer.total).toBe(6);
    expect(g.get("Bergen")!.ordinaer).toEqual({ smil: 4, strek: 0, sur: 1, total: 5 });
    const r = rangerEtterSmil(g.values());
    expect(r.map((x) => x.key)).toEqual(["Bergen", "Oslo"]);
    expect(rangerEtterSmil(g.values(), 6).map((x) => x.key)).toEqual(["Oslo"]);
  });

  it("skips null keys", () => {
    expect(grupper([a, sted("x", [t("2020-01-01", 0)])], (s) => s.kommune).size).toBe(1);
  });
});

describe("follow-ups and standouts", () => {
  it("measures days until the next inspection after strek and sur", () => {
    const o = oppfolgingstid([a, b, c]);
    expect(o.sur).toMatchObject({ n: 1, medianDager: 3, innen30: 1, nesteSmil: 1 });
    // a: 10 dager → smil; c: 5 dager → strek, så 12 dager → smil
    expect(o.strek.n).toBe(3);
    expect(o.strek.medianDager).toBe(10);
    expect(o.strek.nesteSmil).toBeCloseTo(2 / 3);
  });

  it("finds comebacks: sur munn followed only by smiles", () => {
    const cb = comebacks([a, b, c], 3);
    expect(cb).toHaveLength(1);
    expect(cb[0]).toMatchObject({ surDato: "2016-07-01", smilPaaRad: 4 });
    const verre = sted("v", [t("2016-01-01", 3), t("2017-01-01", 0), t("2018-01-01", 0), t("2019-01-01", 0), t("2020-01-01", 2)]);
    expect(comebacks([verre], 1)).toHaveLength(0);
  });

  it("finds flawless and frequently flagged places", () => {
    const f = sted(
      "f",
      [1, 2, 3, 4, 5].map((i) => t(`201${i}-01-01`, 0)),
    );
    expect(feilfrie([a, b, f], 5).map((x) => x.sted.id)).toEqual(["f"]);
    expect(flestAnmerkninger([a, b, c], 1).map((x) => x.sted.id)).toEqual(["b", "a", "c"]);
  });

  it("lists the latest inspections, newest first", () => {
    const n = sisteTilsynPeriode([a, b, c], "2026-09-30", 7);
    expect(n).toHaveLength(1);
    expect(n[0].sted.id).toBe("b");
    expect(sisteTilsynPeriode([a, b, c], "2026-09-30", 300).map((x) => x.tilsyn.dato)).toEqual(["2026-09-30", "2026-02-01"]);
  });
});

describe("slugs and csv", () => {
  it("makes colliding names unique by suffixing all of them", () => {
    const k = [
      { nr: "1515", navn: "Herøy", fylke: "Møre og Romsdal" },
      { nr: "1818", navn: "Herøy", fylke: "Nordland" },
      { nr: "0301", navn: "Oslo", fylke: "Oslo" },
    ];
    const m = unikeSlugs(
      k,
      (x) => x.navn.toLowerCase().replace("ø", "o"),
      (x) => `${x.navn}-${x.fylke}`.toLowerCase().replace(/ø/g, "o").replace(/ /g, "-"),
    );
    expect([...m.values()]).toEqual(["heroy-more-og-romsdal", "heroy-nordland", "oslo"]);
  });

  it("guards against remaining collisions", () => {
    const m = unikeSlugs(
      [{ id: 1 }, { id: 2 }],
      () => "a",
      () => "b",
    );
    expect([...m.values()]).toEqual(["b", "b-2"]);
  });

  it("escapes CSV cells", () => {
    expect(
      tilCsv(
        ["a", "b"],
        [
          ["Herøy, Nordland", 1.5],
          ['Si "hei"', null],
        ],
      ),
    ).toBe('a,b\n"Herøy, Nordland",1.5\n"Si ""hei""",\n');
  });
});

describe("chart helpers", () => {
  it("makes nice axis scales", () => {
    expect(penSkala(0.26)).toEqual({ maks: 0.3, steg: 0.1, ticks: [0, 0.1, 0.2, 0.3] });
    expect(penSkala(4765).ticks).toEqual([0, 2000, 4000, 6000]);
    expect(penSkala(0.2).maks).toBeCloseTo(0.2);
    expect(penSkala(0)).toEqual({ maks: 1, steg: 1, ticks: [0, 1] });
  });

  it("formats numbers the Norwegian way", () => {
    expect(tall(45035)).toMatch(/^45\s035$/);
    expect(pp(3.5)).toBe("+3,5 pp");
    expect(pp(-1)).toBe("−1,0 pp");
    expect(pp(0.01)).toBe("±0,0 pp");
    expect(aksePst(0.025)).toBe("2,5 %");
    expect(aksePst(0.3)).toBe("30 %");
  });
});
