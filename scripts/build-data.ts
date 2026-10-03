/**
 * Daglig datajobb: laster ned Mattilsynets tilsyns-CSV, beriker med koordinater
 * (Kartverket) og kommune/fylke (Bring postnummerregister), og skriver:
 *
 *   generated/steder.json   – alle steder med full tilsynshistorikk (brukes på serveren)
 *   public/data/kart.json   – kompakt kartdata for nettleseren
 *   public/tilsyn*.json(geojson) – gammelt format, beholdes til alle sider er flyttet over
 */
import fs from "node:fs";
import path from "node:path";
import type * as GeoJSON from "geojson";
import { KATEGORI_NAVN, type Kategori } from "../lib/classify";
import { sisteTilsyn } from "../lib/stats";
import { titleCase } from "../lib/text";
import type { Datasett, Sted } from "../lib/types";
import {
  buildGeocodeQuery,
  buildSteder,
  isoFromDdmmyyyy,
  parseCsv,
  toKartData,
  type Kommune,
  type Koordinat,
  type TilsynRow,
} from "./lib/pipeline";

const CSV_URL = "https://matnyttig.mattilsynet.no/smilefjes/tilsyn.csv";
const KARTVERKET_SOK_URL = "https://ws.geonorge.no/adresser/v1/sok";
const KOMMUNER_URL = "https://ws.geonorge.no/kommuneinfo/v1/kommuner";
const POSTNR_URL = "https://www.bring.no/postnummerregister-ansi.txt";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "data");
const GEOCODE_CACHE_PATH = path.join(CACHE_DIR, "geocode-cache.json");
const STEDER_PATH = path.join(ROOT, "generated", "steder.json");
const KART_PATH = path.join(ROOT, "public", "data", "kart.json");
const LEGACY_GEOJSON_PATH = path.join(ROOT, "public", "tilsyn.geojson");
const LEGACY_DIFF_PATH = path.join(ROOT, "public", "tilsyn-diff.json");
const LEGACY_META_PATH = path.join(ROOT, "public", "tilsyn-meta.json");

const GEOCODE_DELAY_MS = Number(process.env.GEOCODE_DELAY_MS ?? "80");
const MAX_DIFF_ENTRIES = 365;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Oppslag
// ---------------------------------------------------------------------------

