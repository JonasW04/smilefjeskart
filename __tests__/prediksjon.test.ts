import { describe, expect, it } from "vitest";
import { BESOK_SKJEMA, UTFALL_SKJEMA, besokRad, boette, utfallRad, type BesokKontekst } from "@/lib/prediksjon/egenskaper";
import { forberedTilsyn, historikkFoer, ordinaerMellom, TYPISK_INTERVALL } from "@/lib/prediksjon/historikk";
import { besokKontekst, lagOmraader, utfallKontekst } from "@/lib/prediksjon/kontekst";
import { cholesky, MatriseBygger, prediker, predikerAlle, tren, velgRader } from "@/lib/prediksjon/logistisk";
import { auc, brier, evaluer, kalibrering, oppslagsmodell, treffITopp } from "@/lib/prediksjon/metrikker";
import { dagnr, forsteIkkeMindre, isoFraDagnr, maanedFraDagnr, maanedsstarter } from "@/lib/prediksjon/tid";
import { iVindu, krympetAndel, lagTidsserie } from "@/lib/prediksjon/tidsserie";
import { besokEksempler, forberedSteder, tilbaketest, utfallEksempler } from "@/lib/prediksjon/trening";
import type { Sted, Tilsyn } from "@/lib/types";

const t = (dato: string, karakter: number, oppfolging = false): Tilsyn => ({ dato, karakter, temaer: [karakter, 0, 0, 0], oppfolging });

function sted(id: string, tilsyn: Tilsyn[], kommunenr = "0301", fylkenr = "03"): Sted {
  return {
    id, slug: id, navn: id, orgnr: null, adresse: "", postnr: "", poststed: "", kommunenr, kommune: kommunenr,
    fylkenr, fylke: fylkenr, kjede: null, kjedeSlug: null, kategori: "annet", lng: null, lat: null, tilsyn,
  };
}

