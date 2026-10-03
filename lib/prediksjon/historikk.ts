/**
 * Et steds historikk slik den så ut på en gitt dag. Alt her ser kun på tilsyn
 * *før* skjæringsdagen, så det kan brukes både til trening og til live-prediksjon
 * uten å lekke fremtiden inn i modellen.
 */
import type { Tilsyn } from "../types";
import { dagnr } from "./tid";

/** Kompakt tilsyn med dato som dagnummer. */
export type TilsynDag = {
  dag: number;
  karakter: number;
  oppfolging: boolean;
  /** Antall temaer med karakter 1–3 (små eller større avvik). */
  avvik: number;
};

export function forberedTilsyn(tilsyn: readonly Tilsyn[]): TilsynDag[] {
  return tilsyn
    .map((t) => ({
      dag: dagnr(t.dato),
      karakter: t.karakter,
      oppfolging: t.oppfolging,
      avvik: t.temaer.filter((k) => k >= 1 && k <= 3).length,
    }))
    .sort((a, b) => a.dag - b.dag);
}

/** Typisk avstand mellom ordinære tilsyn når vi ikke vet noe om stedet (dager). */
export const TYPISK_INTERVALL = 380;

export type Historikk = {
  /** Skjæringsdagen historikken gjelder for (eksklusiv). */
  dag: number;
  antall: number;
  antallOrdinaere: number;
  forsteDag: number;
  /** Dager siden siste ordinære tilsyn (eller første tilsyn hvis ingen ordinære). */
  dagerSidenOrdinaer: number;
  /** Karakter 0–3 ved siste ordinære tilsyn, null hvis ingen. */
  sisteOrdinaerKarakter: number | null;
  /** Antall temaer med avvik ved siste ordinære tilsyn. */
  sisteOrdinaerAvvik: number;
  /** Siste tilsyn var et ordinært tilsyn med strek/sur, og oppfølgingen har ikke kommet ennå. */
  venterOppfolging: boolean;
  antallStrek: number;
  antallSur: number;
  /** Dager siden siste ordinære strek/sur, null hvis aldri. */
  dagerSidenDaarlig: number | null;
  /** Gjennomsnittlig avstand mellom ordinære tilsyn, krympet mot TYPISK_INTERVALL. */
  intervall: number;
  /** Antall intervaller bak `intervall` (antall ordinære − 1, min 0). */
  antallIntervaller: number;
};

/**
 * Historikken til et sted før `dag` (tilsyn på selve dagen teller ikke).
 * Returnerer null hvis stedet ikke hadde noen tilsyn før `dag`.
 */
export function historikkFoer(tilsyn: readonly TilsynDag[], dag: number): Historikk | null {
  // Listene er korte (snitt ~5 tilsyn), så et lineært søk er raskest.
  let n = 0;
  while (n < tilsyn.length && tilsyn[n].dag < dag) n++;
  if (n === 0) return null;

  let antallOrdinaere = 0;
  let antallStrek = 0;
  let antallSur = 0;
  let sisteOrd: TilsynDag | null = null;
  let forrigeOrdDag: number | null = null;
  let sumGap = 0;
  let antallGap = 0;
  let sisteDaarligDag: number | null = null;

  for (let i = 0; i < n; i++) {
    const t = tilsyn[i];
    if (t.oppfolging) continue;
    antallOrdinaere++;
    if (t.karakter === 2) antallStrek++;
    if (t.karakter === 3) antallSur++;
    if (t.karakter >= 2) sisteDaarligDag = t.dag;
    if (forrigeOrdDag !== null && t.dag > forrigeOrdDag) {
      sumGap += t.dag - forrigeOrdDag;
      antallGap++;
    }
    forrigeOrdDag = t.dag;
    sisteOrd = t;
  }

  const siste = tilsyn[n - 1];
  return {
    dag,
    antall: n,
    antallOrdinaere,
    forsteDag: tilsyn[0].dag,
    dagerSidenOrdinaer: dag - (sisteOrd ? sisteOrd.dag : tilsyn[0].dag),
    sisteOrdinaerKarakter: sisteOrd && sisteOrd.karakter >= 0 ? sisteOrd.karakter : null,
    sisteOrdinaerAvvik: sisteOrd ? sisteOrd.avvik : 0,
    venterOppfolging: !siste.oppfolging && siste.karakter >= 2,
    antallStrek,
    antallSur,
    dagerSidenDaarlig: sisteDaarligDag === null ? null : dag - sisteDaarligDag,
    // Ett «virtuelt» typisk intervall i snittet, så steder med få tilsyn ikke får ekstreme verdier.
    intervall: (sumGap + TYPISK_INTERVALL) / (antallGap + 1),
    antallIntervaller: antallGap,
  };
}

/** Var det et ordinært tilsyn i [fra, til)? */
export function ordinaerMellom(tilsyn: readonly TilsynDag[], fra: number, til: number): boolean {
  return tilsyn.some((t) => !t.oppfolging && t.dag >= fra && t.dag < til);
}
