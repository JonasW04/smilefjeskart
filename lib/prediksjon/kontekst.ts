/**
 * Grunnrater per kommune, fylke og land beregnet *på* en gitt dag – kun fra tilsyn før dagen.
 */
import type { Sted } from "../types";
import type { BesokKontekst, UtfallKontekst } from "./egenskaper";
import type { TilsynDag } from "./historikk";
import { forsteIkkeMindre, maanedFraDagnr } from "./tid";
import { iVindu, krympetAndel, lagTidsserie, type Tidsserie } from "./tidsserie";

export type StedData = { sted: Sted; tilsyn: TilsynDag[]; kommune: string; fylke: string };

type Omraade = {
  /** Ordinære tilsyn, verdi 1 = strek/sur. */
  ordinaere: Tidsserie;
  /** Første tilsynsdag for hvert sted i området, sortert. */
  forste: Int32Array;
};

export type Omraader = {
  kommune: Map<string, Omraade>;
  fylke: Map<string, Omraade>;
  land: Omraade;
};

const TRE_AAR = 1096;

export function lagOmraader(steder: readonly StedData[]): Omraader {
  const grupper = (nokkel: (s: StedData) => string) => {
    const m = new Map<string, StedData[]>();
    for (const s of steder) {
      const k = nokkel(s);
      const l = m.get(k);
      if (l) l.push(s);
      else m.set(k, [s]);
    }
    return new Map([...m].map(([k, l]) => [k, omraade(l)]));
  };
  return { kommune: grupper((s) => s.kommune), fylke: grupper((s) => s.fylke), land: omraade(steder) };
}

function omraade(steder: readonly StedData[]): Omraade {
  const hendelser: Array<{ dag: number; verdi: number }> = [];
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (!t.oppfolging && t.karakter >= 0) hendelser.push({ dag: t.dag, verdi: t.karakter >= 2 ? 1 : 0 });
    }
  }
  const forste = Int32Array.from(steder.filter((s) => s.tilsyn.length > 0).map((s) => s.tilsyn[0].dag)).sort();
  return { ordinaere: lagTidsserie(hendelser), forste };
}

/** Ordinære tilsyn per sted i [dag − vindu, dag), der «sted» = hadde første tilsyn før `dag`. */
function aktivitet(o: Omraade, dag: number, vindu: number): { tilsyn: number; aktive: number } {
  return { tilsyn: iVindu(o.ordinaere, dag - vindu, dag).antall, aktive: forsteIkkeMindre(o.forste, dag) };
}

/** Krympet aktivitet: små kommuner trekkes mot fylket (10 «virtuelle» steder). */
function krympetAktivitet(o: Omraade | undefined, dag: number, vindu: number, prior: number): number {
  if (!o) return prior;
  const a = aktivitet(o, dag, vindu);
  return krympetAndel(a.tilsyn, a.aktive, prior, 10);
}

export function besokKontekst(om: Omraader, kommune: string, fylke: string, dag: number): BesokKontekst {
  const l90 = aktivitet(om.land, dag, 90);
  const land90 = l90.tilsyn / Math.max(1, l90.aktive);
  const l365 = aktivitet(om.land, dag, 365);
  const land365 = l365.tilsyn / Math.max(1, l365.aktive);
  const fylke90 = krympetAktivitet(om.fylke.get(fylke), dag, 90, land90);
  const fylke365 = krympetAktivitet(om.fylke.get(fylke), dag, 365, land365);
  return {
    kommune90: krympetAktivitet(om.kommune.get(kommune), dag, 90, fylke90),
    kommune365: krympetAktivitet(om.kommune.get(kommune), dag, 365, fylke365),
    fylke90,
    land90,
    maaned: maanedFraDagnr(dag),
  };
}

/** Andel strek/sur ved ordinære tilsyn i [dag − vindu, dag). */
function rate(o: Omraade | undefined, dag: number, vindu: number): { sum: number; antall: number } {
  if (!o) return { sum: 0, antall: 0 };
  return iVindu(o.ordinaere, dag - vindu, dag);
}

export function utfallKontekst(om: Omraader, kommune: string, fylke: string, dag: number): UtfallKontekst {
  const l1 = rate(om.land, dag, 365);
  const l3 = rate(om.land, dag, TRE_AAR);
  // Faller tilbake til langtidssnittet hvis det siste året mangler data (skal ikke skje i praksis).
  const land3Rate = l3.antall ? l3.sum / l3.antall : 0.15;
  const landRate = l1.antall >= 100 ? l1.sum / l1.antall : land3Rate;
  const f = rate(om.fylke.get(fylke), dag, TRE_AAR);
  const fylkeRate = krympetAndel(f.sum, f.antall, land3Rate, 50);
  const k = rate(om.kommune.get(kommune), dag, TRE_AAR);
  const kommuneRate = krympetAndel(k.sum, k.antall, fylkeRate, 30);
  return { landRate, land3Rate, fylkeRate, kommuneRate };
}
