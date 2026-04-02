/**
 * Shared utility functions for the Smilefjeskartet app.
 * Extracted from page.tsx and analyse/page.tsx for reuse and testability.
 */

/**
 * Format a dato string from "ddmmyyyy" to "dd.mm.yyyy".
 */
export function formatDato(ddmmyyyy: string): string {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return ddmmyyyy;
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Parse a "ddmmyyyy" string to a Date object.
 */
export function parseDatoToDate(ddmmyyyy: string): Date | null {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return null;
  const year = parseInt(d.slice(4, 8));
  const month = parseInt(d.slice(2, 4)) - 1;
  const day = parseInt(d.slice(0, 2));
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

/**
 * Convert an unknown value to a finite number, or null.
 */
export function toNumberMaybe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Properties from a tilsyn GeoJSON feature.
 */
export type TilsynProperties = {
  tilsynsobjektid: string;
  orgnummer: string | null;
  navn: string;
  adresse: string;
  dato: string;
  karakter?: number;
  karakter1?: string | number;
  karakter2?: string | number;
  karakter3?: string | number;
  karakter4?: string | number;
  karakter5?: string | number;
  karakter6?: string | number;
  karakter7?: string | number;
  karakter8?: string | number;
  karakter9?: string | number;
  karakter10?: string | number;
  status: string | null;
};

/**
 * Compute the smile score from karakter fields.
 * Uses the max of karakter1–karakter10 (only values 0–3 count; 4/5 are ignored).
 * Falls back to karakter if no category scores are available.
 * Returns -1 if no valid score can be determined.
 */
export function computeSmileScore(p: TilsynProperties): number {
  const candidates: number[] = [];

  const raws: unknown[] = [
    p.karakter1, p.karakter2, p.karakter3, p.karakter4,
    p.karakter5, p.karakter6, p.karakter7, p.karakter8,
    p.karakter9, p.karakter10,
  ];

  for (const r of raws) {
    const n = toNumberMaybe(r);
    if (n === null) continue;
    if (n >= 0 && n <= 3) candidates.push(n);
  }

  if (candidates.length > 0) return Math.max(...candidates);

  const fallback = toNumberMaybe(p.karakter);
  if (fallback !== null && fallback >= 0 && fallback <= 3) return fallback;

  return -1;
}

/**
 * Get a human-readable label for a karakter value.
 */
export function karakterLabel(k: number): string {
  switch (k) {
    case 0: return "0 = Ingen brudd på regelverket funnet. Stort smil.";
    case 1: return "1 = Mindre brudd på regelverket som ikke krever oppfølging. Stort smil.";
    case 2: return "2 = Brudd på regelverket som krever oppfølging. Strekmunn.";
    case 3: return "3 = Alvorlig brudd på regelverket. Sur munn.";
    case 4: return "4 = Ikke aktuelt – Påvirker ikke smilefjeskarakter.";
    case 5: return "5 = Ikke vurdert – Påvirker ikke smilefjeskarakter.";
    default: return "Ukjent karakter.";
  }
}

/**
 * Get the smile emoji for a score.
 */
export function smileEmoji(score: number): string {
  if (score === 0 || score === 1) return "😊";
  if (score === 2) return "😐";
  if (score === 3) return "😠";
  return "❓";
}

/**
 * Get the smile group name from a score.
 */
export function smileGroupFromScore(score: number): "smil" | "strek" | "sur" | null {
  if (score === 0 || score === 1) return "smil";
  if (score === 2) return "strek";
  if (score === 3) return "sur";
  return null;
}

/**
 * Normalize a string for search: lowercase, collapse whitespace, trim.
 */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Validate an email address (basic check).
 */
export function isValidEmail(email: string): boolean {
  return typeof email === "string" && email.includes("@") && email.length >= 3;
}

/**
 * Validate latitude value.
 */
export function isValidLatitude(lat: number): boolean {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/**
 * Validate longitude value.
 */
export function isValidLongitude(lng: number): boolean {
  return typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/**
 * Convert GeoJSON Position to [lng, lat] tuple, or null if invalid.
 */
export function toLngLatTuple(coords: GeoJSON.Position): [number, number] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  return [lng, lat];
}

/**
 * Haversine distance between two points in km.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
