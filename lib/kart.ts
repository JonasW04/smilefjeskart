/**
 * Rene hjelpefunksjoner for kartsiden: GeoJSON fra kompakt kartdata, filtrering og søk.
 */
import type { Kategori } from "./classify";
import type { Smile } from "./smile";
import { asciiFold, foldForSearch } from "./text";
import { KART, type KartData, type KartRad } from "./types";

/** Fargemodus: verste resultat siste 3 år (standard) eller siste tilsyn. */
export type Modus = "tre-aar" | "siste";

/** Smilegruppe som tall i GeoJSON-egenskaper: 0 smil, 1 strek, 2 sur, 3 ukjent. */
export function gruppe(karakter: number): 0 | 1 | 2 | 3 {
  if (karakter === 0 || karakter === 1) return 0;
  if (karakter === 2) return 1;
  if (karakter === 3) return 2;
  return 3;
}

export const GRUPPE_SMILE: Record<number, Smile | null> = { 0: "smil", 1: "strek", 2: "sur", 3: null };

export type StedProps = {
  /** slug */
  s: string;
  /** navn */
  n: string;
  /** gruppe for siste tilsyn */
  k: number;
  /** gruppe for verste siste 3 år */
  v: number;
};

export type Filter = {
  smil: Set<Smile>;
  kategori: Kategori | "alle";
};

export function radGruppe(r: KartRad, modus: Modus): number {
  return gruppe(modus === "siste" ? r[KART.KARAKTER] : r[KART.VERSTE_3AAR]);
}

export function passerFilter(r: KartRad, data: KartData, modus: Modus, f: Filter): boolean {
  if (f.kategori !== "alle" && data.kategorier[r[KART.KATEGORI]] !== f.kategori) return false;
  const smil = GRUPPE_SMILE[radGruppe(r, modus)];
  // Ukjente vises bare når alle tre smilefjes er valgt.
  return smil ? f.smil.has(smil) : f.smil.size === 3;
}

/** Andel smil som gir fullt glis, strekmunn og sur munn på klyngefjesene. */
export const HUMOR_TERSKEL = { glis: 0.95, strek: 0.8, sur: 0.65 } as const;

/**
 * Humøret til en klynge fra -1 (sur) til 1 (glis), ut fra andelen smil blant steder med kjent resultat.
 * Lineært mellom tersklene, så 80 % smil gir strekmunn. null når ingen har kjent resultat.
 */
export function klyngeHumor(smil: number, strek: number, sur: number): number | null {
  const kjent = smil + strek + sur;
  if (kjent === 0) return null;
  const { glis, strek: midt, sur: bunn } = HUMOR_TERSKEL;
  const a = smil / kjent;
  const h = a >= midt ? (a - midt) / (glis - midt) : (a - midt) / (midt - bunn);
  return Math.max(-1, Math.min(1, h));
}

const GYLDEN_VINKEL = Math.PI * (3 - Math.sqrt(5));

/**
 * Steder med nøyaktig samme koordinat (f.eks. et kjøpesenter) spres i en solsikkespiral,
 * så alle kan klikkes. Plasseringen avhenger bare av datasettet, ikke av filteret.
 */
export function spredKoordinater(data: KartData, meter = 9): Map<string, [number, number]> {
  const grupper = new Map<string, KartRad[]>();
  for (const r of data.steder) {
    const key = `${r[KART.LNG]},${r[KART.LAT]}`;
    let g = grupper.get(key);
    if (!g) grupper.set(key, (g = []));
    g.push(r);
  }
  const ut = new Map<string, [number, number]>();
  for (const g of grupper.values()) {
    if (g.length === 1) {
      ut.set(g[0][KART.SLUG], [g[0][KART.LNG], g[0][KART.LAT]]);
      continue;
    }
    g.sort((a, b) => a[KART.SLUG].localeCompare(b[KART.SLUG]));
    const [lng0, lat0] = [g[0][KART.LNG], g[0][KART.LAT]];
    const mPerLat = 111_320;
    const mPerLng = mPerLat * Math.cos((lat0 * Math.PI) / 180);
    g.forEach((r, i) => {
      const radius = meter * Math.sqrt(i + 0.5);
      const vinkel = i * GYLDEN_VINKEL;
      ut.set(r[KART.SLUG], [lng0 + (radius * Math.cos(vinkel)) / mPerLng, lat0 + (radius * Math.sin(vinkel)) / mPerLat]);
    });
  }
  return ut;
}

export function tilGeoJson(
  data: KartData,
  modus: Modus,
  f: Filter,
  koordinater?: Map<string, [number, number]>,
): GeoJSON.FeatureCollection<GeoJSON.Point, StedProps> {
  const features: GeoJSON.Feature<GeoJSON.Point, StedProps>[] = [];
  for (const r of data.steder) {
    if (!passerFilter(r, data, modus, f)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: koordinater?.get(r[KART.SLUG]) ?? [r[KART.LNG], r[KART.LAT]] },
      properties: { s: r[KART.SLUG], n: r[KART.NAVN], k: gruppe(r[KART.KARAKTER]), v: gruppe(r[KART.VERSTE_3AAR]) },
    });
  }
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------------
// Søk
// ---------------------------------------------------------------------------

export type SokTreff =
  | { type: "sted"; rad: KartRad; score: number }
  | { type: "kommune"; nr: string; navn: string; fylke: string; antall: number; score: number };

