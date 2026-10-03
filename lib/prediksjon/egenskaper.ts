/**
 * Gjør om en historikk (pluss kontekst om kommune/fylke/land på samme dag) til en
 * glissen egenskapsvektor for logistisk regresjon.
 *
 * Kontinuerlige egenskaper standardiseres av modellen og sendes derfor alltid med.
 * Binære egenskaper (én-av-K) sendes bare når de er 1.
 */
import { KATEGORI_NAVN, type Kategori } from "../classify";
import type { Historikk } from "./historikk";
import { logit } from "./tidsserie";

export type Rad = { idx: number[]; val: number[] };

export type Skjema = {
  navn: string[];
  /** true = kontinuerlig (standardiseres), false = binær 0/1. */
  kont: boolean[];
  indeks: Map<string, number>;
};

export function lagSkjema(kontinuerlige: string[], binaere: string[]): Skjema {
  const navn = [...kontinuerlige, ...binaere];
  return {
    navn,
    kont: navn.map((_, i) => i < kontinuerlige.length),
    indeks: new Map(navn.map((n, i) => [n, i])),
  };
}

class RadBygger {
  idx: number[] = [];
  val: number[] = [];
  constructor(private skjema: Skjema) {}
  sett(navn: string, verdi = 1): this {
    const i = this.skjema.indeks.get(navn);
    if (i === undefined) throw new Error(`Ukjent egenskap: ${navn}`);
    if (!Number.isFinite(verdi)) throw new Error(`Ugyldig verdi for ${navn}: ${verdi}`);
    this.idx.push(i);
    this.val.push(verdi);
    return this;
  }
  rad(): Rad {
    return { idx: this.idx, val: this.val };
  }
}

/** Plasserer x i en bøtte: indeksen til første grense som er > x (grenser stigende). */
export function boette(x: number, grenser: readonly number[]): number {
  let i = 0;
  while (i < grenser.length && x >= grenser[i]) i++;
  return i;
}

const KATEGORIER = Object.keys(KATEGORI_NAVN) as Kategori[];

/** Felles: hvor lenge siden siste strek/sur. */
const DAARLIG_GRENSER = [365, 730, 1461] as const;
function daarligBoette(h: Historikk): string {
  return h.dagerSidenDaarlig === null ? "daarlig:aldri" : `daarlig:${boette(h.dagerSidenDaarlig, DAARLIG_GRENSER)}`;
}
const DAARLIG_NAVN = ["daarlig:aldri", ...[0, 1, 2, 3].map((i) => `daarlig:${i}`)];

function sistNavn(h: Historikk): string {
  return h.sisteOrdinaerKarakter === null ? "sist:ingen" : `sist:${h.sisteOrdinaerKarakter}`;
}
const SIST_NAVN = ["sist:ingen", "sist:0", "sist:1", "sist:2", "sist:3"];

// ---------------------------------------------------------------------------
// «Hvem får besøk snart?»
// ---------------------------------------------------------------------------

/** Grenser (dager siden siste ordinære tilsyn). Tett rundt ett år, der det meste skjer. */
export const DSL_GRENSER = [60, 120, 180, 240, 300, 330, 350, 365, 380, 400, 430, 480, 540, 630, 730, 900, 1200] as const;
/** Grenser for dager-siden-sist delt på stedets eget typiske intervall. */
export const RYTME_GRENSER = [0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2] as const;

export type BesokKontekst = {
  /** Ordinære tilsyn siste 90/365 dager per aktivt sted i kommunen (eller fylket som reserve). */
  kommune90: number;
  kommune365: number;
  fylke90: number;
  land90: number;
  /** Måned (0–11) for skjæringsdagen. */
  maaned: number;
};

export const BESOK_SKJEMA = lagSkjema(
  ["logIntervall", "logAntallOrd", "logAntallDaarlig", "kommune90", "kommune365", "fylke90", "land90"],
  [
    ...Array.from({ length: DSL_GRENSER.length + 1 }, (_, i) => `dsl:${i}`),
    "rytme:ukjent",
    ...Array.from({ length: RYTME_GRENSER.length + 1 }, (_, i) => `rytme:${i}`),
    ...SIST_NAVN,
    "venterOppfolging",
    ...DAARLIG_NAVN,
    ...KATEGORIER.map((k) => `kat:${k}`),
    "kjede",
    ...Array.from({ length: 12 }, (_, i) => `mnd:${i}`),
  ],
);

