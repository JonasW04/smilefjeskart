/** Datoer som heltall (dager siden 1970-01-01, UTC) – raskt og uten tidssonetrøbbel. */

const DAG_MS = 86_400_000;

export function dagnr(iso: string): number {
  return Math.round(Date.parse(iso.slice(0, 10)) / DAG_MS);
}

export function isoFraDagnr(dag: number): string {
  return new Date(dag * DAG_MS).toISOString().slice(0, 10);
}

/** Måned 0–11 for et dagnummer. */
export function maanedFraDagnr(dag: number): number {
  return new Date(dag * DAG_MS).getUTCMonth();
}

/** Den 1. i hver måned fra og med `fra` til og med `til` (dagnumre). */
export function maanedsstarter(fra: number, til: number): number[] {
  const d = new Date(fra * DAG_MS);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() !== 1) m++;
  const ut: number[] = [];
  for (;;) {
    const dag = Math.round(Date.UTC(y, m, 1) / DAG_MS);
    if (dag > til) break;
    ut.push(dag);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return ut;
}

/** Første indeks i en sortert liste der verdien er >= x. */
export function forsteIkkeMindre(sortert: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = sortert.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortert[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
