/**
 * Logistisk regresjon i ren TypeScript: glisne rader, standardisering av kontinuerlige
 * egenskaper, L2-regularisering og Newton–Raphson (IRLS) med Cholesky-løsning.
 * Med ~70 egenskaper og noen hundre tusen rader konvergerer den på et par sekunder.
 */
import type { Rad, Skjema } from "./egenskaper";

export type Matrise = {
  rader: number;
  kolonner: number;
  ptr: Int32Array;
  idx: Int32Array;
  val: Float64Array;
};

export class MatriseBygger {
  private ptr: number[] = [0];
  private idx: number[] = [];
  private val: number[] = [];
  constructor(readonly kolonner: number) {}
  leggTil(r: Rad): number {
    for (let k = 0; k < r.idx.length; k++) {
      this.idx.push(r.idx[k]);
      this.val.push(r.val[k]);
    }
    this.ptr.push(this.idx.length);
    return this.ptr.length - 2;
  }
  get antall(): number {
    return this.ptr.length - 1;
  }
  bygg(): Matrise {
    return {
      rader: this.ptr.length - 1,
      kolonner: this.kolonner,
      ptr: Int32Array.from(this.ptr),
      idx: Int32Array.from(this.idx),
      val: Float64Array.from(this.val),
    };
  }
}

/** Velger ut et utvalg rader (i gitt rekkefølge) fra en matrise. */
export function velgRader(X: Matrise, rader: ArrayLike<number>): Matrise {
  let nnz = 0;
  for (let i = 0; i < rader.length; i++) nnz += X.ptr[rader[i] + 1] - X.ptr[rader[i]];
  const ptr = new Int32Array(rader.length + 1);
  const idx = new Int32Array(nnz);
  const val = new Float64Array(nnz);
  let p = 0;
  for (let i = 0; i < rader.length; i++) {
    for (let k = X.ptr[rader[i]]; k < X.ptr[rader[i] + 1]; k++) {
      idx[p] = X.idx[k];
      val[p] = X.val[k];
      p++;
    }
    ptr[i + 1] = p;
  }
  return { rader: rader.length, kolonner: X.kolonner, ptr, idx, val };
}

export type Modell = {
  navn: string[];
  /** Standardisering: x' = (x - snitt) / std. For binære egenskaper er snitt 0 og std 1. */
  snitt: number[];
  std: number[];
  /** Vekter på standardisert skala. */
  vekter: number[];
  skjaering: number;
  iterasjoner: number;
};

export type TreningsValg = {
  /** L2-straff på vektene (ikke skjæringspunktet), på skala med sum av log-tap. */
  l2?: number;
  maksIterasjoner?: number;
  toleranse?: number;
};

export function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

function standardisering(X: Matrise, skjema: Skjema): { snitt: number[]; std: number[] } {
  const d = X.kolonner;
  const sum = new Float64Array(d);
  const sum2 = new Float64Array(d);
  for (let k = 0; k < X.idx.length; k++) {
    sum[X.idx[k]] += X.val[k];
    sum2[X.idx[k]] += X.val[k] * X.val[k];
  }
  const snitt: number[] = [];
  const std: number[] = [];
  for (let j = 0; j < d; j++) {
    if (!skjema.kont[j] || X.rader === 0) {
      snitt.push(0);
      std.push(1);
      continue;
    }
    const m = sum[j] / X.rader;
    const v = sum2[j] / X.rader - m * m;
    snitt.push(m);
    std.push(v > 1e-12 ? Math.sqrt(v) : 1);
  }
  return { snitt, std };
}

/** Løser A x = b for symmetrisk positiv definitt A (n×n, radvis) med Cholesky. */
export function cholesky(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) throw new Error("Matrisen er ikke positiv definitt");
        L[i * n + i] = Math.sqrt(s);
      } else {
        L[i * n + j] = s / L[j * n + j];
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** Trener en L2-regularisert logistisk regresjon. `y` er 0/1. */
export function tren(X: Matrise, y: ArrayLike<number>, skjema: Skjema, valg: TreningsValg = {}): Modell {
  const l2 = valg.l2 ?? 1;
  const maksIter = valg.maksIterasjoner ?? 25;
  const tol = valg.toleranse ?? 1e-7;
  const d = X.kolonner;
  const n = d + 1; // indeks d = skjæringspunkt
  const { snitt, std } = standardisering(X, skjema);

  // Standardiserte verdier forhåndsberegnes én gang.
  const sv = new Float64Array(X.val.length);
  for (let k = 0; k < X.val.length; k++) sv[k] = (X.val[k] - snitt[X.idx[k]]) / std[X.idx[k]];

  const w = new Float64Array(n);
  let positive = 0;
  for (let i = 0; i < X.rader; i++) positive += y[i];
  const p0 = Math.min(1 - 1e-6, Math.max(1e-6, positive / Math.max(1, X.rader)));
  w[d] = Math.log(p0 / (1 - p0));

  let iter = 0;
  for (; iter < maksIter; iter++) {
    const H = new Float64Array(n * n);
    const g = new Float64Array(n);
    for (let i = 0; i < X.rader; i++) {
      const a = X.ptr[i];
      const b = X.ptr[i + 1];
      let z = w[d];
      for (let k = a; k < b; k++) z += w[X.idx[k]] * sv[k];
      const p = sigmoid(z);
      const r = p - y[i];
      const h = Math.max(p * (1 - p), 1e-10);
      g[d] += r;
      H[d * n + d] += h;
      for (let k = a; k < b; k++) {
        const j = X.idx[k];
        const xj = sv[k];
        g[j] += r * xj;
        H[d * n + j] += h * xj;
        const hx = h * xj;
        for (let m = a; m <= k; m++) {
          const l = X.idx[m];
          // Fyll bare nedre trekant; den speiles etter løkken.
          if (j >= l) H[j * n + l] += hx * sv[m];
          else H[l * n + j] += hx * sv[m];
        }
      }
    }
    for (let j = 0; j < d; j++) {
      H[j * n + j] += l2;
      g[j] += l2 * w[j];
    }
    // Nedre trekant er fylt (skjæringspunktet er rad d); speil til øvre.
    for (let j = 0; j < n; j++) {
      for (let l = 0; l < j; l++) H[l * n + j] = H[j * n + l];
    }
    const steg = cholesky(H, g, n);
    let maks = 0;
    for (let j = 0; j < n; j++) {
      w[j] -= steg[j];
      maks = Math.max(maks, Math.abs(steg[j]));
    }
    if (maks < tol) {
      iter++;
      break;
    }
  }

  return { navn: skjema.navn, snitt, std, vekter: Array.from(w.subarray(0, d)), skjaering: w[d], iterasjoner: iter };
}

export function prediker(m: Modell, r: Rad): number {
  let z = m.skjaering;
  for (let k = 0; k < r.idx.length; k++) {
    const j = r.idx[k];
    z += (m.vekter[j] * (r.val[k] - m.snitt[j])) / m.std[j];
  }
  return sigmoid(z);
}

export function predikerAlle(m: Modell, X: Matrise): Float64Array {
  const ut = new Float64Array(X.rader);
  for (let i = 0; i < X.rader; i++) {
    let z = m.skjaering;
    for (let k = X.ptr[i]; k < X.ptr[i + 1]; k++) {
      const j = X.idx[k];
      z += (m.vekter[j] * (X.val[k] - m.snitt[j])) / m.std[j];
    }
    ut[i] = sigmoid(z);
  }
  return ut;
}