async function lastKommuneregister(): Promise<(postnr: string) => Kommune | null> {
  const navn = new Map<string, string>();
  try {
    const res = await fetch(KOMMUNER_URL);
    if (res.ok) {
      for (const k of (await res.json()) as Array<{ kommunenummer: string; kommunenavnNorsk: string }>) {
        navn.set(k.kommunenummer, k.kommunenavnNorsk);
      }
    }
  } catch (e) {
    console.warn("Kunne ikke hente kommunenavn fra Kartverket:", e);
  }

  const register = new Map<string, Kommune>();
  try {
    const res = await fetch(POSTNR_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
    for (const line of text.split(/\r?\n/)) {
      const [postnr, , kommunenr, kommunenavn] = line.split("\t");
      if (!/^\d{4}$/.test(postnr ?? "") || !/^\d{4}$/.test(kommunenr ?? "")) continue;
      register.set(postnr, { nr: kommunenr, navn: navn.get(kommunenr) ?? titleCase(kommunenavn) });
    }
  } catch (e) {
    console.warn("Kunne ikke hente postnummerregister – kommune/fylke mangler i denne kjøringen:", e);
  }
  console.log(`Postnummerregister: ${register.size} postnumre, ${navn.size} kommunenavn`);
  return (postnr) => register.get(postnr) ?? null;
}

type CacheEntry = { lat: number; lon: number };

async function geokod(query: string, postnr: string | undefined, fuzzy: boolean): Promise<CacheEntry | null> {
  const params = new URLSearchParams({ sok: query, treffPerSide: "1", side: "0" });
  if (fuzzy) params.set("fuzzy", "true");
  try {
    const res = await fetch(`${KARTVERKET_SOK_URL}?${params}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      adresser?: Array<{ postnummer?: string; representasjonspunkt?: { lat?: number; lon?: number } }>;
    };
    const a = body.adresser?.[0];
    const lat = a?.representasjonspunkt?.lat;
    const lon = a?.representasjonspunkt?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    // Uskarpe treff godtas bare hvis postnummeret stemmer.
    if (fuzzy && postnr && a?.postnummer !== postnr.padStart(4, "0")) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

async function geokodAlle(rows: TilsynRow[]): Promise<(row: TilsynRow) => Koordinat | null> {
  let cache: Record<string, CacheEntry> = {};
  if (fs.existsSync(GEOCODE_CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(GEOCODE_CACHE_PATH, "utf8"));
  }

  // Bare nyeste rad per sted trenger koordinater.
  const nyeste = new Map<string, TilsynRow>();
  for (const r of rows) {
    const cur = nyeste.get(r.tilsynsobjektid);
    if (!cur || isoFromDdmmyyyy(r.dato) >= isoFromDdmmyyyy(cur.dato)) {
      nyeste.set(r.tilsynsobjektid, r);
    }
  }

  let forsok = 0;
  let treff = 0;
  const feilet: Array<{ navn: string; query: string }> = [];
  for (const r of nyeste.values()) {
    const q = buildGeocodeQuery(r);
    if (!q || cache[q]) continue;
    forsok++;
    const geo = (await geokod(q, r.postnr, false)) ?? (await geokod(q, r.postnr, true));
    await sleep(GEOCODE_DELAY_MS);
    if (geo) {
      cache[q] = geo;
      treff++;
    } else {
      feilet.push({ navn: r.navn, query: q });
    }
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
  if (feilet.length > 0) {
    fs.writeFileSync(path.join(CACHE_DIR, "failed-addresses.json"), JSON.stringify(feilet, null, 2), "utf8");
  }
  console.log(`Geokoding: ${forsok} nye oppslag, ${treff} treff, ${feilet.length} uten treff`);

  return (row) => {
    const c = cache[buildGeocodeQuery(row)];
    return c ? { lng: c.lon, lat: c.lat } : null;
  };
}

// ---------------------------------------------------------------------------
// Skriving
// ---------------------------------------------------------------------------

/** Ett sted per linje, så de daglige git-diffene blir små og lesbare. */
function skrivDatasett(d: Datasett) {
  fs.mkdirSync(path.dirname(STEDER_PATH), { recursive: true });
  const { steder, ...meta } = d;
  const head = JSON.stringify(meta).slice(0, -1);
  const body = steder.map((s) => JSON.stringify(s)).join(",\n");
  fs.writeFileSync(STEDER_PATH, `${head},"steder":[\n${body}\n]}\n`, "utf8");
}

function skrivJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data), "utf8");
}

// ---------------------------------------------------------------------------
// Gammelt format (tilsyn.geojson, tilsyn-diff.json, tilsyn-meta.json)
// Fjernes når kart- og analysesidene er flyttet til de nye filene.
// ---------------------------------------------------------------------------

type LegacyProps = {
  tilsynsobjektid: string;
  orgnummer: string | null;
  navn: string;
  adresse: string;
  dato: string;
  karakter: number;
  karakter1: number;
  karakter2: number;
  karakter3: number;
  karakter4: number;
  status: string | null;
};

function toLegacy(s: Sted): GeoJSON.Feature<GeoJSON.Point, LegacyProps> | null {
  if (s.lng === null || s.lat === null) return null;
  const t = sisteTilsyn(s);
  const [y, m, d] = t.dato.split("-");
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    properties: {
      tilsynsobjektid: s.id,
      orgnummer: s.orgnr,
      navn: s.navn,
      adresse: [s.adresse, s.postnr, s.poststed].filter(Boolean).join(", "),
      dato: `${d}${m}${y}`,
      karakter: t.karakter,
      karakter1: t.temaer[0],
      karakter2: t.temaer[1],
      karakter3: t.temaer[2],
      karakter4: t.temaer[3],
      status: t.oppfolging ? "1" : "0",
    },
  };
}

function skrivLegacy(steder: Sted[], now: string) {
  const features = steder.map(toLegacy).filter((f): f is NonNullable<typeof f> => f !== null);

  const forrige = new Map<string, LegacyProps>();
  let forrigeNedlasting: string | null = null;
  try {
    forrigeNedlasting = JSON.parse(fs.readFileSync(LEGACY_META_PATH, "utf8")).lastDownload ?? null;
  } catch {}
  try {
    const prev = JSON.parse(fs.readFileSync(LEGACY_GEOJSON_PATH, "utf8")) as GeoJSON.FeatureCollection<
      GeoJSON.Point,
      LegacyProps
    >;
    for (const f of prev.features) forrige.set(f.properties.tilsynsobjektid, f.properties);
  } catch {}

  const nye: LegacyProps[] = [];
  const endrede: LegacyProps[] = [];
  const naa = new Set<string>();
  for (const f of features) {
    const p = f.properties;
    naa.add(p.tilsynsobjektid);
    const prev = forrige.get(p.tilsynsobjektid);
    if (!prev) nye.push(p);
    else if (prev.dato !== p.dato || prev.karakter !== p.karakter) endrede.push(p);
  }
  const fjernet = [...forrige.keys()].filter((id) => !naa.has(id));

  let historikk: unknown[] = [];
  try {
    const existing = JSON.parse(fs.readFileSync(LEGACY_DIFF_PATH, "utf8"));
    if (Array.isArray(existing)) historikk = existing;
  } catch {}
  historikk.unshift({
    generatedAt: now,
    previousDownload: forrigeNedlasting,
    summary: {
      previousTotal: forrige.size,
      currentTotal: features.length,
      newCount: nye.length,
      changedCount: endrede.length,
      removedCount: fjernet.length,
    },
    newInspections: nye,
    changedInspections: endrede,
    removedIds: fjernet,
  });
  historikk = historikk.slice(0, MAX_DIFF_ENTRIES);

  fs.writeFileSync(LEGACY_DIFF_PATH, JSON.stringify(historikk, null, 2), "utf8");
  fs.writeFileSync(
    LEGACY_META_PATH,
    JSON.stringify(
      {
        lastDownload: now,
        totalFeatures: features.length,
        downloadHistory: [
          {
            downloadedAt: now,
            totalFeatures: features.length,
            newCount: nye.length,
            changedCount: endrede.length,
            removedCount: fjernet.length,
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(LEGACY_GEOJSON_PATH, JSON.stringify({ type: "FeatureCollection", features }), "utf8");
  console.log(`Gammelt format: ${nye.length} nye, ${endrede.length} endrede, ${fjernet.length} fjernet`);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("Laster ned", CSV_URL);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Kunne ikke laste ned CSV: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  console.log(`${rows.length} tilsyn i CSV-en`);
  if (rows.length < 1000) throw new Error("Mistenkelig få rader i CSV-en – avbryter for ikke å overskrive gode data.");

  const [kommuneForPostnr, koordinatFor] = await Promise.all([lastKommuneregister(), geokodAlle(rows)]);
  const steder = buildSteder(rows, { kommuneForPostnr, koordinatFor });

  const now = new Date().toISOString();
  const antallTilsyn = steder.reduce((n, s) => n + s.tilsyn.length, 0);
  skrivDatasett({ generert: now, kilde: CSV_URL, antallTilsyn, steder });
  skrivJson(KART_PATH, toKartData(steder, Object.keys(KATEGORI_NAVN) as Kategori[], now));
  skrivLegacy(steder, now);

  const medKoord = steder.filter((s) => s.lat !== null).length;
  const medKommune = steder.filter((s) => s.kommunenr !== null).length;
  console.log(
    `✅ ${steder.length} steder, ${antallTilsyn} tilsyn, ${medKoord} med koordinater, ${medKommune} med kommune`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
