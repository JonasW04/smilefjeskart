import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type TilsynRow = {
  tilsynsobjektid: string;
  orgnummer?: string;
  navn: string;
  adrlinje1?: string;
  adrlinje2?: string;
  postnr?: string;
  poststed?: string;
  tilsynid?: string;
  status?: string;
  dato: string; // ddmmyyyy
  total_karakter: string;
};

type BrregAdresse = {
  adresse?: string[]; // gate, ev. ekstra linjer
  postnummer?: string;
  poststed?: string;
};

type BrregEntity = {
  organisasjonsnummer: string;
  navn?: string;
  forretningsadresse?: BrregAdresse;
  beliggenhetsadresse?: BrregAdresse;
};

type LngLat = { lon: number; lat: number };

type TilsynProperties = {
  tilsynsobjektid: string;
  orgnummer: string | null;
  navn: string;
  adresse: string;
  dato: string;
  karakter: number;
  status: string | null;
  adressekilde: "BRREG" | "MAT";
};

const CSV_URL = "https://data.mattilsynet.no/smilefjes-tilsyn.csv";

// BRREG (Enhetsregisteret) – prøv underenheter først, deretter enheter. :contentReference[oaicite:2]{index=2}
const BRREG_UNDERENHET = (orgnr: string) =>
  `https://data.brreg.no/enhetsregisteret/api/underenheter/${encodeURIComponent(orgnr)}`;
const BRREG_ENHET = (orgnr: string) =>
  `https://data.brreg.no/enhetsregisteret/api/enheter/${encodeURIComponent(orgnr)}`;

// Kartverket Adresse REST-API (fritt tilgjengelig) :contentReference[oaicite:3]{index=3}
const KARTVERKET_SOK_URL = "https://ws.geonorge.no/adresser/v1/sok";

const MAX_FEATURES = Number(process.env.MAX_FEATURES ?? "300");
const DATA_DIR = path.join(process.cwd(), "data");
const OUT_PATH = path.join(process.cwd(), "public", "tilsyn.geojson");

// Cache-filer
const BRREG_CACHE_PATH = path.join(DATA_DIR, "brreg-cache.json");
const GEOCODE_CACHE_PATH = path.join(DATA_DIR, "geocode-cache.json");

// “Snill” throttling
const BRREG_DELAY_MS = Number(process.env.BRREG_DELAY_MS ?? "30");
const GEOCODE_DELAY_MS = Number(process.env.GEOCODE_DELAY_MS ?? "80");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseDato(ddmmyyyy: string): number {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return 0;
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  return Number(`${yyyy}${mm}${dd}`);
}

function normalizeQuery(s: string): string {
  return s
    .replace(/['’`]/g, "")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidOrgnr(orgnr?: string): orgnr is string {
  if (!orgnr) return false;
  const t = orgnr.trim();
  return /^\d{9}$/.test(t);
}

function buildMatAdresseFallback(r: TilsynRow): string {
  return [r.adrlinje1, r.adrlinje2, r.postnr, r.poststed].filter(Boolean).join(", ").trim();
}

function pickBrregAdresse(entity: BrregEntity): BrregAdresse | null {
  // For serveringssteder er beliggenhetsadresse ofte mest “der stedet faktisk er”.
  return entity.beliggenhetsadresse ?? entity.forretningsadresse ?? null;
}

function formatBrregAdresse(addr: BrregAdresse): string | null {
  const lines = (addr.adresse ?? []).filter(Boolean);
  const pn = addr.postnummer?.trim();
  const ps = addr.poststed?.trim();

  const main = [...lines].join(", ").trim();
  const tail = [pn, ps].filter(Boolean).join(" ").trim();

  const full = [main, tail].filter(Boolean).join(", ").trim();
  return full.length ? full : null;
}

async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text();
    console.log("HTTP error", res.status, "for", url, "body:", txt.slice(0, 200));
    return null;
  }
  return (await res.json()) as T;
}

async function fetchBrregEntity(orgnr: string): Promise<BrregEntity | null> {
  // 1) underenhet
  const u = await fetchJsonOrNull<BrregEntity>(BRREG_UNDERENHET(orgnr));
  if (u?.organisasjonsnummer) return u;

  // 2) hovedenhet
  const e = await fetchJsonOrNull<BrregEntity>(BRREG_ENHET(orgnr));
  if (e?.organisasjonsnummer) return e;

  return null;
}

