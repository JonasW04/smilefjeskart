/**
 * Smilefjes-rapporten koblet til datasettet. Regnes ut én gang per serverinstans og måned.
 */
import type { Gruppe } from "../analyse";
import { ANTALL_KOMMUNER, bestOgSvakest, lagRapport, maanedSummer, periodeSum, rapportMaaneder, type MaanedSum, type Rapport, type Ym } from "../rapport";
import { getSteder } from "./data";
import { getOmrade, kommuner, sluttDato, type Omrade } from "./omrader";

export const SITE = "https://smilefjeskartet.no";

let summerCache: Map<Ym, MaanedSum> | null = null;

function summer(): Map<Ym, MaanedSum> {
  return (summerCache ??= maanedSummer(getSteder()));
}

/** Alle måneder med rapport, eldste først. */
export function maaneder(): Ym[] {
  return rapportMaaneder(summer(), sluttDato());
}

export function sisteRapport(): Ym {
  const m = maaneder();
  return m[m.length - 1];
}

export function maanedSum(ym: Ym): MaanedSum | null {
  return summer().get(ym) ?? null;
}

export type OmradeRad = { omrade: Omrade; gruppe: Gruppe<string> };

export type RapportSide = Rapport & {
  url: string;
  kommuneRader: OmradeRad[];
  best: OmradeRad[];
  svakest: OmradeRad[];
  kjedeRader: OmradeRad[];
  forrige: Ym | null;
  neste: Ym | null;
};

const cache = new Map<Ym, RapportSide>();

/** Rapporten for en måned, eller null hvis måneden ikke har rapport. */
export function rapport(ym: Ym): RapportSide | null {
  const hit = cache.get(ym);
  if (hit) return hit;
  const alle = maaneder();
  const i = alle.indexOf(ym);
  if (i < 0) return null;
  const r = lagRapport(getSteder(), summer(), ym);
  const kommuneByNr = new Map(kommuner().map((k) => [k.id, k]));
  const kommuneRader = r.kommuner.flatMap((g) => {
    const omrade = kommuneByNr.get(g.key);
    return omrade ? [{ omrade, gruppe: g }] : [];
  });
  const kjedeRader = r.kjeder.flatMap((g) => {
    const omrade = getOmrade("kjede", g.key);
    return omrade ? [{ omrade, gruppe: g }] : [];
  });
  const side: RapportSide = {
    ...r,
    url: `${SITE}/rapport/${ym}`,
    kommuneRader,
    ...bestOgSvakest(kommuneRader, ANTALL_KOMMUNER),
    kjedeRader,
    forrige: i > 0 ? alle[i - 1] : null,
    neste: i < alle.length - 1 ? alle[i + 1] : null,
  };
  cache.set(ym, side);
  return side;
}

/** Hele landet, ordinære tilsyn fra og med `fra` til og med `til` (måneder). */
export function landPeriode(fra: Ym, til: Ym) {
  return periodeSum(summer(), fra, til);
}