export type SokIndeks = {
  steder: Array<{ rad: KartRad; navn: string; navnA: string; adresse: string; adresseA: string }>;
  kommuner: Array<{ nr: string; navn: string; fylke: string; antall: number; navnF: string; navnA: string }>;
};

export function byggSokIndeks(data: KartData): SokIndeks {
  const antall = new Map<number, number>();
  for (const r of data.steder) antall.set(r[KART.KOMMUNE], (antall.get(r[KART.KOMMUNE]) ?? 0) + 1);
  return {
    steder: data.steder.map((rad) => ({
      rad,
      navn: foldForSearch(rad[KART.NAVN]),
      navnA: asciiFold(rad[KART.NAVN]),
      adresse: foldForSearch(rad[KART.ADRESSE]),
      adresseA: asciiFold(rad[KART.ADRESSE]),
    })),
    kommuner: data.kommuner.map(([nr, navn, fylke], i) => ({
      nr,
      navn,
      fylke,
      antall: antall.get(i) ?? 0,
      navnF: foldForSearch(navn),
      navnA: asciiFold(navn),
    })),
  };
}

function treffScore(tekst: string, q: string): number {
  if (!q || !tekst.includes(q)) return 0;
  if (tekst.startsWith(q)) return 3;
  if (tekst.includes(` ${q}`)) return 2;
  return 1;
}

/**
 * Søker i navn og adresse (med og uten æøå), pluss kommunenavn.
 * Navnetreff veier tyngst; flere ord må alle finnes i navn eller adresse.
 */
export function sok(indeks: SokIndeks, sporring: string, maks = 8): SokTreff[] {
  const q = foldForSearch(sporring);
  const qa = asciiFold(sporring);
  if (q.length < 2) return [];
  const ord = q.split(" ");
  const ordA = qa.split(" ");

  const treff: SokTreff[] = [];
  for (const k of indeks.kommuner) {
    const eksakt = k.navnF === q || k.navnA === qa;
    const score = eksakt ? 10 : Math.max(treffScore(k.navnF, q), treffScore(k.navnA, qa)) + 0.5;
    if (score >= 2.5) treff.push({ type: "kommune", nr: k.nr, navn: k.navn, fylke: k.fylke, antall: k.antall, score });
  }
  for (const s of indeks.steder) {
    let score = Math.max(treffScore(s.navn, q), treffScore(s.navnA, qa)) * 2;
    if (score === 0) {
      const helTekst = `${s.navn} ${s.adresse}`;
      const helTekstA = `${s.navnA} ${s.adresseA}`;
      const alle = ord.every((o) => helTekst.includes(o)) || ordA.every((o) => helTekstA.includes(o));
      if (!alle) continue;
      score = ord.length > 1 ? 1.5 : Math.max(treffScore(s.adresse, q), treffScore(s.adresseA, qa)) * 0.5;
      if (score === 0) continue;
    }
    treff.push({ type: "sted", rad: s.rad, score });
  }
  return treff
    .sort((a, b) => b.score - a.score || navnFor(a).localeCompare(navnFor(b), "nb"))
    .slice(0, maks);
}

function navnFor(t: SokTreff): string {
  return t.type === "sted" ? t.rad[KART.NAVN] : t.navn;
}

/** Avgrensning [vest, sør, øst, nord] for alle steder i en kommune. */
export function kommuneBbox(data: KartData, nr: string): [number, number, number, number] | null {
  const idx = data.kommuner.findIndex(([k]) => k === nr);
  if (idx < 0) return null;
  let v = Infinity, s = Infinity, o = -Infinity, n = -Infinity;
  for (const r of data.steder) {
    if (r[KART.KOMMUNE] !== idx) continue;
    v = Math.min(v, r[KART.LNG]);
    o = Math.max(o, r[KART.LNG]);
    s = Math.min(s, r[KART.LAT]);
    n = Math.max(n, r[KART.LAT]);
  }
  return Number.isFinite(v) ? [v, s, o, n] : null;
}

// ---------------------------------------------------------------------------
// URL-tilstand
// ---------------------------------------------------------------------------

export type UrlTilstand = { sted: string | null; modus: Modus; kategori: Kategori | "alle"; smil: Set<Smile> };

const ALLE_SMIL: Smile[] = ["smil", "strek", "sur"];

export function lesUrl(search: string, kategorier: readonly string[]): UrlTilstand {
  const p = new URLSearchParams(search);
  const kat = p.get("kategori");
  const smilParam = p.get("vis");
  const smil = new Set<Smile>(
    smilParam ? (smilParam.split(",").filter((s) => (ALLE_SMIL as string[]).includes(s)) as Smile[]) : ALLE_SMIL,
  );
  return {
    sted: p.get("sted"),
    modus: p.get("modus") === "siste" ? "siste" : "tre-aar",
    kategori: kat && kategorier.includes(kat) ? (kat as Kategori) : "alle",
    smil: smil.size > 0 ? smil : new Set(ALLE_SMIL),
  };
}

export function skrivUrl(t: UrlTilstand): string {
  const p = new URLSearchParams();
  if (t.sted) p.set("sted", t.sted);
  if (t.modus !== "tre-aar") p.set("modus", t.modus);
  if (t.kategori !== "alle") p.set("kategori", t.kategori);
  if (t.smil.size < 3) p.set("vis", ALLE_SMIL.filter((s) => t.smil.has(s)).join(","));
  const q = p.toString();
  return q ? `?${q}` : "";
}
