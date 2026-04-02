"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TilsynProperties = {
  tilsynsobjektid: string;
  orgnummer: string | null;
  navn: string;
  adresse: string;
  dato: string; // ddmmyyyy
  karakter: number;
  karakter1: number;
  karakter2: number;
  karakter3: number;
  karakter4: number;
  status: string | null;
};

type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: TilsynProperties;
};

type DiffEntry = {
  generatedAt: string;
  previousDownload: string | null;
  summary: {
    previousTotal: number;
    currentTotal: number;
    newCount: number;
    changedCount: number;
    removedCount: number;
  };
  newInspections: TilsynProperties[];
  changedInspections: TilsynProperties[];
  removedIds: string[];
};

type MetaData = {
  lastDownload: string;
  totalFeatures: number;
  downloadHistory: Array<{
    downloadedAt: string;
    totalFeatures: number;
    newCount: number;
    changedCount: number;
    removedCount: number;
  }>;
};

type Prediction = {
  feature: Feature;
  probability: number;
  features: FeatureVector;
};

type FeatureVector = {
  daysSinceInspection: number;
  overallScore: number;
  maxCategoryScore: number;
  hasViolations: number;
  isSpecialInspection: number;
  recentAreaActivity: number;
  latitude: number;
  longitude: number;
};

// ---------------------------------------------------------------------------
// Constants (matching analyse page design)
// ---------------------------------------------------------------------------

const COLORS = {
  smil: "#10b981",
  strek: "#f59e0b",
  sur: "#ef4444",
  primary: "#6366f1",
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  accent: "#8b5cf6",
  predict: "#f97316",
  predictLight: "#fff7ed",
};

