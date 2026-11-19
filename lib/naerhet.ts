/**
 * «Sjekk rundt meg»: steder nær et punkt, med telling og rangering for nabolagskortet på kartet.
 */
import type { Kategori } from "./classify";
import { haversineKm } from "./geo";
import { radGruppe, type Modus } from "./kart";
import { KART, type KartData, type KartRad } from "./types";

/** Radiusene kortet kan vise, i meter. Den automatiske radiusen er alltid en av disse. */
export const NAER_RADIUSER = [500, 1000, 2000, 5000] as const;
export type NaerRadius = (typeof NAER_RADIUSER)[number];

/** Så mange steder trenger vi før vi slutter å utvide radiusen automatisk. */
export const NOK_STEDER = 10;

export type Punkt = { lat: number; lng: number };

export type NaertSted = { rad: KartRad; meter: number };

/** Avstand i meter mellom to punkter. */
export function avstandMeter(a: Punkt, b: Punkt): number {
  return haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000;
}

/**
 * Alle steder innenfor `maksMeter` fra punktet, nærmeste først.
 * En grov boks siler bort det meste før haversine, så et helt land tar et par millisekunder.
 */
export function stederInnen(
  data: KartData,
  punkt: Punkt,
  maksMeter: number = NAER_RADIUSER[NAER_RADIUSER.length - 1],
  kategori: Kategori | "alle" = "alle",
): NaertSted[] {
  const dLat = maksMeter / 111_000;
  const dLng = maksMeter / (111_000 * Math.max(Math.cos((punkt.lat * Math.PI) / 180), 0.01));
  const ut: NaertSted[] = [];
  for (const rad of data.steder) {
    if (Math.abs(rad[KART.LAT] - punkt.lat) > dLat || Math.abs(rad[KART.LNG] - punkt.lng) > dLng) continue;
    if (kategori !== "alle" && data.kategorier[rad[KART.KATEGORI]] !== kategori) continue;
    const meter = avstandMeter(punkt, { lat: rad[KART.LAT], lng: rad[KART.LNG] });
    if (meter <= maksMeter) ut.push({ rad, meter });
  }
  return ut.sort((a, b) => a.meter - b.meter || a.rad[KART.SLUG].localeCompare(b.rad[KART.SLUG]));
}

/** Minste radius med minst `nok` steder. Finnes ingen, blir det den største. */
export function velgRadius(steder: readonly NaertSted[], nok = NOK_STEDER): NaerRadius {
  for (const r of NAER_RADIUSER) {
    if (steder.filter((s) => s.meter <= r).length >= nok) return r;
  }
  return NAER_RADIUSER[NAER_RADIUSER.length - 1];
}

export type NaerTelling = { smil: number; strek: number; sur: number; ukjent: number };

export type NaerDom = {
  radius: NaerRadius;
  antall: number;
  telling: NaerTelling;
  /** Nyeste tilsynsdato blant stedene (ISO), eller null uten steder. */
  sistKontrollert: string | null;
  /** Strekmunn og sur munn: sur først, så nærmeste. */
  verst: NaertSted[];
  /** Smil, nærmeste først. */
  tryggest: NaertSted[];
};

const TELLING_NOKKEL = ["smil", "strek", "sur", "ukjent"] as const;

function isoDato(yyyymmdd: number): string {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * Nabolagsdommen innenfor én radius. `steder` er resultatet av `stederInnen` (nærmeste først),
 * så den samme listen kan gjenbrukes når brukeren bytter radius eller modus.
 */
export function naerhetsDom(steder: readonly NaertSted[], radius: NaerRadius, modus: Modus, maksListe = 5): NaerDom {
  const telling: NaerTelling = { smil: 0, strek: 0, sur: 0, ukjent: 0 };
  const verst: Array<NaertSted & { g: number }> = [];
  const tryggest: NaertSted[] = [];
  let nyeste = 0;
  let antall = 0;
  for (const s of steder) {
    if (s.meter > radius) break;
    antall++;
    const g = radGruppe(s.rad, modus);
    telling[TELLING_NOKKEL[g]]++;
    if (g === 1 || g === 2) verst.push({ ...s, g });
    else if (g === 0) tryggest.push(s);
    nyeste = Math.max(nyeste, s.rad[KART.DATO]);
  }
  // Listen er allerede sortert på avstand, og sort er stabil, så lik alvorlighet beholder avstandsrekkefølgen.
  verst.sort((a, b) => b.g - a.g);
  return {
    radius,
    antall,
    telling,
    sistKontrollert: nyeste > 0 ? isoDato(nyeste) : null,
    verst: verst.slice(0, maksListe).map(({ rad, meter }) => ({ rad, meter })),
    tryggest: tryggest.slice(0, maksListe),
  };
}

/** "350 m", "1,2 km", "12 km". */
export function formatAvstand(meter: number): string {
  if (meter < 1000) return `${Math.max(10, Math.round(meter / 10) * 10)} m`;
  const km = meter / 1000;
  return `${km.toLocaleString("nb-NO", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

/** Avgrensning [vest, sør, øst, nord] for en sirkel rundt punktet, til fitBounds. */
export function boksRundt(punkt: Punkt, meter: number): [number, number, number, number] {
  const dLat = meter / 111_320;
  const dLng = meter / (111_320 * Math.cos((punkt.lat * Math.PI) / 180));
  return [punkt.lng - dLng, punkt.lat - dLat, punkt.lng + dLng, punkt.lat + dLat];
}
