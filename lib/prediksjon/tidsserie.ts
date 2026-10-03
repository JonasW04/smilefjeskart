/**
 * Hendelser over tid (f.eks. alle ordinære tilsyn i en kommune) med raske oppslag
 * av «hvor mange, og hvor mange var dårlige, i vinduet [fra, til)».
 * Brukes til grunnrater per kommune/fylke/land beregnet *på* en gitt dag.
 */
import { forsteIkkeMindre } from "./tid";

export type Tidsserie = {
  dager: Int32Array;
  /** Kumulativ sum av verdier: kum[i] = sum av verdi for hendelse 0..i-1. */
  kum: Float64Array;
};

export function lagTidsserie(hendelser: Array<{ dag: number; verdi: number }>): Tidsserie {
  const sortert = [...hendelser].sort((a, b) => a.dag - b.dag);
  const dager = new Int32Array(sortert.length);
  const kum = new Float64Array(sortert.length + 1);
  sortert.forEach((h, i) => {
    dager[i] = h.dag;
    kum[i + 1] = kum[i] + h.verdi;
  });
  return { dager, kum };
}

/** Antall hendelser og sum av verdier med dag i [fra, til). */
export function iVindu(ts: Tidsserie, fra: number, til: number): { antall: number; sum: number } {
  const a = forsteIkkeMindre(ts.dager, fra);
  const b = forsteIkkeMindre(ts.dager, til);
  return { antall: Math.max(0, b - a), sum: b > a ? ts.kum[b] - ts.kum[a] : 0 };
}

/** Andel krympet mot `prior` med vekt `styrke` (pseudo-observasjoner). */
export function krympetAndel(treff: number, antall: number, prior: number, styrke: number): number {
  return (treff + prior * styrke) / (antall + styrke);
}

export function logit(p: number): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
}
