/**
 * Bygger treningseksempler fra historiske skjæringsdatoer og kjører en tidsriktig
 * tilbaketest: modellen som spår en testperiode er bare trent på data der både
 * egenskaper *og* fasit lå før periodens start.
 */
import type { Sted } from "../types";
import { BESOK_SKJEMA, UTFALL_SKJEMA, besokRad, utfallRad, type Skjema } from "./egenskaper";
import { forberedTilsyn, historikkFoer, ordinaerMellom } from "./historikk";
import { besokKontekst, lagOmraader, utfallKontekst, type Omraader, type StedData } from "./kontekst";
import { MatriseBygger, predikerAlle, tren, velgRader, type Matrise, type Modell } from "./logistisk";
import { evaluer, kalibrering, oppslagsmodell, snitt } from "./metrikker";
import { isoFraDagnr, maanedsstarter } from "./tid";
import type { Fold, ModellRapport } from "./typer";

export function forberedSteder(steder: readonly Sted[]): StedData[] {
  return steder.map((sted) => ({
    sted,
    tilsyn: forberedTilsyn(sted.tilsyn),
    kommune: sted.kommunenr ?? `f${sted.fylkenr ?? "?"}`,
    fylke: sted.fylkenr ?? "?",
  }));
}

/** Et datasett med eksempler: X, fasit, når eksemplet «skjer» og en nøkkel til grunnlinjen. */
export type Eksempler = {
  X: Matrise;
  y: Uint8Array;
  /** Skjæringsdag (besøk) eller tilsynsdag (utfall). */
  dag: Int32Array;
  /** Siste dag fasiten avhenger av (eksklusiv): skjæringsdag + horisont, eller tilsynsdag + 1. */
  fasitSlutt: Int32Array;
  /** Nøkkel for grunnlinje-heuristikken. */
  nokkel: Int32Array;
  skjema: Skjema;
};

/** Bøtte for heuristikken «dager siden sist»: 30-dagersintervaller, kappet ved 1200 dager. */
export function dslNokkel(dagerSiden: number): number {
  return Math.min(40, Math.floor(dagerSiden / 30));
}

/**
 * «Hvem får besøk snart?» Én rad per (sted, månedlig skjæringsdato S) der stedet hadde tilsyn før S.
 * Fasit: ordinært tilsyn i [S, S + horisont). Bare S der hele vinduet ligger før `sisteDag` tas med.
 */
export function besokEksempler(steder: readonly StedData[], om: Omraader, fraDag: number, sisteDag: number, horisont: number) {
  const snapshots = maanedsstarter(fraDag, sisteDag - horisont);
  const X = new MatriseBygger(BESOK_SKJEMA.navn.length);
  const y: number[] = [];
  const dag: number[] = [];
  const nokkel: number[] = [];
  for (const S of snapshots) {
    const kontekst = new Map<string, ReturnType<typeof besokKontekst>>();
    for (const s of steder) {
      const h = historikkFoer(s.tilsyn, S);
      if (!h) continue;
      let k = kontekst.get(s.kommune);
      if (!k) kontekst.set(s.kommune, (k = besokKontekst(om, s.kommune, s.fylke, S)));
      X.leggTil(besokRad(h, s.sted.kategori, s.sted.kjedeSlug !== null, k));
      y.push(ordinaerMellom(s.tilsyn, S, S + horisont) ? 1 : 0);
      dag.push(S);
      nokkel.push(dslNokkel(h.dagerSidenOrdinaer));
    }
  }
  const eks: Eksempler = {
    X: X.bygg(),
    y: Uint8Array.from(y),
    dag: Int32Array.from(dag),
    fasitSlutt: Int32Array.from(dag, (d) => d + horisont),
    nokkel: Int32Array.from(nokkel),
    skjema: BESOK_SKJEMA,
  };
  return { eks, snapshots };
}

/**
 * «Hvordan går neste ordinære tilsyn?» Én rad per ordinært tilsyn fra og med `fraDag`
 * hos et sted som allerede hadde minst ett tilsyn. Egenskapene ser bare på dagene før tilsynet.
 * Fasit: strek eller sur munn.
 */
