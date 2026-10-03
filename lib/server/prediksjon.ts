/**
 * Serverside tilgang til generated/prediksjon.json (lages av scripts/build-prediksjon.ts).
 * Leses én gang per serverinstans.
 */
import fs from "node:fs";
import path from "node:path";
import type { PrediksjonData } from "../prediksjon/typer";

const PREDIKSJON_PATH = path.join(process.cwd(), "generated", "prediksjon.json");

export type StedPrediksjon = { besok: number; utfall: number };

let cache: { data: PrediksjonData; bySlug: Map<string, StedPrediksjon> } | null | undefined;

function load() {
  if (cache === undefined) {
    try {
      const data = JSON.parse(fs.readFileSync(PREDIKSJON_PATH, "utf8")) as PrediksjonData;
      cache = { data, bySlug: new Map(data.steder.map(([slug, b, u]) => [slug, { besok: b / 1000, utfall: u / 1000 }])) };
    } catch {
      // Uten fila (f.eks. lokalt før første kjøring) skal resten av nettstedet fortsatt virke.
      cache = null;
    }
  }
  return cache;
}

export function getPrediksjon(): PrediksjonData | null {
  return load()?.data ?? null;
}

export function getStedPrediksjon(slug: string): StedPrediksjon | null {
  return load()?.bySlug.get(slug) ?? null;
}
