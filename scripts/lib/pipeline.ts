/**
 * Rene transformasjoner fra Mattilsynets CSV til nettstedets datamodell.
 * Ingen nettverk eller filsystem her – det ligger i scripts/build-data.ts.
 */
import Papa from "papaparse";
import { kategoriForSted, kjedeFraNavn, type Kategori } from "../../lib/classify";
import { fylkeFraKommunenr } from "../../lib/geo";
import { totalKarakter } from "../../lib/smile";
import { slugify, titleCase } from "../../lib/text";
import type { KartData, KartRad, Sted, Tilsyn } from "../../lib/types";

export type TilsynRow = {
  tilsynsobjektid: string;
  orgnummer?: string;
  navn: string;
  adrlinje1?: string;
  adrlinje2?: string;
  postnr?: string;
  poststed?: string;
  tilsynid?: string;
  dato: string; // ddmmyyyy
  total_karakter?: string;
  tilsynsbesoektype?: string;
  karakter1?: string;
  karakter2?: string;
  karakter3?: string;
  karakter4?: string;
};

export type Koordinat = { lng: number; lat: number };
export type Kommune = { nr: string; navn: string };

export function parseCsv(text: string): TilsynRow[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parsed = Papa.parse<TilsynRow>(clean, { header: true, delimiter: ";", skipEmptyLines: true });
  return parsed.data.filter((r) => r?.tilsynsobjektid && r?.navn && /^\d{8}$/.test(r?.dato?.trim() ?? ""));
}

/** "05012016" → "2016-01-05" */
export function isoFromDdmmyyyy(d: string): string {
  const t = d.trim();
  return `${t.slice(4, 8)}-${t.slice(2, 4)}-${t.slice(0, 2)}`;
}

export function parseKarakter(v: string | undefined): number {
  if (v === undefined) return -1;
  const t = v.trim();
  if (t === "") return -1;
  const n = Number(t);
  return Number.isInteger(n) ? n : -1;
}

