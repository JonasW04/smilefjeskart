import type { Kategori } from "./classify";

/** Ett tilsyn (kontrollbesøk) hos et sted. */
export type Tilsyn = {
  /** ISO-dato, yyyy-mm-dd */
  dato: string;
  /** Samlet karakter 0–3, eller -1 hvis ukjent. */
  karakter: number;
  /** Karakter per tema i rekkefølgen fra TEMAER. 0–5, -1 = mangler. */
  temaer: [number, number, number, number];
  /** Oppfølgingstilsyn (tilsynsbesoektype = 1) i stedet for ordinært tilsyn. */
  oppfolging: boolean;
};

/** Et serveringssted (tilsynsobjekt) med full tilsynshistorikk. */
export type Sted = {
  id: string;
  slug: string;
  navn: string;
  orgnr: string | null;
  /** Gateadresse (adrlinje1, adrlinje2). */
  adresse: string;
  postnr: string;
  poststed: string;
  kommunenr: string | null;
  kommune: string | null;
  fylkenr: string | null;
  fylke: string | null;
  kjede: string | null;
  kjedeSlug: string | null;
  kategori: Kategori;
  lng: number | null;
  lat: number | null;
  /** Eldste først. */
  tilsyn: Tilsyn[];
};

export type Datasett = {
  generert: string;
  kilde: string;
  antallTilsyn: number;
  steder: Sted[];
};

/**
 * Kompakt kartdata for nettleseren (public/data/kart.json).
 * Hver rad: [slug, navn, adresse, lng, lat, karakter, dato(yyyymmdd), kommuneIdx, kategoriIdx, antallTilsyn,
 *            verste karakter noensinne, verste karakter siste 3 år (eller siste karakter hvis ingen tilsyn i perioden)]
 */
export type KartRad = [string, string, string, number, number, number, number, number, number, number, number, number];

export type KartData = {
  v: 1;
  generert: string;
  kommuner: Array<[nr: string, navn: string, fylke: string]>;
  kategorier: Kategori[];
  steder: KartRad[];
};

export const KART = {
  SLUG: 0,
  NAVN: 1,
  ADRESSE: 2,
  LNG: 3,
  LAT: 4,
  KARAKTER: 5,
  DATO: 6,
  KOMMUNE: 7,
  KATEGORI: 8,
  ANTALL: 9,
  VERSTE: 10,
  VERSTE_3AAR: 11,
} as const;