export function utfallEksempler(steder: readonly StedData[], om: Omraader, fraDag: number, sisteDag: number): Eksempler {
  const X = new MatriseBygger(UTFALL_SKJEMA.navn.length);
  const y: number[] = [];
  const dag: number[] = [];
  const nokkel: number[] = [];
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (t.oppfolging || t.karakter < 0 || t.dag < fraDag || t.dag > sisteDag) continue;
      const h = historikkFoer(s.tilsyn, t.dag);
      if (!h) continue;
      X.leggTil(utfallRad(h, s.sted.kategori, s.sted.kjedeSlug !== null, utfallKontekst(om, s.kommune, s.fylke, t.dag)));
      y.push(t.karakter >= 2 ? 1 : 0);
      dag.push(t.dag);
      nokkel.push(h.sisteOrdinaerKarakter ?? -1);
    }
  }
  return {
    X: X.bygg(),
    y: Uint8Array.from(y),
    dag: Int32Array.from(dag),
    fasitSlutt: Int32Array.from(dag, (d) => d + 1),
    nokkel: Int32Array.from(nokkel),
    skjema: UTFALL_SKJEMA,
  };
}

export type TreningsOppsett = { l2: number };

function radIndekser(n: number, behold: (i: number) => boolean): Int32Array {
  const ut: number[] = [];
  for (let i = 0; i < n; i++) if (behold(i)) ut.push(i);
  return Int32Array.from(ut);
}

function velg<T extends ArrayLike<number>>(a: T, rader: Int32Array): number[] {
  return Array.from(rader, (i) => a[i]);
}

export function trenPaa(eks: Eksempler, rader: Int32Array, oppsett: TreningsOppsett): Modell {
  return tren(velgRader(eks.X, rader), velg(eks.y, rader), eks.skjema, { l2: oppsett.l2 });
}

/**
 * Rullerende tilbaketest. For hver testperiode [fra, til) trenes modell og grunnlinjer
 * kun på eksempler med `fasitSlutt <= fra` – fasiten må være kjent før perioden starter.
 */
export function tilbaketest(eks: Eksempler, perioder: Array<{ fra: number; til: number }>, oppsett: TreningsOppsett): Omit<ModellRapport, "nTrening"> {
  const yAlle: number[] = [];
  const pModell: number[] = [];
  const pGrunn: number[] = [];
  const pHeur: number[] = [];
  const folder: Fold[] = [];

  for (const { fra, til } of perioder) {
    const trenRader = radIndekser(eks.y.length, (i) => eks.fasitSlutt[i] <= fra);
    const testRader = radIndekser(eks.y.length, (i) => eks.dag[i] >= fra && eks.dag[i] < til);
    if (trenRader.length === 0 || testRader.length === 0) continue;

    const modell = trenPaa(eks, trenRader, oppsett);
    const p = predikerAlle(modell, velgRader(eks.X, testRader));
    const yTren = velg(eks.y, trenRader);
    const grunn = snitt(yTren);
    const heur = oppslagsmodell(velg(eks.nokkel, trenRader), yTren);
    const yTest = velg(eks.y, testRader);
    const hTest = Array.from(testRader, (i) => heur(eks.nokkel[i]));

    yAlle.push(...yTest);
    pModell.push(...p);
    pGrunn.push(...yTest.map(() => grunn));
    pHeur.push(...hTest);

    const mFold = evaluer(yTest, p, 1);
    let forste = Infinity;
    let siste = -Infinity;
    for (const i of testRader) {
      forste = Math.min(forste, eks.dag[i]);
      siste = Math.max(siste, eks.dag[i]);
    }
    folder.push({
      fra: isoFraDagnr(forste),
      til: isoFraDagnr(siste),
      nTrening: trenRader.length,
      nTest: testRader.length,
      aucModell: mFold.auc,
      aucHeuristikk: evaluer(yTest, hTest, 1).auc,
      snittPredikert: mFold.snittPredikert,
      snittFaktisk: mFold.snittFaktisk,
    });
  }

  const grunnrate = evaluer(yAlle, pGrunn, 1);
  const ref = grunnrate.brier;
  return {
    modell: evaluer(yAlle, pModell, ref),
    // Grunnraten gir alle samme tall innen en periode, så den kan ikke rangere: AUC 0,5 per definisjon.
    // (Samlet over perioder med ulik grunnrate ville AUC ellers blitt et meningsløst biprodukt av nivåskiftet.)
    grunnrate: { ...grunnrate, auc: 0.5, brierSkill: 0, toppDesil: grunnrate.snittFaktisk },
    heuristikk: evaluer(yAlle, pHeur, ref),
    kalibrering: kalibrering(yAlle, pModell, 10),
    folder,
  };
}

export { lagOmraader };