export function buildAdresse(r: Pick<TilsynRow, "adrlinje1" | "adrlinje2">): string {
  return [r.adrlinje1, r.adrlinje2]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

/** Søkestreng til Kartverkets adresse-API. Samme format som før, så geokode-cachen gjenbrukes. */
export function buildGeocodeQuery(r: TilsynRow): string {
  return [r.adrlinje1, r.postnr, r.poststed]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function validOrgnr(orgnr?: string): string | null {
  const t = orgnr?.trim() ?? "";
  return /^\d{9}$/.test(t) ? t : null;
}

function rowToTilsyn(r: TilsynRow): Tilsyn {
  const temaer: [number, number, number, number] = [
    parseKarakter(r.karakter1),
    parseKarakter(r.karakter2),
    parseKarakter(r.karakter3),
    parseKarakter(r.karakter4),
  ];
  return {
    dato: isoFromDdmmyyyy(r.dato),
    karakter: totalKarakter(parseKarakter(r.total_karakter), temaer),
    temaer,
    oppfolging: r.tilsynsbesoektype?.trim() === "1",
  };
}

/** Kort, stabil hash av en streng (FNV-1a, base36). Brukes til å skille like slugs. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).slice(0, 5);
}

export type BuildOptions = {
  kommuneForPostnr: (postnr: string) => Kommune | null;
  koordinatFor: (row: TilsynRow) => Koordinat | null;
};

/**
 * Grupperer tilsyn per tilsynsobjekt. Stamdata (navn, adresse) hentes fra det nyeste tilsynet,
 * siden steder kan ha byttet navn underveis.
 */
export function buildSteder(rows: TilsynRow[], opts: BuildOptions): Sted[] {
  const grupper = new Map<string, TilsynRow[]>();
  for (const r of rows) {
    const id = r.tilsynsobjektid.trim();
    let g = grupper.get(id);
    if (!g) grupper.set(id, (g = []));
    g.push(r);
  }

  const steder: Sted[] = [];
  for (const [id, g] of grupper) {
    g.sort((a, b) => isoFromDdmmyyyy(a.dato).localeCompare(isoFromDdmmyyyy(b.dato)));
    // Fjern eksakte duplikater (samme dato og samme karakterer)
    const tilsyn: Tilsyn[] = [];
    const sett = new Set<string>();
    for (const r of g) {
      const t = rowToTilsyn(r);
      const key = `${t.dato}|${t.karakter}|${t.temaer.join(",")}|${t.oppfolging}`;
      if (sett.has(key)) continue;
      sett.add(key);
      tilsyn.push(t);
    }

    const siste = g[g.length - 1];
    const rawPostnr = (siste.postnr ?? "").trim();
    const postnr = /^\d{1,4}$/.test(rawPostnr) && Number(rawPostnr) > 0 ? rawPostnr.padStart(4, "0") : "";
    const kommune = postnr ? opts.kommuneForPostnr(postnr) : null;
    const fylke = fylkeFraKommunenr(kommune?.nr ?? null);
    const navn = siste.navn.trim().replace(/\s+/g, " ");
    const kjede = kjedeFraNavn(navn);
    const koord = opts.koordinatFor(siste);

    steder.push({
      id,
      slug: "",
      navn,
      orgnr: validOrgnr(siste.orgnummer),
      adresse: buildAdresse(siste),
      postnr,
      poststed: titleCase((siste.poststed ?? "").trim()),
      kommunenr: kommune?.nr ?? null,
      kommune: kommune?.navn ?? null,
      fylkenr: fylke?.nr ?? null,
      fylke: fylke?.navn ?? null,
      kjede: kjede?.navn ?? null,
      kjedeSlug: kjede?.slug ?? null,
      kategori: kategoriForSted(navn, kjede),
      lng: koord ? round(koord.lng, 6) : null,
      lat: koord ? round(koord.lat, 6) : null,
      tilsyn,
    });
  }

  assignSlugs(steder);
  steder.sort((a, b) => a.slug.localeCompare(b.slug));
  return steder;
}

/**
 * Gir hvert sted en unik slug "navn-poststed". Ved kollisjon beholder stedet med eldste
 * tilsyn den rene slugen, og de andre får et stabilt suffiks fra id-en.
 */
export function assignSlugs(steder: Sted[]): void {
  const grupper = new Map<string, Sted[]>();
  for (const s of steder) {
    const navnSlug = slugify(s.navn) || "sted";
    const stedSlug = slugify(s.poststed);
    const base = stedSlug && !navnSlug.endsWith(stedSlug) ? `${navnSlug}-${stedSlug}` : navnSlug;
    let g = grupper.get(base);
    if (!g) grupper.set(base, (g = []));
    g.push(s);
  }
  for (const [base, g] of grupper) {
    g.sort((a, b) => (a.tilsyn[0]?.dato ?? "").localeCompare(b.tilsyn[0]?.dato ?? "") || a.id.localeCompare(b.id));
    g.forEach((s, i) => {
      s.slug = i === 0 ? base : `${base}-${shortHash(s.id)}`;
    });
  }
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function sisteTilsyn(s: Sted): Tilsyn {
  return s.tilsyn[s.tilsyn.length - 1];
}

export function toKartData(steder: Sted[], kategorier: Kategori[], generert: string): KartData {
  const kommuneIdx = new Map<string, number>();
  const kommuner: KartData["kommuner"] = [];
  const katIdx = new Map(kategorier.map((k, i) => [k, i]));

  const rader: KartRad[] = [];
  for (const s of steder) {
    if (s.lng === null || s.lat === null) continue;
    let ki = -1;
    if (s.kommunenr) {
      ki = kommuneIdx.get(s.kommunenr) ?? -1;
      if (ki === -1) {
        ki = kommuner.length;
        kommuneIdx.set(s.kommunenr, ki);
        kommuner.push([s.kommunenr, s.kommune ?? s.kommunenr, s.fylke ?? ""]);
      }
    }
    const siste = sisteTilsyn(s);
    const verste = Math.max(-1, ...s.tilsyn.map((t) => t.karakter));
    const adresse = [s.adresse, s.poststed].filter(Boolean).join(", ");
    rader.push([
      s.slug,
      s.navn,
      adresse,
      round(s.lng, 5),
      round(s.lat, 5),
      siste.karakter,
      Number(siste.dato.replace(/-/g, "")),
      ki,
      katIdx.get(s.kategori) ?? -1,
      s.tilsyn.length,
      verste,
    ]);
  }
  return { v: 1, generert, kommuner, kategorier, steder: rader };
}
