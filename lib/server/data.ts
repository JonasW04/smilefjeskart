/**
 * Serverside tilgang til generated/steder.json. Leses én gang per serverinstans.
 */
import fs from "node:fs";
import path from "node:path";
import { haversineKm } from "../geo";
import { andel, ordinaerFordeling, type Fordeling } from "../stats";
import type { Datasett, Sted } from "../types";

const STEDER_PATH = path.join(process.cwd(), "generated", "steder.json");

let cache: { datasett: Datasett; bySlug: Map<string, Sted> } | null = null;

function load() {
  if (!cache) {
    const datasett = JSON.parse(fs.readFileSync(STEDER_PATH, "utf8")) as Datasett;
    cache = { datasett, bySlug: new Map(datasett.steder.map((s) => [s.slug, s])) };
  }
  return cache;
}

export function getDatasett(): Datasett {
  return load().datasett;
}

export function getSteder(): Sted[] {
  return load().datasett.steder;
}

export function getSted(slug: string): Sted | null {
  return load().bySlug.get(slug) ?? null;
}

export function naermeste(s: Sted, n: number): Array<{ sted: Sted; km: number }> {
  if (s.lat === null || s.lng === null) return [];
  const { lat, lng } = s;
  return getSteder()
    .filter((o) => o.id !== s.id && o.lat !== null && o.lng !== null)
    .map((o) => ({ sted: o, km: haversineKm(lat, lng, o.lat!, o.lng!) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

export function kjedeSteder(kjedeSlug: string): Sted[] {
  return getSteder().filter((s) => s.kjedeSlug === kjedeSlug);
}

const kommuneCache = new Map<string, Fordeling>();

/** Utfall av ordinære tilsyn i en kommune. */
export function kommuneFordeling(kommunenr: string): Fordeling {
  let f = kommuneCache.get(kommunenr);
  if (!f) {
    f = ordinaerFordeling(getSteder().filter((s) => s.kommunenr === kommunenr));
    kommuneCache.set(kommunenr, f);
  }
  return f;
}

const kjedeCache = new Map<string, Fordeling>();

export function kjedeFordeling(kjedeSlug: string): Fordeling {
  let f = kjedeCache.get(kjedeSlug);
  if (!f) {
    f = ordinaerFordeling(kjedeSteder(kjedeSlug));
    kjedeCache.set(kjedeSlug, f);
  }
  return f;
}

let landCache: Fordeling | null = null;

/** Utfall av alle ordinære tilsyn i Norge. */
export function landFordeling(): Fordeling {
  return (landCache ??= ordinaerFordeling(getSteder()));
}

export { andel };