function extractLngLatFromKartverket(payload: unknown): LngLat | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const adresser = obj["adresser"];
  if (!Array.isArray(adresser) || adresser.length === 0) return null;

  const first = adresser[0] as Record<string, unknown>;
  const rp = first["representasjonspunkt"] as Record<string, unknown> | undefined;

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

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const txt = await res.text();
    console.log("Kartverket error:", res.status, txt.slice(0, 200));
    return null;
  }
  const data = (await res.json()) as unknown;
  return extractLngLatFromKartverket(data);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // ---- 1) Last Mattilsynet CSV
  console.log("Downloading CSV:", CSV_URL);
  const csvText = await (await fetch(CSV_URL)).text();
  console.log("First 120 chars:", csvText.slice(0, 120));

  const parsed = Papa.parse<TilsynRow>(csvText, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  const rows = parsed.data.filter((r: TilsynRow) => r?.tilsynsobjektid && r?.dato && r?.navn);
  console.log("Parsed rows:", rows.length);
  console.log("Example row:", rows[0]);

  // ---- 2) Siste tilsyn per tilsynsobjektid
  const latest = new Map<string, TilsynRow>();
  for (const r of rows) {
    const key = r.tilsynsobjektid;
    const cur = latest.get(key);
    if (!cur || parseDato(r.dato) > parseDato(cur.dato)) latest.set(key, r);
  }
  const latestRows = [...latest.values()];
  console.log("Unique places (latest per place):", latestRows.length);

  const limited = latestRows.slice(0, MAX_FEATURES);
  console.log(`Processing first ${limited.length} places (MAX_FEATURES=${MAX_FEATURES})`);

  // ---- 3) Last cache
  let brregCache: Record<string, BrregEntity | null> = {};
  if (fs.existsSync(BRREG_CACHE_PATH)) {
    brregCache = JSON.parse(fs.readFileSync(BRREG_CACHE_PATH, "utf8")) as Record<string, BrregEntity | null>;
  }

  let geocodeCache: Record<string, LngLat> = {};
  if (fs.existsSync(GEOCODE_CACHE_PATH)) {
    geocodeCache = JSON.parse(fs.readFileSync(GEOCODE_CACHE_PATH, "utf8")) as Record<string, LngLat>;
  }

  // ---- 4) Bygg GeoJSON features
  const features: GeoJSON.Feature<GeoJSON.Point, TilsynProperties>[] = [];

  let brregLookups = 0;
  let brregHits = 0;
  let geocodeAttempts = 0;
  let geocodeHits = 0;

  for (const r of limited) {
    const orgnr = isValidOrgnr(r.orgnummer) ? r.orgnummer.trim() : null;

    // 4a) Finn beste adresse (BRREG først)
    let bestAdresse: string | null = null;
    let adresseKilde: "BRREG" | "MAT" = "MAT";

    if (orgnr) {
      if (!(orgnr in brregCache)) {
        brregLookups++;
        brregCache[orgnr] = await fetchBrregEntity(orgnr);
        await sleep(BRREG_DELAY_MS);
      }
      const entity = brregCache[orgnr];
      const addr = entity ? pickBrregAdresse(entity) : null;
      const formatted = addr ? formatBrregAdresse(addr) : null;
      if (formatted) {
        bestAdresse = formatted;
        adresseKilde = "BRREG";
        brregHits++;
      }
    }

    // fallback: Mattilsynet adressefelter
    if (!bestAdresse) {
      const matAddr = buildMatAdresseFallback(r);
      if (matAddr) bestAdresse = matAddr;
    }

    if (!bestAdresse) continue;

    // 4b) Geokoding (cache på adressetekst)
    const geocodeKey = bestAdresse;
    let geo: LngLat | null = geocodeCache[geocodeKey] ?? null;

    if (!geo) {
      geocodeAttempts++;

      // Kartverket fritekstsøk – vi normaliserer litt
      const query = normalizeQuery(bestAdresse);
      geo = await geocodeKartverket(query);

      if (geo) {
        geocodeCache[geocodeKey] = geo;
        geocodeHits++;
      }

      await sleep(GEOCODE_DELAY_MS);
    }

    if (!geo) continue;

    const karakter = Number(r.total_karakter);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [geo.lon, geo.lat] },
      properties: {
        tilsynsobjektid: r.tilsynsobjektid,
        orgnummer: orgnr,
        navn: r.navn,
        adresse: bestAdresse,
        dato: r.dato,
        karakter: Number.isFinite(karakter) ? karakter : -1,
        status: r.status ?? null,
        adressekilde: adresseKilde,
      },
    });
  }

  // ---- 5) Skriv cache + GeoJSON
  fs.writeFileSync(BRREG_CACHE_PATH, JSON.stringify(brregCache, null, 2), "utf8");
  fs.writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(geocodeCache, null, 2), "utf8");

  const fc: GeoJSON.FeatureCollection<GeoJSON.Point, TilsynProperties> = {
    type: "FeatureCollection",
    features,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(fc), "utf8");

  console.log(`BRREG lookups: ${brregLookups}, BRREG addr hits: ${brregHits}`);
  console.log(`Geocode attempts: ${geocodeAttempts}, geocode hits: ${geocodeHits}`);
  console.log(`✅ Skrev ${features.length} punkter til ${OUT_PATH}`);
  console.log(`ℹ️ BRREG cache: ${BRREG_CACHE_PATH}`);
  console.log(`ℹ️ Geocode cache: ${GEOCODE_CACHE_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
