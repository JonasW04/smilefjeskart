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

export type FasitMaal = {
  /** Antall spådommer som er sjekket, og hvor mange av dem som slo til (y = 1). */
  n: number;
  treff: number;
  modell: Metrikk;
  heuristikk: Metrikk;
  /** «Gjett snittet»: historisk snitt fra spådommens egne tabeller. AUC 0,5 og brierSkill 0 per definisjon. */
  grunnrate: Metrikk;
  /** 95 % intervall for modellens AUC (Hanley–McNeil). */
  aucIntervall: [number, number];
};

/** Én publisert besøksspådom (den første i hver kalendermåned) og hvordan den har gått. */
export type FasitBesokVindu = FasitMaal & {
  /** dataDato for spådommen; vinduet er dagene etter. */
  fra: string;
  /** Siste dag i vinduet (fra + horisont). */
  til: string;
  /** Dager av vinduet vi har data for (= horisont når vinduet er over). */
  dager: number;
  /** Vinduet er over, med ETTERSLEP dager ekstra for sene publiseringer. */
  lukket: boolean;
  /** Sum av sannsynlighetene: ventet antall steder med ordinært tilsyn innen horisonten. */
  forventet: number;
};

export type FasitUtfall = FasitMaal & {
  /** Ordinære tilsyn hos steder som ikke var med i spådommen dagen før (typisk nye steder). */
  utenSpaadom: number;
};

export type Fasit = {
  /** Fasiten bygger på tilsyn til og med denne datoen. */
  dataDato: string;
  /** dataDato for den eldste publiserte spådommen som er med. */
  forste: string;
  /** Antall publiserte spådommer (unike dataDato) som er lest. */
  antallSpaadommer: number;
  /** Eldste først. */
  besok: FasitBesokVindu[];
  utfall: FasitUtfall | null;
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
  /** Publiserte spådommer fra git-historikken sjekket mot det som skjedde etterpå. Mangler i eldre filer. */
  fasit?: Fasit | null;
};
