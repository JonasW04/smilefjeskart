/** Formatet på generated/prediksjon.json (skrives av scripts/build-prediksjon.ts). */
import type { Kategori } from "../classify";
import type { KalibreringsPunkt, Metrikk } from "./metrikker";

export type Fold = {
  /** Testperioden [fra, til] (ISO-datoer, inklusive). */
  fra: string;
  til: string;
  nTrening: number;
  nTest: number;
  aucModell: number;
  aucHeuristikk: number;
  snittPredikert: number;
  snittFaktisk: number;
};

export type ModellRapport = {
  /** Samlet over alle testperiodene (hver periode spådd av en modell trent kun på eldre data). */
  modell: Metrikk;
  grunnrate: Metrikk;
  heuristikk: Metrikk;
  kalibrering: KalibreringsPunkt[];
  folder: Fold[];
  /** Antall eksempler den endelige modellen er trent på. */
  nTrening: number;
};

export type PrediksjonData = {
  v: 1;
  /** Når modellen ble trent (ISO-tidsstempel). */
  generert: string;
  /** Datagrunnlaget gjelder til og med denne datoen (yyyy-mm-dd). */
  dataDato: string;
  /** Horisont for «besøk snart», i dager. */
  horisont: number;
  besok: ModellRapport & {
    /** Antall historiske skjæringsdatoer (månedlige) i treningsdata. */
    antallSnapshots: number;
    /** Faktisk andel som fikk ordinært tilsyn innen horisonten, etter dager siden forrige. */
    rytme: Array<{ fra: number; til: number; andel: number; n: number }>;
    /** Forventet antall ordinære tilsyn de neste `horisont` dagene (sum av sannsynligheter). */
    forventet: number;
    perFylke: Array<{ fylkenr: string; fylke: string; forventet: number; steder: number }>;
  };
  utfall: ModellRapport & {
    /** Faktisk andel strek/sur ved neste ordinære tilsyn, etter karakter ved forrige ordinære. */
    etterSiste: Array<{ karakter: number; andel: number; n: number }>;
    /** Snitt av live-sannsynlighetene over alle steder. */
    landSnitt: number;
    perKategori: Array<{ kategori: Kategori; snitt: number; observert: number; nObservert: number; steder: number }>;
    perFylke: Array<{ fylkenr: string; fylke: string; snitt: number; observert: number; nObservert: number; steder: number }>;
  };
  /** [slug, P(ordinært tilsyn innen horisont) i promille, P(strek/sur ved neste ordinære) i promille] */
  steder: Array<[string, number, number]>;
};