export function besokRad(h: Historikk, kategori: Kategori, kjede: boolean, k: BesokKontekst): Rad {
  const r = new RadBygger(BESOK_SKJEMA)
    .sett("logIntervall", Math.log(h.intervall / 380))
    .sett("logAntallOrd", Math.log1p(h.antallOrdinaere))
    .sett("logAntallDaarlig", Math.log1p(h.antallStrek + h.antallSur))
    // Aktivitet ganges opp til «tilsyn per sted per år», så tallene er lette å lese.
    .sett("kommune90", k.kommune90 * (365 / 90))
    .sett("kommune365", k.kommune365)
    .sett("fylke90", k.fylke90 * (365 / 90))
    .sett("land90", k.land90 * (365 / 90))
    .sett(`dsl:${boette(h.dagerSidenOrdinaer, DSL_GRENSER)}`)
    .sett(h.antallIntervaller === 0 ? "rytme:ukjent" : `rytme:${boette(h.dagerSidenOrdinaer / h.intervall, RYTME_GRENSER)}`)
    .sett(sistNavn(h))
    .sett(daarligBoette(h))
    .sett(`kat:${kategori}`)
    .sett(`mnd:${k.maaned}`);
  if (h.venterOppfolging) r.sett("venterOppfolging");
  if (kjede) r.sett("kjede");
  return r.rad();
}

// ---------------------------------------------------------------------------
// «Hvordan går neste ordinære tilsyn?»
// ---------------------------------------------------------------------------

export type UtfallKontekst = {
  /** Andel strek/sur ved ordinære tilsyn i hele landet siste 365 dager (fanger trenden). */
  landRate: number;
  /** Andel strek/sur i landet, fylket (krympet mot landet) og kommunen (krympet mot fylket) siste tre år. */
  land3Rate: number;
  fylkeRate: number;
  kommuneRate: number;
};

/** Hvor mange «virtuelle tilsyn» stedets egen rate krympes mot landsnittet med. */
export const STED_KRYMPING = 4;

export const UTFALL_SKJEMA = lagSkjema(
  ["stedLogit", "sisteAvvik", "logAntallOrd", "logAntallStrek", "logAntallSur", "logAlder", "landLogit", "fylkeRelativ", "kommuneRelativ"],
  [...SIST_NAVN, ...DAARLIG_NAVN, ...KATEGORIER.map((k) => `kat:${k}`), "kjede"],
);

export function utfallRad(h: Historikk, kategori: Kategori, kjede: boolean, k: UtfallKontekst): Rad {
  const daarlige = h.antallStrek + h.antallSur;
  const stedRate = (daarlige + k.landRate * STED_KRYMPING) / (h.antallOrdinaere + STED_KRYMPING);
  const landLogit = logit(k.landRate);
  const r = new RadBygger(UTFALL_SKJEMA)
    .sett("stedLogit", logit(stedRate) - landLogit)
    .sett("sisteAvvik", h.sisteOrdinaerAvvik)
    .sett("logAntallOrd", Math.log1p(h.antallOrdinaere))
    .sett("logAntallStrek", Math.log1p(h.antallStrek))
    .sett("logAntallSur", Math.log1p(h.antallSur))
    .sett("logAlder", Math.log1p((h.dag - h.forsteDag) / 365))
    .sett("landLogit", landLogit)
    .sett("fylkeRelativ", logit(k.fylkeRate) - logit(k.land3Rate))
    .sett("kommuneRelativ", logit(k.kommuneRate) - logit(k.fylkeRate))
    .sett(sistNavn(h))
    .sett(daarligBoette(h))
    .sett(`kat:${kategori}`);
  if (kjede) r.sett("kjede");
  return r.rad();
}
