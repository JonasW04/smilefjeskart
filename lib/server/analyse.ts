/**
 * Nasjonale aggregater til /analyse. Regnes ut én gang per serverinstans.
 */
import {
  comebacks,
  feilfrie,
  flestAnmerkninger,
  grupper,
  hittilIAar,
  oppfolgingstid,
  perMaaned,
  perUkedag,
  rangerEtterSmil,
  sisteHeleAar,
  sisteTilsynPeriode,
  temaPerAar,
  temaStatistikk,
} from "../analyse";
import type { Kategori } from "../classify";
import { andel, fordeling, sisteTilsyn } from "../stats";
import { getDatasett, getSteder, landFordeling } from "./data";
import { landPerAar, sluttDato } from "./omrader";

/** Minste antall ordinære tilsyn for at en kategori vises. */
export const MIN_KATEGORI = 100;

function bygg() {
  const steder = getSteder();
  const slutt = sluttDato();
  const aar = landPerAar();
  const heleAar = sisteHeleAar(aar);
  const iAar = aar[aar.length - 1];
  const mmdd = slutt.slice(5);
  const hittil = iAar.delvis ? hittilIAar(steder, iAar.aar, mmdd) : null;
  const hittilFjor = iAar.delvis ? hittilIAar(steder, iAar.aar - 1, mmdd) : null;
  const sisteHele = heleAar?.aar ?? iAar.aar;
  const sisteFordeling = fordeling(steder.map((s) => sisteTilsyn(s).karakter));

  const kategorier = rangerEtterSmil(grupper<Kategori>(steder, (s) => s.kategori).values(), MIN_KATEGORI);
  const kategorierUtelatt = [...grupper<Kategori>(steder, (s) => s.kategori).values()].filter((g) => g.ordinaer.total < MIN_KATEGORI);

  return {
    generert: getDatasett().generert,
    antallTilsyn: getDatasett().antallTilsyn,
    antallSteder: steder.length,
    sluttDato: slutt,
    land: landFordeling(),
    /** Siste smilefjes per sted – «kartbildet». */
    sisteFordeling,
    sisteSmilAndel: andel(sisteFordeling, "smil"),
    aar,
    heleAar,
    hittil,
    hittilFjor,
    maaneder: perMaaned(steder, aar[0].aar, sisteHele),
    maanedPeriode: [aar[0].aar, sisteHele] as const,
    ukedager: perUkedag(steder),
    tema: temaStatistikk(steder),
    temaAar: temaPerAar(steder, aar[0].aar, iAar.aar),
    kategorier,
    kategorierUtelatt,
    oppfolging: oppfolgingstid(steder),
    comebacks: comebacks(steder).slice(0, 6),
    feilfrie: feilfrie(steder).slice(0, 6),
    flestAnmerkninger: flestAnmerkninger(steder).slice(0, 6),
    siste7: sisteTilsynPeriode(steder, slutt, 7),
  };
}

let cache: ReturnType<typeof bygg> | null = null;

export function analyse() {
  return (cache ??= bygg());
}
