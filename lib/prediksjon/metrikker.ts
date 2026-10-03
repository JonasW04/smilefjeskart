/** Evalueringsmål for sannsynlighetsprediksjoner med 0/1-utfall. */

/** Areal under ROC-kurven (Mann–Whitney), med uavgjorte poeng delt likt. */
export function auc(y: ArrayLike<number>, p: ArrayLike<number>): number {
  const n = y.length;
  const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[a] - p[b]);
  let rangsumPos = 0;
  let pos = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && p[ord[j + 1]] === p[ord[i]]) j++;
    const snittRang = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (y[ord[k]] === 1) {
        rangsumPos += snittRang;
        pos++;
      }
    }
    i = j + 1;
  }
  const neg = n - pos;
  if (pos === 0 || neg === 0) return NaN;
  return (rangsumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function brier(y: ArrayLike<number>, p: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < y.length; i++) s += (p[i] - y[i]) ** 2;
  return s / y.length;
}

export function loggTap(y: ArrayLike<number>, p: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < y.length; i++) {
    const q = Math.min(1 - 1e-12, Math.max(1e-12, p[i]));
    s -= y[i] === 1 ? Math.log(q) : Math.log(1 - q);
  }
  return s / y.length;
}

export function snitt(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : NaN;
}

export type KalibreringsPunkt = { predikert: number; faktisk: number; n: number };

/** Like store grupper sortert etter predikert sannsynlighet (desiler når `grupper` = 10). */
export function kalibrering(y: ArrayLike<number>, p: ArrayLike<number>, grupper = 10): KalibreringsPunkt[] {
  const n = y.length;
  const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[a] - p[b]);
  const ut: KalibreringsPunkt[] = [];
  for (let g = 0; g < grupper; g++) {
    const a = Math.floor((g * n) / grupper);
    const b = Math.floor(((g + 1) * n) / grupper);
    if (b <= a) continue;
    let sp = 0;
    let sy = 0;
    for (let k = a; k < b; k++) {
      sp += p[ord[k]];
      sy += y[ord[k]];
    }
    ut.push({ predikert: sp / (b - a), faktisk: sy / (b - a), n: b - a });
  }
  return ut;
}

/** Andel positive blant de `andel` høyest rangerte (f.eks. topp 10 %). */
export function treffITopp(y: ArrayLike<number>, p: ArrayLike<number>, andel: number): number {
  const n = y.length;
  const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[b] - p[a]);
  const k = Math.max(1, Math.round(n * andel));
  let s = 0;
  for (let i = 0; i < k; i++) s += y[ord[i]];
  return s / k;
}

export type Metrikk = {
  auc: number;
  brier: number;
  /** 1 − Brier / Brier(grunnrate fra treningsdata). Positiv = bedre enn å gjette snittet. */
  brierSkill: number;
  loggTap: number;
  /** Snitt predikert og faktisk andel – sjekker om nivået treffer. */
  snittPredikert: number;
  snittFaktisk: number;
  /** Andel positive blant topp 10 % rangerte. */
  toppDesil: number;
};

export function evaluer(y: ArrayLike<number>, p: ArrayLike<number>, brierReferanse: number): Metrikk {
  const b = brier(y, p);
  return {
    auc: auc(y, p),
    brier: b,
    brierSkill: 1 - b / brierReferanse,
    loggTap: loggTap(y, p),
    snittPredikert: snitt(p),
    snittFaktisk: snitt(y),
    toppDesil: treffITopp(y, p, 0.1),
  };
}

/**
 * Enkel oppslagsmodell (grunnlinje): andel positive per nøkkel i treningsdata,
 * krympet mot totalandelen med `styrke` pseudo-observasjoner.
 */
export function oppslagsmodell(
  noklerTren: ArrayLike<number>,
  yTren: ArrayLike<number>,
  styrke = 20,
): (nokkel: number) => number {
  const antall = new Map<number, number>();
  const treff = new Map<number, number>();
  let tot = 0;
  for (let i = 0; i < yTren.length; i++) {
    const k = noklerTren[i];
    antall.set(k, (antall.get(k) ?? 0) + 1);
    treff.set(k, (treff.get(k) ?? 0) + yTren[i]);
    tot += yTren[i];
  }
  const prior = yTren.length ? tot / yTren.length : 0.5;
  return (k) => ((treff.get(k) ?? 0) + prior * styrke) / ((antall.get(k) ?? 0) + styrke);
}
