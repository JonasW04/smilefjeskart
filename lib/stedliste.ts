/**
 * Kompakt format for «Alle steder»-lista på kommune- og kjedesidene. Store kommuner (Oslo har over
 * 1 300 steder) server-rendrer bare de første radene; resten hentes som JSON når noen søker eller
 * vil se flere. Modulen er ren og brukes både på serveren og i nettleseren.
 */
import { SMILE_LABEL } from "./smile";
import type { SmileyKind } from "./smiley";
import { foldForSearch } from "./text";

/** [slug, navn, fjes, linje under navnet, tall til høyre] */
export type StedTuppel = [slug: string, navn: string, kind: SmileyKind, under: string, meta: string];

/** Så mange rader server-rendres før resten lastes ved behov (delelig på 1, 2 og 3 kolonner). */
export const FORSTE_RADER = 48;

/** Lister opp til så mange steder rendres i sin helhet; da trengs verken søk eller «vis flere». */
export const HELE_LISTA_MAKS = 60;

/** Hvor mange flere rader «Vis flere» legger til. */
export const FLERE_RADER = 150;

export function stedRad([slug, navn, kind, under, meta]: StedTuppel) {
  return {
    key: slug,
    slug,
    navn,
    kind,
    label: kind === "ukjent" ? "Ukjent" : SMILE_LABEL[kind],
    under,
    meta,
  };
}

/** Steder der alle ordene i søket finnes i navnet eller linja under (adresse, kommune). */
export function filtrerSteder(steder: StedTuppel[], sok: string): StedTuppel[] {
  const ord = foldForSearch(sok).split(" ").filter(Boolean);
  if (ord.length === 0) return steder;
  return steder.filter(([, navn, , under]) => {
    const tekst = foldForSearch(`${navn} ${under}`);
    return ord.every((o) => tekst.includes(o));
  });
}