/** Deterministisk pseudo-tilfeldig tallgenerator (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe("tid", () => {
  it("round-trips ISO dates", () => {
    expect(isoFraDagnr(dagnr("2024-02-29"))).toBe("2024-02-29");
    expect(dagnr("2024-03-01") - dagnr("2024-02-28")).toBe(2);
    expect(dagnr("2026-10-03T22:25:11.879Z")).toBe(dagnr("2026-10-03"));
    expect(maanedFraDagnr(dagnr("2024-12-31"))).toBe(11);
  });

  it("lists first-of-month dates", () => {
    const m = maanedsstarter(dagnr("2023-11-15"), dagnr("2024-02-01")).map(isoFraDagnr);
    expect(m).toEqual(["2023-12-01", "2024-01-01", "2024-02-01"]);
    expect(maanedsstarter(dagnr("2024-01-01"), dagnr("2024-01-31")).map(isoFraDagnr)).toEqual(["2024-01-01"]);
  });

  it("binary searches", () => {
    expect(forsteIkkeMindre([1, 3, 3, 5], 3)).toBe(1);
    expect(forsteIkkeMindre([1, 3, 3, 5], 4)).toBe(3);
    expect(forsteIkkeMindre([1, 3, 3, 5], 9)).toBe(4);
    expect(forsteIkkeMindre([], 1)).toBe(0);
  });
});

describe("historikkFoer", () => {
  const tilsyn = forberedTilsyn([
    t("2020-01-01", 0),
    t("2021-01-01", 2),
    t("2021-01-10", 0, true),
    t("2022-01-01", 1),
    t("2023-01-01", 3),
  ]);

  it("returns null before the first inspection", () => {
    expect(historikkFoer(tilsyn, dagnr("2020-01-01"))).toBeNull();
  });

  it("only sees inspections strictly before the cut-off day", () => {
    const h = historikkFoer(tilsyn, dagnr("2022-01-01"))!;
    expect(h.antall).toBe(3);
    expect(h.antallOrdinaere).toBe(2);
    expect(h.sisteOrdinaerKarakter).toBe(2);
    expect(h.antallStrek).toBe(1);
    expect(h.antallSur).toBe(0);
    expect(h.dagerSidenOrdinaer).toBe(dagnr("2022-01-01") - dagnr("2021-01-01"));
    expect(h.dagerSidenDaarlig).toBe(h.dagerSidenOrdinaer);
    expect(h.venterOppfolging).toBe(false);
  });

  it("is unaffected by anything on or after the cut-off", () => {
    const dag = dagnr("2022-06-01");
    const endret = forberedTilsyn([...tilsyn.map((x) => ({ dato: isoFraDagnr(x.dag), karakter: x.karakter, temaer: [0, 0, 0, 0] as Tilsyn["temaer"], oppfolging: x.oppfolging })), t("2022-06-01", 3), t("2024-01-01", 3)]);
    const a = historikkFoer(tilsyn, dag)!;
    const b = historikkFoer(endret, dag)!;
    expect(b.antallSur).toBe(a.antallSur);
    expect(b.dagerSidenOrdinaer).toBe(a.dagerSidenOrdinaer);
    expect(b.intervall).toBe(a.intervall);
  });

  it("flags a pending follow-up and shrinks the interval", () => {
    const h = historikkFoer(tilsyn, dagnr("2023-01-05"))!;
    expect(h.venterOppfolging).toBe(true);
    expect(h.antallSur).toBe(1);
    const gaps = dagnr("2023-01-01") - dagnr("2020-01-01");
    expect(h.antallIntervaller).toBe(3);
    expect(h.intervall).toBeCloseTo((gaps + TYPISK_INTERVALL) / 4);
  });

  it("checks for an ordinary inspection in a window", () => {
    expect(ordinaerMellom(tilsyn, dagnr("2021-01-05"), dagnr("2021-02-01"))).toBe(false); // bare oppfølging
    expect(ordinaerMellom(tilsyn, dagnr("2021-12-01"), dagnr("2022-01-01"))).toBe(false); // vinduet er halvåpent
    expect(ordinaerMellom(tilsyn, dagnr("2021-12-01"), dagnr("2022-01-02"))).toBe(true);
  });
});

describe("tidsserie", () => {
  it("counts events in half-open windows", () => {
    const ts = lagTidsserie([{ dag: 5, verdi: 1 }, { dag: 1, verdi: 0 }, { dag: 5, verdi: 1 }, { dag: 9, verdi: 0 }]);
    expect(iVindu(ts, 0, 5)).toEqual({ antall: 1, sum: 0 });
    expect(iVindu(ts, 5, 10)).toEqual({ antall: 3, sum: 2 });
    expect(iVindu(ts, 6, 6)).toEqual({ antall: 0, sum: 0 });
  });

  it("shrinks towards a prior", () => {
    expect(krympetAndel(0, 0, 0.2, 10)).toBeCloseTo(0.2);
    expect(krympetAndel(5, 10, 0.2, 10)).toBeCloseTo(0.35);
  });
});

describe("egenskaper", () => {
  const h = historikkFoer(forberedTilsyn([t("2020-01-01", 0), t("2021-01-01", 2)]), dagnr("2021-06-01"))!;
  const k: BesokKontekst = { kommune90: 0.2, kommune365: 0.8, fylke90: 0.2, land90: 0.2, maaned: 5 };

  it("buckets values", () => {
    expect(boette(10, [60, 120])).toBe(0);
    expect(boette(60, [60, 120])).toBe(1);
    expect(boette(500, [60, 120])).toBe(2);
  });

  it("always emits every continuous feature exactly once", () => {
    for (const [skjema, rad] of [
      [BESOK_SKJEMA, besokRad(h, "pizza", true, k)],
      [UTFALL_SKJEMA, utfallRad(h, "pizza", false, { landRate: 0.12, land3Rate: 0.14, fylkeRate: 0.15, kommuneRate: 0.2 })],
    ] as const) {
      const antallKont = skjema.kont.filter(Boolean).length;
      expect(rad.idx.filter((i) => skjema.kont[i]).length).toBe(antallKont);
      expect(new Set(rad.idx).size).toBe(rad.idx.length);
      expect(rad.val.every(Number.isFinite)).toBe(true);
    }
  });

  it("encodes the last result and month", () => {
    const rad = besokRad(h, "pizza", true, k);
    const navn = rad.idx.map((i) => BESOK_SKJEMA.navn[i]);
    expect(navn).toContain("sist:2");
    expect(navn).toContain("mnd:5");
    expect(navn).toContain("kat:pizza");
    expect(navn).toContain("kjede");
    expect(navn).toContain("daarlig:0");
  });
});

describe("logistisk regresjon", () => {
  it("solves linear systems with Cholesky", () => {
    const A = Float64Array.from([4, 2, 2, 3]);
    const x = cholesky(A, Float64Array.from([2, 1]), 2);
    expect(4 * x[0] + 2 * x[1]).toBeCloseTo(2);
    expect(2 * x[0] + 3 * x[1]).toBeCloseTo(1);
  });

  it("recovers known coefficients from simulated data", () => {
    const r = rng(42);
    const skjema = { navn: ["x", "b"], kont: [true, false], indeks: new Map([["x", 0], ["b", 1]]) };
    const X = new MatriseBygger(2);
    const y: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const x = r() * 4 - 2;
      const b = r() < 0.3;
      const z = -1 + 1.5 * x + (b ? 0.8 : 0);
      X.leggTil(b ? { idx: [0, 1], val: [x, 1] } : { idx: [0], val: [x] });
      y.push(r() < 1 / (1 + Math.exp(-z)) ? 1 : 0);
    }
    const m = tren(X.bygg(), y, skjema, { l2: 0.01 });
    // Tilbake til rå skala: vekt / std og skjæring justert for snittet.
    const wx = m.vekter[0] / m.std[0];
    expect(wx).toBeCloseTo(1.5, 1);
    expect(m.vekter[1]).toBeCloseTo(0.8, 1);
    expect(m.skjaering - (m.vekter[0] * m.snitt[0]) / m.std[0]).toBeCloseTo(-1, 1);
    const p = prediker(m, { idx: [0, 1], val: [0.5, 1] });
    expect(p).toBeCloseTo(1 / (1 + Math.exp(-(-1 + 0.75 + 0.8))), 1);
  });

  it("shrinks weights with stronger L2 and predicts consistently", () => {
    const skjema = { navn: ["a"], kont: [false], indeks: new Map([["a", 0]]) };
    const X = new MatriseBygger(1);
    const y: number[] = [];
    for (let i = 0; i < 200; i++) {
      X.leggTil(i % 2 ? { idx: [0], val: [1] } : { idx: [], val: [] });
      y.push(i % 2 ? (i % 3 ? 1 : 0) : i % 5 === 0 ? 1 : 0);
    }
    const M = X.bygg();
    const svak = tren(M, y, skjema, { l2: 0.001 });
    const sterk = tren(M, y, skjema, { l2: 1000 });
    expect(Math.abs(sterk.vekter[0])).toBeLessThan(Math.abs(svak.vekter[0]));
    const alle = predikerAlle(svak, M);
    expect(alle[1]).toBeCloseTo(prediker(svak, { idx: [0], val: [1] }));
    expect(velgRader(M, [1, 3]).rader).toBe(2);
  });
});

describe("metrikker", () => {
  it("computes AUC with ties", () => {
    expect(auc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])).toBe(1);
    expect(auc([1, 1, 0, 0], [0.1, 0.2, 0.8, 0.9])).toBe(0);
    expect(auc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])).toBe(0.5);
    // Den ene positive (0,5) rangeres over to av tre negative.
    expect(auc([0, 1, 0, 0], [0.1, 0.5, 0.3, 0.9])).toBeCloseTo(2 / 3);
  });

  it("computes Brier, top-decile hits and skill", () => {
    expect(brier([1, 0], [0.5, 0.5])).toBe(0.25);
    expect(treffITopp([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0.1], 0.1)).toBe(1);
    const m = evaluer([1, 0], [1, 0], 0.25);
    expect(m.brier).toBe(0);
    expect(m.brierSkill).toBe(1);
  });

  it("bins calibration into equal-sized groups", () => {
    const p = Array.from({ length: 100 }, (_, i) => i / 100);
    const y = p.map((x) => (x >= 0.5 ? 1 : 0));
    const k = kalibrering(y, p, 10);
    expect(k).toHaveLength(10);
    expect(k[0]).toEqual({ predikert: expect.closeTo(0.045, 5), faktisk: 0, n: 10 });
    expect(k[9].faktisk).toBe(1);
  });

  it("builds a shrunk lookup baseline", () => {
    const f = oppslagsmodell([1, 1, 2, 2], [1, 1, 0, 0], 2);
    expect(f(1)).toBeCloseTo((2 + 0.5 * 2) / 4);
    expect(f(99)).toBeCloseTo(0.5);
  });
});

describe("trening uten lekkasje", () => {
  const r = rng(7);
  const steder: Sted[] = [];
  for (let i = 0; i < 120; i++) {
    const tilsyn: Tilsyn[] = [];
    let d = dagnr("2016-01-01") + Math.floor(r() * 300);
    const slutt = dagnr("2026-09-01");
    while (d < slutt) {
      const k = r() < 0.15 ? 2 : 0;
      tilsyn.push(t(isoFraDagnr(d), k));
      if (k >= 2) tilsyn.push(t(isoFraDagnr(d + 10), 0, true));
      d += 250 + Math.floor(r() * 250);
    }
    steder.push(sted(`s${i}`, tilsyn, i % 2 ? "0301" : "4601", i % 2 ? "03" : "46"));
  }
  const data = forberedSteder(steder);
  const om = lagOmraader(data);
  const slutt = dagnr("2026-09-01");

  it("only labels snapshots whose whole horizon is observed", () => {
    const { eks, snapshots } = besokEksempler(data, om, dagnr("2017-01-01"), slutt, 60);
    expect(snapshots.at(-1)! + 60).toBeLessThanOrEqual(slutt);
    expect(Math.max(...eks.fasitSlutt)).toBeLessThanOrEqual(slutt);
    expect(eks.y.length).toBe(eks.X.rader);
  });

  it("context features ignore the future", () => {
    const dag = dagnr("2022-03-01");
    const fremtid = steder.map((s) => ({ ...s, tilsyn: [...s.tilsyn, t("2023-05-05", 3), t("2025-01-01", 2)] }));
    const om2 = lagOmraader(forberedSteder(fremtid));
    expect(besokKontekst(om2, "0301", "03", dag)).toEqual(besokKontekst(om, "0301", "03", dag));
    expect(utfallKontekst(om2, "4601", "46", dag)).toEqual(utfallKontekst(om, "4601", "46", dag));
  });

  it("backtests on later periods with models trained on earlier, fully-labelled data", () => {
    const utfall = utfallEksempler(data, om, dagnr("2017-01-01"), slutt);
    const perioder = [
      { fra: dagnr("2024-01-01"), til: dagnr("2025-01-01") },
      { fra: dagnr("2025-01-01"), til: dagnr("2026-01-01") },
    ];
    const rapport = tilbaketest(utfall, perioder, { l2: 5 });
    expect(rapport.folder).toHaveLength(2);
    for (const [i, f] of rapport.folder.entries()) {
      expect(f.fra >= isoFraDagnr(perioder[i].fra)).toBe(true);
      expect(f.til < isoFraDagnr(perioder[i].til)).toBe(true);
      // Treningssettet = alle eksempler med fasit kjent før perioden.
      const forventet = Array.from(utfall.fasitSlutt).filter((d) => d <= perioder[i].fra).length;
      expect(f.nTrening).toBe(forventet);
    }
    expect(rapport.grunnrate.auc).toBe(0.5);
    expect(rapport.kalibrering.reduce((s, k) => s + k.n, 0)).toBe(rapport.folder.reduce((s, f) => s + f.nTest, 0));
  });
});
