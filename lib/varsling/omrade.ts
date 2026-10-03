/**
 * Områdehjelpere: søkelister for skjemaet, beskrivelser av et område og estimater.
 * Rene funksjoner over steder, så de kan testes uten filsystem.
 */
import { haversineKm } from "../geo";
import { smileFromKarakter, type Smile } from "../smile";
import { titleCase } from "../text";
import type { Sted } from "../types";
import type { Omrade } from "./typer";

/** [kommunenr, navn, fylke, lat, lng] */
export type KommuneValg = [string, string, string, number, number];
/** [navn, kommunenavn, lat, lng] */
export type PoststedValg = [string, string, number, number];

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

type Sum = { lat: number; lng: number; n: number };

function sentroide(sum: Sum): [number, number] {
  return [r4(sum.lat / sum.n), r4(sum.lng / sum.n)];
}

/** Kommuner og poststeder med midtpunkt (snitt av stedene der), sortert alfabetisk. */
export function sokelister(steder: readonly Sted[]): { kommuner: KommuneValg[]; poststeder: PoststedValg[] } {
  const kom = new Map<string, Sum & { navn: string; fylke: string }>();
  const post = new Map<string, Sum & { navn: string; kommune: string }>();
  for (const s of steder) {
    if (s.lat === null || s.lng === null) continue;
    if (s.kommunenr && s.kommune) {
      const k = kom.get(s.kommunenr) ?? { lat: 0, lng: 0, n: 0, navn: s.kommune, fylke: s.fylke ?? "" };
      k.lat += s.lat;
      k.lng += s.lng;
      k.n++;
      kom.set(s.kommunenr, k);
    }
    if (s.poststed) {
      const navn = titleCase(s.poststed);
      const key = `${navn}|${s.kommunenr ?? ""}`;
      const p = post.get(key) ?? { lat: 0, lng: 0, n: 0, navn, kommune: s.kommune ?? "" };
      p.lat += s.lat;
      p.lng += s.lng;
      p.n++;
      post.set(key, p);
    }
  }
  const kommuner: KommuneValg[] = [...kom].map(([nr, k]) => [nr, k.navn, k.fylke, ...sentroide(k)]);
  kommuner.sort((a, b) => a[1].localeCompare(b[1], "nb"));
  const kommunenavn = new Set(kommuner.map((k) => k[1]));
  // Poststeder som heter det samme som kommunen sin er overflødige (kommunen dekker dem).
  const poststeder: PoststedValg[] = [...post.values()]
    .filter((p) => !(p.navn === p.kommune && kommunenavn.has(p.navn)))
    .map((p) => [p.navn, p.kommune, ...sentroide(p)]);
  poststeder.sort((a, b) => a[0].localeCompare(b[0], "nb"));
  return { kommuner, poststeder };
}

export function kommuneNavn(steder: readonly Sted[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of steder) if (s.kommunenr && s.kommune && !m.has(s.kommunenr)) m.set(s.kommunenr, s.kommune);
  return m;
}

function listeTekst(navn: string[]): string {
  if (navn.length <= 1) return navn[0] ?? "";
  return `${navn.slice(0, -1).join(", ")} og ${navn[navn.length - 1]}`;
}

/**
 * Beskriver et område med ord, utledet fra datasettet (aldri fritekst fra brukeren, så ingen
 * kan legge egne meldinger inn i bekreftelses-e-posten).
 */
export function beskrivOmrade(omrade: Omrade, steder: readonly Sted[]): string {
  if (omrade.type === "kommuner") {
    const navn = kommuneNavn(steder);
    return listeTekst(omrade.kommuner.map((nr) => navn.get(nr) ?? nr));
  }
  let best: Sted | null = null;
  let bestKm = Infinity;
  for (const s of steder) {
    if (s.lat === null || s.lng === null) continue;
    const km = haversineKm(omrade.lat, omrade.lng, s.lat, s.lng);
    if (km < bestKm) {
      best = s;
      bestKm = km;
    }
  }
  const sted = best ? titleCase(best.poststed || best.kommune || "") : "";
  return sted ? `${omrade.km} km rundt et punkt i ${sted}` : `${omrade.km} km rundt punktet du valgte`;
}

export function iOmrade(omrade: Omrade, s: { lat: number | null; lng: number | null; kommunenr: string | null }): boolean {
  if (omrade.type === "kommuner") return s.kommunenr !== null && omrade.kommuner.includes(s.kommunenr);
  if (s.lat === null || s.lng === null) return false;
  return haversineKm(omrade.lat, omrade.lng, s.lat, s.lng) <= omrade.km;
}

export type Estimat = {
  steder: number;
  /** Tilsyn siste 12 måneder per smilefjes. */
  siste12: Record<Smile, number>;
  /** Antall ulike dager med minst ett treff for de valgte filtrene – et tak på antall e-poster i året. */
  dagerMedTreff: number;
};

export function estimat(omrade: Omrade, filtre: readonly Smile[], steder: readonly Sted[], iDag: string): Estimat {
  const fra = new Date(Date.parse(iDag) - 365 * 86_400_000).toISOString().slice(0, 10);
  const siste12: Record<Smile, number> = { smil: 0, strek: 0, sur: 0 };
  const dager = new Set<string>();
  let antall = 0;
  for (const s of steder) {
    if (!iOmrade(omrade, s)) continue;
    antall++;
    for (const t of s.tilsyn) {
      if (t.dato < fra) continue;
      const sm = smileFromKarakter(t.karakter);
      if (!sm) continue;
      siste12[sm]++;
      if (filtre.includes(sm)) dager.add(t.dato);
    }
  }
  return { steder: antall, siste12, dagerMedTreff: dager.size };
}

