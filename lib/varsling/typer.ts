import type { Smile } from "../smile";

/** Hvilke radiuser man kan velge, i km. */
export const RADIUSER = [2, 5, 10, 25] as const;
export type Radius = (typeof RADIUSER)[number];

export const MAKS_KOMMUNER = 10;

export type Omrade =
  | { type: "radius"; lat: number; lng: number; km: Radius }
  | { type: "kommuner"; kommuner: string[] };

/** Det brukeren sender inn (etter validering). */
export type AbonnementInput = {
  epost: string;
  omrade: Omrade;
  filtre: Smile[];
};

/** Det som lagres i Redis. */
export type Abonnement = AbonnementInput & {
  id: string;
  status: "venter" | "aktiv";
  /** Menneskelig beskrivelse av området, utledet på serveren (aldri fritekst fra brukeren). */
  omradeTekst: string;
  opprettet: string;
  bekreftet?: string;
};

/** Ett tilsyn som kan varsles om, med det e-posten trenger å vise. */
export type VarselTilsyn = {
  /** stedId|dato|karakter */
  key: string;
  stedId: string;
  slug: string;
  navn: string;
  adresse: string;
  poststed: string;
  kommunenr: string | null;
  kommune: string | null;
  lat: number | null;
  lng: number | null;
  dato: string;
  karakter: number;
  oppfolging: boolean;
};
