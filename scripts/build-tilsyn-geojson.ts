import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type * as GeoJSON from "geojson";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TilsynRow = {
  tilsynsobjektid: string;
  orgnummer?: string;
  navn: string;
  adrlinje1?: string;
  adrlinje2?: string;
  postnr?: string;
  poststed?: string;
  tilsynid?: string;
  tilsynsbesoektype?: string;
  dato: string; // ddmmyyyy
  total_karakter?: string;
  karakter1?: string;
  karakter2?: string;
  karakter3?: string;
  karakter4?: string;
};

type LngLat = { lon: number; lat: number };

type TilsynProperties = {
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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Official Mattilsynet CSV URL (same as used by smilefjes.mattilsynet.no)
const CSV_URL = "https://matnyttig.mattilsynet.no/smilefjes/tilsyn.csv";

// Kartverket Adresse REST-API (free, no API key needed)
const KARTVERKET_SOK_URL = "https://ws.geonorge.no/adresser/v1/sok";

const DATA_DIR = path.join(process.cwd(), "data");
const OUT_PATH = path.join(process.cwd(), "public", "tilsyn.geojson");
const GEOCODE_CACHE_PATH = path.join(DATA_DIR, "geocode-cache.json");

// Throttle delay between geocode requests (be nice to public APIs)
const GEOCODE_DELAY_MS = Number(process.env.GEOCODE_DELAY_MS ?? "80");

// Optional limit for testing; 0 = no limit
const MAX_FEATURES = Number(process.env.MAX_FEATURES ?? "0");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Convert ddmmyyyy to a sortable number (yyyymmdd). */
function parseDato(ddmmyyyy: string): number {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return 0;
  return Number(`${d.slice(4, 8)}${d.slice(2, 4)}${d.slice(0, 2)}`);
}

/** Parse a karakter string to a number, returning -1 for invalid values. */
function parseKarakter(v: string | undefined): number {
  if (!v) return -1;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : -1;
}

/** Build a display address from the CSV fields. */
function buildAdresse(r: TilsynRow): string {
  return [r.adrlinje1, r.adrlinje2, r.postnr, r.poststed]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

/** Build a geocode search string from the CSV fields. */
function buildGeocodeQuery(r: TilsynRow): string {
  const parts = [r.adrlinje1, r.postnr, r.poststed]
    .map((s) => s?.trim())
    .filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Check if a string is a valid 9-digit Norwegian org number. */
function isValidOrgnr(orgnr?: string): orgnr is string {
  if (!orgnr) return false;
  return /^\d{9}$/.test(orgnr.trim());
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

function extractLngLat(payload: unknown): LngLat | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const adresser = obj["adresser"];
  if (!Array.isArray(adresser) || adresser.length === 0) return null;

  const rp = (adresser[0] as Record<string, unknown>)[
    "representasjonspunkt"
  ] as Record<string, unknown> | undefined;
  const lat = rp?.["lat"];
  const lon = rp?.["lon"];
  if (typeof lat === "number" && typeof lon === "number") return { lat, lon };
  return null;
}

async function geocodeKartverket(query: string): Promise<LngLat | null> {
  const url =
    `${KARTVERKET_SOK_URL}?` +
    new URLSearchParams({
      sok: query,
      treffPerSide: "1",
      side: "0",
      filtrer: "adresser.representasjonspunkt",
    }).toString();

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return extractLngLat(await res.json());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // ---- 1) Download CSV from Mattilsynet ----
  console.log("Downloading CSV:", CSV_URL);
  const csvRes = await fetch(CSV_URL);
  if (!csvRes.ok) {
    throw new Error(`Failed to download CSV: HTTP ${csvRes.status}`);
  }
  let csvText = await csvRes.text();

  // Strip BOM if present
  if (csvText.charCodeAt(0) === 0xfeff) {
    csvText = csvText.slice(1);
  }

  const parsed = Papa.parse<TilsynRow>(csvText, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  const rows = parsed.data.filter(
    (r) => r?.tilsynsobjektid && r?.dato && r?.navn,
  );
  console.log(`Parsed ${rows.length} rows (${parsed.errors.length} errors)`);

  // ---- 2) Keep only the latest inspection per location ----
  const latest = new Map<string, TilsynRow>();
  for (const r of rows) {
    const key = r.tilsynsobjektid;
    const cur = latest.get(key);
    if (!cur || parseDato(r.dato) > parseDato(cur.dato)) {
      latest.set(key, r);
    }
  }
  let latestRows = [...latest.values()];
  console.log(`Unique locations (latest per location): ${latestRows.length}`);

  if (MAX_FEATURES > 0) {
    latestRows = latestRows.slice(0, MAX_FEATURES);
    console.log(`Limited to ${latestRows.length} features (MAX_FEATURES=${MAX_FEATURES})`);
  }

  // ---- 3) Load geocode cache ----
  let geocodeCache: Record<string, LngLat> = {};
  if (fs.existsSync(GEOCODE_CACHE_PATH)) {
    geocodeCache = JSON.parse(
      fs.readFileSync(GEOCODE_CACHE_PATH, "utf8"),
    ) as Record<string, LngLat>;
  }

  // ---- 4) Build GeoJSON features ----
  const features: GeoJSON.Feature<GeoJSON.Point, TilsynProperties>[] = [];
  let geocodeAttempts = 0;
  let geocodeHits = 0;
  let cacheHits = 0;
  const failedAddresses: Array<{ navn: string; query: string }> = [];

  for (const r of latestRows) {
    const adresse = buildAdresse(r);
    if (!adresse) continue;

    const geocodeQuery = buildGeocodeQuery(r);
    if (!geocodeQuery) continue;

    let geo: LngLat | null = geocodeCache[geocodeQuery] ?? null;

    if (geo) {
      cacheHits++;
    } else {
      geocodeAttempts++;
      geo = await geocodeKartverket(geocodeQuery);

      if (geo) {
        geocodeCache[geocodeQuery] = geo;
        geocodeHits++;
      } else {
        failedAddresses.push({ navn: r.navn, query: geocodeQuery });
      }

      await sleep(GEOCODE_DELAY_MS);
    }

    if (!geo) continue;

    const orgnr = r.orgnummer?.trim();

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [geo.lon, geo.lat] },
      properties: {
        tilsynsobjektid: r.tilsynsobjektid,
        orgnummer: isValidOrgnr(orgnr) ? orgnr : null,
        navn: r.navn.trim(),
        adresse,
        dato: r.dato,
        karakter: parseKarakter(r.total_karakter),
        karakter1: parseKarakter(r.karakter1),
        karakter2: parseKarakter(r.karakter2),
        karakter3: parseKarakter(r.karakter3),
        karakter4: parseKarakter(r.karakter4),
        status: r.tilsynsbesoektype ?? null,
      },
    });
  }

  // ---- 5) Write cache + output ----
  fs.writeFileSync(
    GEOCODE_CACHE_PATH,
    JSON.stringify(geocodeCache, null, 2),
    "utf8",
  );

  if (failedAddresses.length > 0) {
    const failedPath = path.join(DATA_DIR, "failed-addresses.json");
    fs.writeFileSync(
      failedPath,
      JSON.stringify({ count: failedAddresses.length, addresses: failedAddresses }, null, 2),
      "utf8",
    );
    console.log(`Failed addresses written to ${failedPath}`);
  }

  const fc: GeoJSON.FeatureCollection<GeoJSON.Point, TilsynProperties> = {
    type: "FeatureCollection",
    features,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(fc), "utf8");

  console.log(
    `\nGeocode: ${geocodeAttempts} attempts, ${geocodeHits} hits, ${cacheHits} from cache, ${failedAddresses.length} failed`,
  );
  console.log(`✅ Wrote ${features.length} features to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