const FEATURE_NAMES: Record<keyof FeatureVector, string> = {
  daysSinceInspection: "Dager siden siste tilsyn",
  overallScore: "Samlet karakter",
  maxCategoryScore: "Høyeste kategorikarakter",
  hasViolations: "Har brudd",
  isSpecialInspection: "Var spesialtilsyn",
  recentAreaActivity: "Nylig aktivitet i området",
  latitude: "Breddegrad",
  longitude: "Lengdegrad",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDatoToDate(ddmmyyyy: string): Date | null {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return null;
  const year = parseInt(d.slice(4, 8));
  const month = parseInt(d.slice(2, 4)) - 1;
  const day = parseInt(d.slice(0, 2));
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

function formatDato(ddmmyyyy: string): string {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return ddmmyyyy;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 8)}`;
}

function daysBetween(a: Date, b: Date): number {
  const diff = Math.abs(a.getTime() - b.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function computeSmileScore(p: TilsynProperties): number {
  const candidates: number[] = [];
  const raws = [p.karakter1, p.karakter2, p.karakter3, p.karakter4];
  for (const r of raws) {
    const n = typeof r === "number" && Number.isFinite(r) ? r : null;
    if (n !== null && n >= 0 && n <= 3) candidates.push(n);
  }
  if (candidates.length > 0) return Math.max(...candidates);
  const k = p.karakter;
  if (typeof k === "number" && Number.isFinite(k) && k >= 0 && k <= 3) return k;
  return -1;
}

function smileEmoji(score: number): string {
  if (score === 0 || score === 1) return "😊";
  if (score === 2) return "😐";
  if (score === 3) return "☹️";
  return "❓";
}

function smileColor(score: number): string {
  if (score === 0 || score === 1) return COLORS.smil;
  if (score === 2) return COLORS.strek;
  if (score === 3) return COLORS.sur;
  return COLORS.textMuted;
}

/** Haversine distance between two points in km */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Feature Engineering
// ---------------------------------------------------------------------------

function extractFeatures(
  feature: Feature,
  referenceDate: Date,
  recentInspectionCoords: Array<[number, number]>
): FeatureVector {
  const p = feature.properties;
  const coords = feature.geometry.coordinates;
  const lat = coords[1];
  const lng = coords[0];

  // Days since last inspection
  const inspDate = parseDatoToDate(p.dato);
  const daysSinceInspection = inspDate ? daysBetween(referenceDate, inspDate) : 365;

  // Score features
  const overallScore = p.karakter >= 0 ? p.karakter : 0;
  const cats = [p.karakter1, p.karakter2, p.karakter3, p.karakter4].filter(
    (v) => typeof v === "number" && v >= 0
  );
  const maxCategoryScore = cats.length > 0 ? Math.max(...cats) : 0;
  const hasViolations = cats.some((v) => v > 0) ? 1 : 0;

  // Status
  const isSpecialInspection = p.status === "1" ? 1 : 0;

  // Recent area activity: count of recent inspections within 15km radius
  let recentAreaActivity = 0;
  for (const [rLng, rLat] of recentInspectionCoords) {
    if (haversineKm(lat, lng, rLat, rLng) < 15) {
      recentAreaActivity++;
    }
  }

  return {
    daysSinceInspection,
    overallScore,
    maxCategoryScore,
    hasViolations,
    isSpecialInspection,
    recentAreaActivity,
    latitude: lat,
    longitude: lng,
  };
}

// ---------------------------------------------------------------------------
// ML: Logistic Regression
// ---------------------------------------------------------------------------

type ModelWeights = {
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStds: number[];
};

function sigmoid(x: number): number {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

function featureVectorToArray(fv: FeatureVector): number[] {
  return [
    fv.daysSinceInspection,
    fv.overallScore,
    fv.maxCategoryScore,
    fv.hasViolations,
    fv.isSpecialInspection,
    fv.recentAreaActivity,
    fv.latitude,
    fv.longitude,
  ];
}

function normalizeFeatures(
  features: number[][],
  means?: number[],
  stds?: number[]
): { normalized: number[][]; means: number[]; stds: number[] } {
  const nFeatures = features[0].length;
  const computedMeans = means ? [...means] : new Array(nFeatures).fill(0);
  const computedStds = stds ? [...stds] : new Array(nFeatures).fill(1);

  if (!means) {
    for (let j = 0; j < nFeatures; j++) {
      let sum = 0;
      for (let i = 0; i < features.length; i++) sum += features[i][j];
      computedMeans[j] = sum / features.length;
    }
    for (let j = 0; j < nFeatures; j++) {
      let sumSq = 0;
      for (let i = 0; i < features.length; i++) {
        sumSq += (features[i][j] - computedMeans[j]) ** 2;
      }
      computedStds[j] = Math.sqrt(sumSq / features.length) || 1;
    }
  }

  const normalized = features.map((row) =>
    row.map((val, j) => (val - computedMeans[j]) / computedStds[j])
  );

  return { normalized, means: computedMeans, stds: computedStds };
}

function trainLogisticRegression(
  X: number[][],
  y: number[],
  learningRate: number = 0.1,
  epochs: number = 200,
  lambda: number = 0.01
): ModelWeights {
  const n = X.length;
  const nFeatures = X[0].length;

  // Normalize
  const { normalized, means, stds } = normalizeFeatures(X);

  // Initialize weights
  const weights = new Array(nFeatures).fill(0);
  let bias = 0;

  // Gradient descent with L2 regularization
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(nFeatures).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < nFeatures; j++) z += weights[j] * normalized[i][j];
      const pred = sigmoid(z);
      const error = pred - y[i];

      for (let j = 0; j < nFeatures; j++) {
        gradW[j] += error * normalized[i][j];
      }
      gradB += error;
    }

    for (let j = 0; j < nFeatures; j++) {
      weights[j] -= learningRate * (gradW[j] / n + lambda * weights[j]);
    }
    bias -= learningRate * (gradB / n);
  }

  return { weights, bias, featureMeans: means, featureStds: stds };
}

function predictProbability(model: ModelWeights, features: number[]): number {
  const normalized = features.map(
    (val, j) => (val - model.featureMeans[j]) / model.featureStds[j]
  );
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j++) {
    z += model.weights[j] * normalized[j];
  }
  return sigmoid(z);
}

// ---------------------------------------------------------------------------
// Training Data Generation from Diffs
// ---------------------------------------------------------------------------

function buildTrainingData(
  features: Feature[],
  diffs: DiffEntry[]
): { X: number[][]; y: number[] } {
  // Collect IDs of all establishments that were inspected (appeared in diffs)
  const inspectedIds = new Set<string>();
  for (const diff of diffs) {
    for (const insp of diff.newInspections) {
      inspectedIds.add(insp.tilsynsobjektid);
    }
    for (const insp of diff.changedInspections) {
      inspectedIds.add(insp.tilsynsobjektid);
    }
  }

  // Get coordinates of recently inspected places (for area activity feature)
  const recentCoords: Array<[number, number]> = [];
  const idToFeature = new Map<string, Feature>();
  for (const f of features) {
    idToFeature.set(f.properties.tilsynsobjektid, f);
  }
  for (const id of inspectedIds) {
    const f = idToFeature.get(id);
    if (f) recentCoords.push(f.geometry.coordinates);
  }

  // Use the earliest diff date as reference point for training
  const sortedDiffs = [...diffs].sort(
    (a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()
  );
  const referenceDate =
    sortedDiffs.length > 0
      ? new Date(sortedDiffs[0].generatedAt)
      : new Date();

  const X: number[][] = [];
  const y: number[] = [];

  for (const f of features) {
    const isPositive = inspectedIds.has(f.properties.tilsynsobjektid) ? 1 : 0;
    const fv = extractFeatures(f, referenceDate, recentCoords);
    X.push(featureVectorToArray(fv));
    y.push(isPositive);
  }

  return { X, y };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PredictionPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [features, setFeatures] = useState<Feature[]>([]);
  const [diffs, setDiffs] = useState<DiffEntry[]>([]);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [model, setModel] = useState<ModelWeights | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [showCount, setShowCount] = useState(50);

  // --- Load data ---
  useEffect(() => {
    async function loadData() {
      try {
        const [geoRes, diffRes, metaRes] = await Promise.all([
          fetch("/tilsyn.geojson"),
          fetch("/tilsyn-diff.json"),
          fetch("/tilsyn-meta.json"),
        ]);
        const geo = await geoRes.json();
        const rawDiff = await diffRes.json();
        const metaData = await metaRes.json();

        const loadedFeatures: Feature[] = (geo.features ?? []).filter(
          (f: Feature) =>
            f.geometry?.type === "Point" &&
            Array.isArray(f.geometry.coordinates) &&
            f.geometry.coordinates.length >= 2
        );
        const loadedDiffs: DiffEntry[] = Array.isArray(rawDiff)
          ? rawDiff
          : [rawDiff];

        setFeatures(loadedFeatures);
        setDiffs(loadedDiffs);
        setMeta(metaData);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // --- Train model when data is loaded ---
  // Derive training state: data loaded but model not yet computed
  const training = features.length > 0 && diffs.length > 0 && model === null && !loading;

  useEffect(() => {
    if (features.length === 0 || diffs.length === 0 || model !== null) return;

    // Use requestAnimationFrame to avoid blocking UI
    const frameId = requestAnimationFrame(() => {
      const { X, y } = buildTrainingData(features, diffs);
      const trainedModel = trainLogisticRegression(X, y, 0.15, 300, 0.01);

      // Predict for all features using today as reference
      const now = new Date();
      const recentCoords: Array<[number, number]> = [];
      const idToFeature = new Map<string, Feature>();
      for (const f of features) {
        idToFeature.set(f.properties.tilsynsobjektid, f);
      }
      for (const diff of diffs) {
        for (const insp of [...diff.newInspections, ...diff.changedInspections]) {
          const f = idToFeature.get(insp.tilsynsobjektid);
          if (f) recentCoords.push(f.geometry.coordinates);
        }
      }

      const preds: Prediction[] = features.map((f) => {
        const fv = extractFeatures(f, now, recentCoords);
        const probability = predictProbability(trainedModel, featureVectorToArray(fv));
        return { feature: f, probability, features: fv };
      });

      preds.sort((a, b) => b.probability - a.probability);
      setModel(trainedModel);
      setPredictions(preds);
    });

    return () => cancelAnimationFrame(frameId);
  }, [features, diffs, model]);

  // --- Map ---
  useEffect(() => {
    if (!mapContainer.current || predictions.length === 0) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [10.75, 63.43],
      zoom: 4.5,
      maxZoom: 18,
    });

    mapRef.current = map;

    map.on("load", () => {
      const topN = Math.min(200, predictions.length);
      const topPredictions = predictions.slice(0, topN);

      const geojsonData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: topPredictions.map((pred, i) => ({
          type: "Feature" as const,
          geometry: pred.feature.geometry,
          properties: {
            rank: i + 1,
            probability: Math.round(pred.probability * 1000) / 10,
            navn: pred.feature.properties.navn,
            adresse: pred.feature.properties.adresse,
            dato: pred.feature.properties.dato,
            karakter: pred.feature.properties.karakter,
            daysSince: pred.features.daysSinceInspection,
          },
        })),
      };

      map.addSource("predictions", {
        type: "geojson",
        data: geojsonData,
      });

      // Heatmap layer
      map.addLayer({
        id: "prediction-heat",
        type: "heatmap",
        source: "predictions",
        maxzoom: 12,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "probability"],
            0, 0,
            100, 1,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 1,
            12, 3,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(249,115,22,0)",
            0.2, "rgba(251,146,60,0.4)",
            0.4, "rgba(249,115,22,0.6)",
            0.6, "rgba(234,88,12,0.75)",
            0.8, "rgba(194,65,12,0.85)",
            1, "rgba(154,52,18,0.95)",
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 4,
            12, 30,
          ],
          "heatmap-opacity": 0.8,
        },
      });

      // Circle layer for individual predictions
      map.addLayer({
        id: "prediction-circles",
        type: "circle",
        source: "predictions",
        minzoom: 8,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "probability"],
            0, 4,
            100, 12,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "probability"],
            0, "#fed7aa",
            50, "#f97316",
            80, "#c2410c",
            100, "#7c2d12",
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "white",
          "circle-opacity": 0.85,
        },
      });

      // Popup on click
      map.on("click", "prediction-circles", (e) => {
        const feat = e.features?.[0];
        if (!feat || !feat.properties) return;
        const props = feat.properties;
        const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

        new maplibregl.Popup({ offset: 15, maxWidth: "320px" })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family:system-ui,sans-serif;font-size:13px">
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">#${props.rank} ${props.navn}</div>
              <div style="color:#64748b;margin-bottom:6px">${props.adresse}</div>
              <div style="display:flex;gap:12px;margin-bottom:4px">
                <span>Sannsynlighet: <strong style="color:${COLORS.predict}">${props.probability}%</strong></span>
              </div>
              <div style="display:flex;gap:12px">
                <span>Siste tilsyn: ${formatDato(String(props.dato))}</span>
                <span>Karakter: ${props.karakter}</span>
              </div>
              <div style="color:#94a3b8;font-size:11px;margin-top:4px">
                ${props.daysSince} dager siden siste tilsyn
              </div>
            </div>`
          )
          .addTo(map);
      });

      map.on("mouseenter", "prediction-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "prediction-circles", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [predictions]);

  // --- Fly to selected prediction ---
  const flyTo = useCallback(
    (pred: Prediction) => {
      setSelectedPrediction(pred);
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: pred.feature.geometry.coordinates,
        zoom: 14,
        duration: 1500,
      });
    },
    []
  );

  // --- Model metrics ---
  const metrics = useMemo(() => {
    if (!model || predictions.length === 0) return null;

    const featureKeys = Object.keys(FEATURE_NAMES) as (keyof FeatureVector)[];
    const importance = featureKeys.map((key, i) => ({
      name: FEATURE_NAMES[key],
      key,
      weight: model.weights[i],
      absWeight: Math.abs(model.weights[i]),
    }));
    importance.sort((a, b) => b.absWeight - a.absWeight);
    const maxAbsWeight = importance[0]?.absWeight || 1;

    const top50 = predictions.slice(0, 50);
    const avgDays =
      top50.reduce((s, p) => s + p.features.daysSinceInspection, 0) / top50.length;

    const totalInspected = new Set<string>();
    for (const diff of diffs) {
      for (const insp of diff.newInspections) totalInspected.add(insp.tilsynsobjektid);
      for (const insp of diff.changedInspections)
        totalInspected.add(insp.tilsynsobjektid);
    }

    return { importance, maxAbsWeight, avgDays, totalInspected: totalInspected.size };
  }, [model, predictions, diffs]);

  // --- Render ---
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "system-ui, sans-serif", background: COLORS.bg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔮</div>
          <div style={{ fontSize: 16, color: COLORS.textMuted }}>Laster tilsynsdata...</div>
        </div>
      </div>
    );
  }

  if (training) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "system-ui, sans-serif", background: COLORS.bg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <div style={{ fontSize: 16, color: COLORS.textMuted }}>Trener maskinlæringsmodell...</div>
          <div style={{ fontSize: 13, color: COLORS.textFaint, marginTop: 8 }}>
            Analyserer {features.length.toLocaleString("nb-NO")} tilsynsobjekter med {diffs.length} dager med endringsdata
          </div>
        </div>
      </div>
    );
  }

  const topPredictions = predictions.slice(0, showCount);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: `1px solid ${COLORS.border}`, padding: "16px 24px", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(12px)", backgroundColor: "rgba(255,255,255,0.85)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/" style={{ color: COLORS.primary, textDecoration: "none", fontSize: 13, fontWeight: 500, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 14px", transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: 6 }}>
              ← Kart
            </Link>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
                🔮 Prediksjon
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textFaint }}>
                Smilefjeskartet · Maskinlæring
              </p>
            </div>
          </div>
          {meta && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.textMuted }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.predict, display: "inline-block" }} />
              Trent på {diffs.length} dager med endringsdata
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px" }}>
        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          <SummaryCard emoji="📊" label="Tilsynsobjekter" value={features.length.toLocaleString("nb-NO")} />
          <SummaryCard emoji="📅" label="Diff-oppføringer" value={String(diffs.length)} />
          <SummaryCard emoji="🎯" label="Observerte tilsyn" value={String(metrics?.totalInspected ?? 0)} />
          <SummaryCard emoji="⏱️" label="Snitt dager (topp 50)" value={metrics ? Math.round(metrics.avgDays).toLocaleString("nb-NO") : "–"} />
        </div>

        {/* Map */}
        <div style={{ background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Prediksjoner – Neste tilsyn</h2>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textFaint, marginTop: 2 }}>Varmekart viser områder med høy sannsynlighet for tilsyn</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: COLORS.textMuted }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#fed7aa" }} /> Lav
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COLORS.predict }} /> Middels
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#7c2d12" }} /> Høy
            </div>
          </div>
          <div ref={mapContainer} style={{ height: 500, width: "100%" }} />
        </div>

        {/* Feature Importance + Model Info */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginBottom: 24 }}>
          {/* Feature Importance */}
          {metrics && (
            <div style={{ background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`, padding: 20 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Funksjonsviktighet</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {metrics.importance.map((feat) => (
                  <div key={feat.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: COLORS.text }}>{feat.name}</span>
                      <span style={{ color: feat.weight > 0 ? COLORS.predict : COLORS.primary, fontWeight: 600, fontFamily: "monospace" }}>
                        {feat.weight > 0 ? "+" : ""}{feat.weight.toFixed(3)}
                      </span>
                    </div>
                    <div style={{ background: "#f1f5f9", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${(feat.absWeight / metrics.maxAbsWeight) * 100}%`,
                        background: feat.weight > 0
                          ? `linear-gradient(90deg, ${COLORS.predict}, #ea580c)`
                          : `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.accent})`,
                        borderRadius: 4,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ margin: "14px 0 0", fontSize: 11, color: COLORS.textFaint, lineHeight: 1.5 }}>
                Positive vekter (oransje) øker sannsynligheten for tilsyn. Negative vekter (blå) reduserer den. Logistisk regresjon med L2-regularisering.
              </p>
            </div>
          )}

          {/* Model Info */}
          <div style={{ background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`, padding: 20 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Om modellen</h2>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: COLORS.textMuted }}>
              <p style={{ margin: "0 0 12px" }}>
                Denne modellen bruker <strong>logistisk regresjon</strong> trent i nettleseren for å forutsi hvor Mattilsynet sannsynligvis vil gjennomføre neste hygienekontroll.
              </p>
              <div style={{ background: COLORS.bg, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: COLORS.text, marginBottom: 8 }}>Treningsdata</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
                  <li><strong>{features.length.toLocaleString("nb-NO")}</strong> tilsynsobjekter med koordinater</li>
                  <li><strong>{diffs.length}</strong> dager med endringsdata (tilsyn-diff)</li>
                  <li><strong>{metrics?.totalInspected ?? 0}</strong> observerte tilsyn brukt som positive eksempler</li>
                </ul>
              </div>
              <div style={{ background: COLORS.bg, borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: COLORS.text, marginBottom: 8 }}>Funksjoner (features)</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
                  <li>Dager siden siste tilsyn</li>
                  <li>Samlet karakter og kategorikarakterer</li>
                  <li>Om stedet hadde brudd</li>
                  <li>Om forrige besøk var spesialtilsyn</li>
                  <li>Nylig tilsynsaktivitet i nærområdet (15 km)</li>
                  <li>Geografisk posisjon (bredde-/lengdegrad)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Diff Timeline */}
        <div style={{ background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Endringshistorikk (tilsyn-diff)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {diffs.map((diff, i) => {
              const date = new Date(diff.generatedAt);
              const total = diff.summary.newCount + diff.summary.changedCount + diff.summary.removedCount;
              return (
                <div key={i} style={{ background: total > 0 ? COLORS.predictLight : COLORS.bg, borderRadius: 10, padding: "10px 14px", border: `1px solid ${total > 0 ? "#fed7aa" : COLORS.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>
                    {date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                    {total === 0 ? (
                      <span style={{ color: COLORS.textFaint }}>Ingen endringer</span>
                    ) : (
                      <>
                        {diff.summary.newCount > 0 && <span style={{ color: COLORS.smil }}>+{diff.summary.newCount} nye </span>}
                        {diff.summary.changedCount > 0 && <span style={{ color: COLORS.predict }}>{diff.summary.changedCount} endret </span>}
                        {diff.summary.removedCount > 0 && <span style={{ color: COLORS.sur }}>-{diff.summary.removedCount} fjernet</span>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Predictions Table */}
        <div style={{ background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Topp prediksjoner</h2>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>
              Viser {topPredictions.length} av {predictions.length.toLocaleString("nb-NO")}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Sted</th>
                  <th style={thStyle}>Sannsynlighet</th>
                  <th style={thStyle}>Siste karakter</th>
                  <th style={thStyle}>Dager siden</th>
                  <th style={thStyle}>Aktivitet</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {topPredictions.map((pred, i) => {
                  const p = pred.feature.properties;
                  const score = computeSmileScore(p);
                  const pct = Math.round(pred.probability * 1000) / 10;
                  const isSelected = selectedPrediction?.feature.properties.tilsynsobjektid === p.tilsynsobjektid;

                  return (
                    <tr
                      key={p.tilsynsobjektid}
                      style={{ borderBottom: `1px solid ${COLORS.border}`, background: isSelected ? COLORS.predictLight : "transparent", cursor: "pointer", transition: "background 0.1s" }}
                      onClick={() => flyTo(pred)}
                    >
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: COLORS.textMuted }}>{i + 1}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{p.navn}</div>
                        <div style={{ fontSize: 11, color: COLORS.textFaint }}>{p.adresse}</div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ display: "inline-block", background: probabilityBg(pct), color: "#fff", borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                          {pct}%
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ color: smileColor(score) }}>{smileEmoji(score)} {p.karakter}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace" }}>
                        {pred.features.daysSinceInspection}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {pred.features.recentAreaActivity > 0 ? (
                          <span style={{ background: COLORS.predictLight, color: COLORS.predict, borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 600 }}>
                            {pred.features.recentAreaActivity}
                          </span>
                        ) : (
                          <span style={{ color: COLORS.textFaint }}>–</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); flyTo(pred); }}
                          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}
                          title="Vis på kart"
                        >
                          📍
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showCount < predictions.length && (
            <div style={{ padding: "12px 20px", textAlign: "center", borderTop: `1px solid ${COLORS.border}` }}>
              <button
                onClick={() => setShowCount((c) => Math.min(c + 50, predictions.length))}
                style={{ border: `1px solid ${COLORS.border}`, background: "white", borderRadius: 8, padding: "8px 24px", cursor: "pointer", fontSize: 13, color: COLORS.primary, fontWeight: 500 }}
              >
                Vis flere ({Math.min(50, predictions.length - showCount)} til)
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{ textAlign: "center", padding: "20px 0 40px", fontSize: 11, color: COLORS.textFaint, lineHeight: 1.8 }}>
          <p>
            Data fra{" "}
            <a href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.primary, textDecoration: "none" }}>Mattilsynet</a>
            {" "}– lisensiert under{" "}
            <a href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.primary, textDecoration: "none" }}>NLOD 2.0</a>
          </p>
          <p style={{ marginTop: 4 }}>
            <Link href="/" style={{ color: COLORS.primary, textDecoration: "none" }}>Kart</Link>
            {" · "}
            <Link href="/analyse" style={{ color: COLORS.primary, textDecoration: "none" }}>Analyse</Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components & styles
// ---------------------------------------------------------------------------

function SummaryCard({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div style={{ background: COLORS.card, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ fontSize: 28 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3, color: COLORS.text }}>{value}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>{label}</div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  textAlign: "center",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
};

function probabilityBg(pct: number): string {
  if (pct >= 80) return "#c2410c";
  if (pct >= 60) return "#ea580c";
  if (pct >= 40) return "#f97316";
  if (pct >= 20) return "#fb923c";
  return "#fdba74";
}
