/**
 * generate-test-data.ts
 *
 * Generates test data by modifying existing tilsyn.geojson to simulate changes
 * between data downloads. Does NOT run geocoding — reuses existing coordinates.
 *
 * Usage:  npx tsx scripts/generate-test-data.ts
 *
 * What it does:
 *  1. Reads existing public/tilsyn.geojson as the "previous" dataset.
 *  2. Applies simulated changes:
 *     - 10 features get updated dates and worse karakter scores (changed)
 *     - 5 features are removed (removed)
 *     - 3 synthetic new inspections are added (new) using copied coordinates
 *  3. Writes the modified geojson back and regenerates tilsyn-diff.json
 *     and tilsyn-meta.json so the analytics dashboard / notification page
 *     can be tested end-to-end.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PUBLIC_DIR = path.join(process.cwd(), "public");
const DATA_DIR = path.join(process.cwd(), "data");
const OUT_PATH = path.join(PUBLIC_DIR, "tilsyn.geojson");
const DIFF_PATH = path.join(PUBLIC_DIR, "tilsyn-diff.json");
const META_PATH = path.join(PUBLIC_DIR, "tilsyn-meta.json");
const SNAPSHOT_DIR = path.join(DATA_DIR, "snapshots");

// ---------------------------------------------------------------------------
// Types (mirrors build-tilsyn-geojson.ts)
// ---------------------------------------------------------------------------

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

type TilsynFeature = GeoJSON.Feature<GeoJSON.Point, TilsynProperties>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today as ddmmyyyy */
function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // ---- 1) Load existing geojson ----
  if (!fs.existsSync(OUT_PATH)) {
    console.error("❌  public/tilsyn.geojson not found. Run 'npm run build:data' first.");
    process.exit(1);
  }

  const prevGeoJSON = JSON.parse(
    fs.readFileSync(OUT_PATH, "utf8"),
  ) as GeoJSON.FeatureCollection<GeoJSON.Point, TilsynProperties>;

  const previousFeatures = prevGeoJSON.features;
  console.log(`📂  Loaded ${previousFeatures.length} existing features`);

  // Build lookup for previous features
  const previousMap = new Map<string, TilsynFeature>();
  for (const f of previousFeatures) {
    previousMap.set(f.properties.tilsynsobjektid, f);
  }

  // ---- 2) Apply simulated changes ----
  const today = todayDDMMYYYY();

  // Pick features to modify (change date + worsen karakter)
  const changeCandidates = previousFeatures.filter(
    (f) => f.properties.karakter <= 1,
  );

  // 10 changed inspections — update date, worsen scores
  const changedFeatures: TilsynFeature[] = [];
  const changeCount = Math.min(10, changeCandidates.length);
  for (let i = 0; i < changeCount; i++) {
    const orig = changeCandidates[i];
    const newScore = i < 3 ? 3 : i < 6 ? 2 : 1; // 3 × score 3, 3 × score 2, 4 × score 1
    const modified: TilsynFeature = {
      ...orig,
      properties: {
        ...orig.properties,
        dato: today,
        karakter: newScore,
        karakter1: newScore,
        karakter2: Math.max(0, newScore - 1),
        karakter3: 0,
        karakter4: 0,
      },
    };
    changedFeatures.push(modified);
  }

  // 5 removed features — pick from end of list
  const removedIds: string[] = [];
  const removeCount = Math.min(5, previousFeatures.length);
  for (let i = 0; i < removeCount; i++) {
    const idx = previousFeatures.length - 1 - i;
    removedIds.push(previousFeatures[idx].properties.tilsynsobjektid);
  }

  // 3 new synthetic inspections — copy coordinates from existing features
  const newInspections: TilsynFeature[] = [];
  const donorCount = Math.min(3, previousFeatures.length);
  const donorStart = Math.min(50, previousFeatures.length - donorCount);
  const donorFeatures = previousFeatures.slice(donorStart, donorStart + donorCount);
  for (let i = 0; i < donorFeatures.length; i++) {
    const donor = donorFeatures[i];
    const newId = `TEST_NEW_${i + 1}_${Date.now()}`;
    const newFeature: TilsynFeature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          donor.geometry.coordinates[0] + 0.001 * (i + 1), // slightly offset
          donor.geometry.coordinates[1] + 0.001 * (i + 1),
        ],
      },
      properties: {
        tilsynsobjektid: newId,
        orgnummer: null,
        navn: `Testrestaurant ${i + 1}`,
        adresse: `Testveien ${i + 1}, 0001, Oslo`,
        dato: today,
        karakter: i === 0 ? 3 : i === 1 ? 2 : 0,
        karakter1: i === 0 ? 3 : i === 1 ? 2 : 0,
        karakter2: i === 0 ? 2 : 0,
        karakter3: 0,
        karakter4: 0,
        status: "0",
      },
    };
    newInspections.push(newFeature);
  }

  // ---- 3) Build new feature set ----
  const removedSet = new Set(removedIds);
  const changedMap = new Map<string, TilsynFeature>();
  for (const f of changedFeatures) {
    changedMap.set(f.properties.tilsynsobjektid, f);
  }

  const newFeatures: TilsynFeature[] = [];
  for (const f of previousFeatures) {
    if (removedSet.has(f.properties.tilsynsobjektid)) continue; // removed
    if (changedMap.has(f.properties.tilsynsobjektid)) {
      newFeatures.push(changedMap.get(f.properties.tilsynsobjektid)!); // changed
    } else {
      newFeatures.push(f); // unchanged
    }
  }
  // Add new synthetic inspections
  for (const f of newInspections) {
    newFeatures.push(f);
  }

  // ---- 4) Generate diff ----
  const previousDownloadTime = (() => {
    if (fs.existsSync(META_PATH)) {
      try {
        const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
        return meta.lastDownload ?? null;
      } catch { return null; }
    }
    return null;
  })();

  const now = new Date().toISOString();

  const diffData = {
    generatedAt: now,
    previousDownload: previousDownloadTime,
    summary: {
      previousTotal: previousFeatures.length,
      currentTotal: newFeatures.length,
      newCount: newInspections.length,
      changedCount: changedFeatures.length,
      removedCount: removedIds.length,
    },
    newInspections: newInspections.map((f) => f.properties),
    changedInspections: changedFeatures.map((f) => f.properties),
    removedIds,
  };

  // ---- 5) Generate meta ----
  let downloadHistory: unknown[] = [];
  if (fs.existsSync(META_PATH)) {
    try {
      const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
      downloadHistory = meta.downloadHistory ?? [];
    } catch { /* ignore */ }
  }

  downloadHistory.push({
    downloadedAt: now,
    totalFeatures: newFeatures.length,
    newCount: newInspections.length,
    changedCount: changedFeatures.length,
    removedCount: removedIds.length,
  });

  const metaData = {
    lastDownload: now,
    totalFeatures: newFeatures.length,
    downloadHistory,
  };

  // ---- 6) Save snapshot ----
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const snapshotFile = path.join(
    SNAPSHOT_DIR,
    `snapshot-${now.replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    snapshotFile,
    JSON.stringify({
      downloadedAt: now,
      totalFeatures: newFeatures.length,
      newCount: newInspections.length,
      changedCount: changedFeatures.length,
      removedCount: removedIds.length,
    }, null, 2),
    "utf8",
  );

  // ---- 7) Write output files ----
  const newGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Point, TilsynProperties> = {
    type: "FeatureCollection",
    features: newFeatures,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(newGeoJSON), "utf8");
  fs.writeFileSync(DIFF_PATH, JSON.stringify(diffData, null, 2), "utf8");
  fs.writeFileSync(META_PATH, JSON.stringify(metaData, null, 2), "utf8");

  // ---- 8) Summary ----
  console.log("\n✅  Test data generated successfully!");
  console.log(`    📊  Total features: ${newFeatures.length}`);
  console.log(`    🆕  New inspections: ${newInspections.length}`);
  console.log(`    ✏️   Changed inspections: ${changedFeatures.length}`);
  console.log(`    🗑️   Removed features: ${removedIds.length}`);
  console.log(`\n    Changes applied:`);

  for (const f of changedFeatures) {
    const prev = previousMap.get(f.properties.tilsynsobjektid);
    console.log(
      `      ✏️  ${f.properties.navn}: karakter ${prev?.properties.karakter ?? "?"} → ${f.properties.karakter}, dato → ${f.properties.dato}`,
    );
  }

  for (const f of newInspections) {
    console.log(
      `      🆕  ${f.properties.navn}: karakter ${f.properties.karakter}, dato ${f.properties.dato}`,
    );
  }

  console.log(`      🗑️  Removed ${removedIds.length} features from end of list`);
  console.log(`\n    Files written:`);
  console.log(`      ${OUT_PATH}`);
  console.log(`      ${DIFF_PATH}`);
  console.log(`      ${META_PATH}`);
  console.log(`      ${snapshotFile}`);
}

main();
