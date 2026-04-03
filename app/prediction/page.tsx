"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDatoToDate(ddmmyyyy: string): Date | null {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return null;
  const year = parseInt(d.slice(4, 8));
  const month = parseInt(d.slice(2, 4)) - 1;
  const day = parseInt(d.slice(0, 2));
  return new Date(year, month, day);
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

// Haversine distance in km
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Seeded PRNG for reproducible train/test split */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Colors & constants (matching analyse page)
// ---------------------------------------------------------------------------

const COLORS = {
  smil: "#10b981",
  strek: "#f59e0b",
  sur: "#ef4444",
  primary: "#6366f1",
  primaryLight: "#e0e7ff",
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  accent: "#8b5cf6",
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const LEARNING_RATE = 0.5;
const TRAINING_EPOCHS = 300;
const L2_LAMBDA = 0.01; // Regularization strength
const TEST_SPLIT = 0.2;
const RANDOM_SEED = 42;
// Fixed positive weight for days-since-inspection at prediction time.
// NOT used during training (the feature leaks the label due to post-inspection dates).
// Higher value → stronger preference for establishments that haven't been inspected recently.
const DAYS_BOOST_WEIGHT = 1.0;

// Training features only — days-related features are excluded to prevent data leakage,
// and score/violation features are excluded because the model focuses on smiley-face
// restaurants (score ≤ 1) where those features carry no useful signal.
const TRAINING_FEATURE_NAMES = [
  "Historiske tilsyn",
  "Lokal aktivitet",
  "Breddegrad",
  "Lengdegrad",
];

// ---------------------------------------------------------------------------
// Logistic Regression with L2 regularization and class weighting
// ---------------------------------------------------------------------------

function sigmoid(x: number): number {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

/** Train logistic regression with class-weighted gradient descent + L2 regularization */
function trainLogisticRegression(
  X: number[][],
  y: number[],
  learningRate: number,
  epochs: number,
  lambda: number,
): { weights: number[]; bias: number } {
  const n = X.length;
  if (n === 0) return { weights: [], bias: 0 };
  const featureCount = X[0].length;
  const weights = new Array<number>(featureCount).fill(0);
  let bias = 0;

  // Compute class weights to handle imbalance (inversely proportional to frequency)
  const posCount = y.filter((v) => v === 1).length;
  const negCount = n - posCount;
  const wPos = posCount > 0 ? n / (2 * posCount) : 1;
  const wNeg = negCount > 0 ? n / (2 * negCount) : 1;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const dW = new Array<number>(featureCount).fill(0);
    let dB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < featureCount; j++) {
        z += weights[j] * X[i][j];
      }
      const pred = sigmoid(z);
      const sampleWeight = y[i] === 1 ? wPos : wNeg;
      const error = (pred - y[i]) * sampleWeight;
      for (let j = 0; j < featureCount; j++) {
        dW[j] += error * X[i][j];
      }
      dB += error;
    }

    for (let j = 0; j < featureCount; j++) {
      // L2 regularization: penalize large weights
      weights[j] -= (learningRate / n) * (dW[j] + lambda * weights[j]);
    }
    bias -= (learningRate / n) * dB;
  }

  return { weights, bias };
}

function predictProba(
  features: number[],
  weights: number[],
  bias: number,
): number {
  let z = bias;
  for (let j = 0; j < features.length; j++) {
    z += weights[j] * features[j];
  }
  return sigmoid(z);
}

// ---------------------------------------------------------------------------
// Model evaluation metrics
// ---------------------------------------------------------------------------

type EvalMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  aucRoc: number;
  positiveCount: number;
  negativeCount: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
};

function computeMetrics(
  probabilities: number[],
  labels: number[],
  threshold = 0.5,
): EvalMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < labels.length; i++) {
    const pred = probabilities[i] >= threshold ? 1 : 0;
    if (pred === 1 && labels[i] === 1) tp++;
    else if (pred === 1 && labels[i] === 0) fp++;
    else if (pred === 0 && labels[i] === 0) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = labels.length > 0 ? (tp + tn) / labels.length : 0;

  // Compute AUC-ROC using trapezoidal rule
  const aucRoc = computeAucRoc(probabilities, labels);

  return {
    accuracy,
    precision,
    recall,
    f1,
    aucRoc,
    positiveCount: tp + fn,
    negativeCount: tn + fp,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
  };
}

function computeAucRoc(probabilities: number[], labels: number[]): number {
  if (probabilities.length === 0) return 0;
  const totalPos = labels.filter((l) => l === 1).length;
  const totalNeg = labels.length - totalPos;
  if (totalPos === 0 || totalNeg === 0) return 0.5;

  // Sort by descending probability
  const pairs = probabilities
    .map((p, i) => ({ p, label: labels[i] }))
    .sort((a, b) => b.p - a.p);

  let auc = 0;
  let tpCount = 0;
  let fpCount = 0;
  let prevTpr = 0;
  let prevFpr = 0;

  for (const { label } of pairs) {
    if (label === 1) tpCount++;
    else fpCount++;
    const tpr = tpCount / totalPos;
    const fpr = fpCount / totalNeg;
    // Trapezoidal rule
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevTpr = tpr;
    prevFpr = fpr;
  }

  return auc;
}

// ---------------------------------------------------------------------------
// Synthetic diff generation from inspection dates
// ---------------------------------------------------------------------------

/**
 * Build synthetic DiffEntry[] by grouping features into monthly windows based
 * on their inspection date (dato). This creates years of ground-truth data
 * from the dates already present in the complete tilsyn dataset, rather than
 * relying only on the small number of real daily diffs.
 *
 * For each monthly window, establishments inspected in that month become the
 * positive examples (newInspections/changedInspections). If an orgnummer had
 * a prior inspection in an earlier month, the record goes into
 * changedInspections; otherwise it's in newInspections.
 */
function buildSyntheticDiffs(features: Feature[]): DiffEntry[] {
  // Group features by YYYY-MM based on their dato field
  const byMonth = new Map<string, Feature[]>();
  for (const f of features) {
    const d = parseDatoToDate(f.properties.dato);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const group = byMonth.get(key);
    if (group) group.push(f);
    else byMonth.set(key, [f]);
  }

  // Sort month keys chronologically
  const months = Array.from(byMonth.keys()).sort();

  // Track which orgnummers have been seen in prior months
  const seenOrgs = new Set<string>();
  const diffs: DiffEntry[] = [];

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const monthFeatures = byMonth.get(month)!;
    const newInspections: TilsynProperties[] = [];
    const changedInspections: TilsynProperties[] = [];

    for (const f of monthFeatures) {
      const org = f.properties.orgnummer;
      if (org && seenOrgs.has(org)) {
        changedInspections.push(f.properties);
      } else {
        newInspections.push(f.properties);
      }
    }

    // Mark all orgnummers from this month as seen
    for (const f of monthFeatures) {
      const org = f.properties.orgnummer;
      if (org) seenOrgs.add(org);
    }

    diffs.push({
      generatedAt: `${month}-01T00:00:00.000Z`,
      previousDownload: i > 0 ? `${months[i - 1]}-01T00:00:00.000Z` : null,
      summary: {
        previousTotal: 0,
        currentTotal: monthFeatures.length,
        newCount: newInspections.length,
        changedCount: changedInspections.length,
        removedCount: 0,
      },
      newInspections,
      changedInspections,
      removedIds: [],
    });
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Feature extraction for each establishment
// ---------------------------------------------------------------------------

type EstablishmentData = {
  id: string;
  orgnummer: string | null;
  navn: string;
  adresse: string;
  dato: string;
  score: number;
  daysSinceInspection: number;
  worstScore: number;
  violationCount: number;
  priorInspectionCount: number; // How many inspections for this orgnummer
  lat: number;
  lng: number;
};

function extractEstablishments(features: Feature[]): EstablishmentData[] {
  const now = new Date();
  const byId = new Map<string, Feature>();

  // Keep the most recent inspection per tilsynsobjektid
  for (const f of features) {
    const id = f.properties.tilsynsobjektid;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, f);
    } else {
      const existingDate = parseDatoToDate(existing.properties.dato);
      const newDate = parseDatoToDate(f.properties.dato);
      if (newDate && existingDate && newDate > existingDate) {
        byId.set(id, f);
      }
    }
  }

  // Count inspections per orgnummer (for history feature)
  const orgCounts = new Map<string, number>();
  for (const f of features) {
    const org = f.properties.orgnummer;
    if (org) orgCounts.set(org, (orgCounts.get(org) ?? 0) + 1);
  }

  const result: EstablishmentData[] = [];
  for (const [id, f] of byId) {
    const p = f.properties;
    const inspDate = parseDatoToDate(p.dato);
    const daysSince = inspDate
      ? Math.max(0, Math.round((now.getTime() - inspDate.getTime()) / MS_PER_DAY))
      : 365;

    const scores = [p.karakter1, p.karakter2, p.karakter3, p.karakter4]
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 3);
    const worstScore = scores.length > 0 ? Math.max(...scores) : computeSmileScore(p);
    const violationCount = scores.filter((v) => v >= 2).length;

    const [lng, lat] = f.geometry.coordinates;

    result.push({
      id,
      orgnummer: p.orgnummer,
      navn: p.navn,
      adresse: p.adresse,
      dato: p.dato,
      score: computeSmileScore(p),
      daysSinceInspection: daysSince,
      worstScore: worstScore >= 0 ? worstScore : 0,
      violationCount,
      priorInspectionCount: p.orgnummer ? (orgCounts.get(p.orgnummer) ?? 1) : 1,
      lat,
      lng,
    });
  }

  return result;
}

function buildFeatureVector(
  est: EstablishmentData,
  maxDays: number,
  allEstablishments: EstablishmentData[],
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
): { training: number[]; daysFeat: number } {
  // Days feature — used ONLY at prediction time, NOT during training.
  // (See DAYS_BOOST_WEIGHT comment for rationale.)
  const daysFeat = maxDays > 0 ? Math.min(est.daysSinceInspection / maxDays, 1) : 0;

  // Training feature 1: Prior inspection history (more inspections = higher likelihood, capped)
  const historyFeat = Math.min(est.priorInspectionCount / 5, 1);

  // Training feature 2: Area activity — count of other inspections within 15km (grid-accelerated)
  let areaCount = 0;
  for (const other of allEstablishments) {
    if (other.id === est.id) continue;
    // Quick lat/lng bounding box pre-filter (~15km ≈ 0.135° lat)
    if (Math.abs(other.lat - est.lat) > 0.15) continue;
    if (Math.abs(other.lng - est.lng) > 0.3) continue;
    if (haversineKm(est.lat, est.lng, other.lat, other.lng) <= 15) {
      areaCount++;
    }
  }
  const areaFeat = Math.min(areaCount / 200, 1);

  // Training feature 3: Normalized latitude
  const latRange = maxLat - minLat || 1;
  const latFeat = (est.lat - minLat) / latRange;

  // Training feature 4: Normalized longitude
  const lngRange = maxLng - minLng || 1;
  const lngFeat = (est.lng - minLng) / lngRange;

  return {
    training: [historyFeat, areaFeat, latFeat, lngFeat],
    daysFeat,
  };
}

// ---------------------------------------------------------------------------
// UI components (matching analyse page patterns)
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: 16,
        padding: "20px 20px 16px",
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
        position: "relative",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          borderRadius: "16px 16px 0 0",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 6, fontWeight: 500 }}>
            {icon} {title}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: COLORS.text, lineHeight: 1.1 }}>
            {value}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4 }}>{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: 16,
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
        overflow: "hidden",
      }}
    >
      {title && (
        <div style={{ padding: "16px 20px 0", marginBottom: subtitle ? 0 : 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: COLORS.text }}>{title}</h3>
          {subtitle && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.textFaint }}>{subtitle}</p>
          )}
        </div>
      )}
      <div style={{ padding: "12px 20px 20px" }}>{children}</div>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: color + "18",
        color: color,
        borderRadius: 20,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  const pct = (value * 100).toFixed(1);
  const color = value >= 0.6 ? COLORS.smil : value >= 0.3 ? COLORS.strek : COLORS.sur;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: COLORS.textMuted }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{pct}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction result type
// ---------------------------------------------------------------------------

type PredictionResult = {
  id: string;
  navn: string;
  adresse: string;
  dato: string;
  score: number;
  probability: number;
  daysSinceInspection: number;
};

type ModelInfo = {
  trainMetrics: EvalMetrics;
  testMetrics: EvalMetrics;
  featureWeights: { name: string; weight: number; isFixed?: boolean }[];
  trainSize: number;
  testSize: number;
  positiveRate: number;
  syntheticMonths?: number;
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PredictionPage() {
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [totalEstablishments, setTotalEstablishments] = useState(0);

  useEffect(() => {
    fetch("/tilsyn.geojson")
      .then((r) => r.json())
      .then((geo) => {
      const features: Feature[] = geo.features ?? [];

      // Build synthetic diff history from inspection dates in the dataset.
      // This gives us years of ground-truth data instead of just the few
      // daily diffs captured since we started tracking.
      const diffHistory = buildSyntheticDiffs(features);

      // Extract establishments
      const establishments = extractEstablishments(features);
      setTotalEstablishments(establishments.length);

      if (establishments.length === 0) {
        setLoading(false);
        return;
      }

      // Build ground truth: establishments recently inspected (appeared in diffs)
      const recentlyInspectedIds = new Set<string>();
      for (const diff of diffHistory) {
        for (const insp of diff.newInspections) {
          recentlyInspectedIds.add(insp.tilsynsobjektid);
        }
        for (const insp of diff.changedInspections) {
          recentlyInspectedIds.add(insp.tilsynsobjektid);
        }
      }

      // Compute bounds for normalization
      const lats = establishments.map((e) => e.lat);
      const lngs = establishments.map((e) => e.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const maxDays = Math.max(...establishments.map((e) => e.daysSinceInspection), 1);

      // Build feature vectors (training features and days feature are separate)
      const trainingVectors: number[][] = [];
      const daysFeatures: number[] = [];
      const labels: number[] = [];

      for (const est of establishments) {
        const { training, daysFeat } = buildFeatureVector(est, maxDays, establishments, minLat, maxLat, minLng, maxLng);
        trainingVectors.push(training);
        daysFeatures.push(daysFeat);
        labels.push(recentlyInspectedIds.has(est.id) ? 1 : 0);
      }

      // Train/test split using seeded PRNG for reproducibility
      const positiveCount = labels.filter((l) => l === 1).length;
      const hasPositives = positiveCount > 0 && positiveCount < labels.length;

      if (hasPositives) {
        const rng = mulberry32(RANDOM_SEED);
        const indices = trainingVectors.map((_, i) => i);
        // Shuffle indices
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const splitPoint = Math.floor(indices.length * (1 - TEST_SPLIT));
        const trainIdx = indices.slice(0, splitPoint);
        const testIdx = indices.slice(splitPoint);

        const trainX = trainIdx.map((i) => trainingVectors[i]);
        const trainY = trainIdx.map((i) => labels[i]);
        const testX = testIdx.map((i) => trainingVectors[i]);
        const testY = testIdx.map((i) => labels[i]);

        // Train model on non-leaky features only
        const model = trainLogisticRegression(trainX, trainY, LEARNING_RATE, TRAINING_EPOCHS, L2_LAMBDA);

        // Evaluate on train (base model only, without days boost)
        const trainProbs = trainX.map((x) => predictProba(x, model.weights, model.bias));
        const trainMetrics = computeMetrics(trainProbs, trainY);

        // Evaluate on test (base model only, without days boost)
        const testProbs = testX.map((x) => predictProba(x, model.weights, model.bias));
        const testMetrics = computeMetrics(testProbs, testY);

        // Feature importance (trained weights + the fixed days boost)
        const featureWeights = [
          { name: "Dager siden tilsyn", weight: DAYS_BOOST_WEIGHT, isFixed: true },
          ...TRAINING_FEATURE_NAMES.map((name, j) => ({
            name,
            weight: model.weights[j] ?? 0,
            isFixed: false,
          })),
        ].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

        setModelInfo({
          trainMetrics,
          testMetrics,
          featureWeights,
          trainSize: trainX.length,
          testSize: testX.length,
          positiveRate: positiveCount / labels.length,
          syntheticMonths: diffHistory.length,
        });

        // Generate predictions for ALL establishments:
        // Combine trained model logit + days-based boost in logit space.
        // Days boost ensures: more days since inspection → higher probability.
        // Only include smiley-face restaurants (score ≤ 1) — restaurants with violations
        // already know they have something to fix.
        const results: PredictionResult[] = establishments
          .map((est, i) => {
            const modelLogit = model.weights.reduce(
              (sum, w, j) => sum + w * trainingVectors[i][j], model.bias,
            );
            const combinedLogit = modelLogit + DAYS_BOOST_WEIGHT * daysFeatures[i];
            return {
              id: est.id,
              navn: est.navn,
              adresse: est.adresse,
              dato: est.dato,
              score: est.score,
              probability: sigmoid(combinedLogit),
              daysSinceInspection: est.daysSinceInspection,
            };
          })
          .filter((r) => r.score <= 1);

        results.sort((a, b) => b.probability - a.probability);
        setPredictions(results);
      } else {
        // Fallback heuristic weights when no ground truth is available
        // [history, area, lat, lng]
        const fallbackWeights = [0.3, 0.3, 0.1, 0.1];
        const fallbackBias = -1.5;

        const results: PredictionResult[] = establishments
          .map((est, i) => {
            const modelLogit = fallbackWeights.reduce(
              (sum, w, j) => sum + w * trainingVectors[i][j], fallbackBias,
            );
            const combinedLogit = modelLogit + DAYS_BOOST_WEIGHT * daysFeatures[i];
            return {
              id: est.id,
              navn: est.navn,
              adresse: est.adresse,
              dato: est.dato,
              score: est.score,
              probability: sigmoid(combinedLogit),
              daysSinceInspection: est.daysSinceInspection,
            };
          })
          .filter((r) => r.score <= 1);

        results.sort((a, b) => b.probability - a.probability);
        setPredictions(results);
      }

      setLoading(false);
    });
  }, []);

  const smileyCount = useMemo(
    () => predictions.length,
    [predictions],
  );

  const highRiskCount = useMemo(
    () => predictions.filter((p) => p.probability > 0.7).length,
    [predictions],
  );

  const top50 = useMemo(() => predictions.slice(0, 50), [predictions]);

  const testF1 = modelInfo?.testMetrics.f1 ?? 0;
  const testAuc = modelInfo?.testMetrics.aucRoc ?? 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLORS.bg,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: `3px solid ${COLORS.border}`,
              borderTopColor: COLORS.primary,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: COLORS.textMuted, fontSize: 15 }}>Trener modell…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: COLORS.text,
      }}
    >
      <style>{`
        .predict-grid-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .predict-header-inner { max-width: 1280px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .predict-content { max-width: 1280px; margin: 0 auto; padding: 24px 20px 60px; }
        .predict-eval-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        @media (max-width: 768px) {
          .predict-grid-kpi { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
          .predict-eval-grid { grid-template-columns: 1fr; }
          .predict-content { padding: 16px 12px 40px; }
          .predict-header-inner { gap: 8px; }
        }
        @media (max-width: 480px) {
          .predict-grid-kpi { grid-template-columns: 1fr; gap: 8px; }
          .predict-header-inner { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      {/* ============================================================== */}
      {/* HEADER                                                         */}
      {/* ============================================================== */}
      <header
        style={{
          background: "#fff",
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "16px 24px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(12px)",
          backgroundColor: "rgba(255,255,255,0.85)",
        }}
      >
        <div className="predict-header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link
              href="/"
              style={{
                color: COLORS.primary,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 500,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "6px 14px",
                transition: "all 0.15s",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ← Kart
            </Link>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
                Prediksjoner
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textFaint }}>
                Smilefjeskartet · Når inspiseres 😊-steder neste?
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            <Link
              href="/"
              style={{ color: COLORS.primary, textDecoration: "none", fontWeight: 500 }}
            >
              Kart
            </Link>
            <Link
              href="/analyse"
              style={{ color: COLORS.primary, textDecoration: "none", fontWeight: 500 }}
            >
              Analyse
            </Link>
          </div>
        </div>
      </header>

      <div className="predict-content">
        {/* ============================================================== */}
        {/* KPI CARDS ROW                                                  */}
        {/* ============================================================== */}
        <div className="predict-grid-kpi">
          <KpiCard
            icon="😊"
            title="Smilefjes-steder"
            value={smileyCount.toLocaleString("nb-NO")}
            subtitle={`Av ${totalEstablishments.toLocaleString("nb-NO")} totalt · Kun steder uten brudd`}
            color={COLORS.smil}
          />
          <KpiCard
            icon="🎯"
            title="F1-score (test)"
            value={testF1 > 0 ? `${(testF1 * 100).toFixed(1)}%` : "–"}
            subtitle={modelInfo ? `Precision: ${(modelInfo.testMetrics.precision * 100).toFixed(0)}% · Recall: ${(modelInfo.testMetrics.recall * 100).toFixed(0)}%` : "Heuristisk modell"}
            color={testF1 >= 0.3 ? COLORS.smil : testF1 > 0 ? COLORS.strek : COLORS.textFaint}
          />
          <KpiCard
            icon="📈"
            title="AUC-ROC (test)"
            value={testAuc > 0 ? `${(testAuc * 100).toFixed(1)}%` : "–"}
            subtitle={testAuc >= 0.7 ? "God diskriminering" : testAuc >= 0.5 ? "Moderat diskriminering" : "Svak modell"}
            color={testAuc >= 0.7 ? COLORS.smil : testAuc >= 0.55 ? COLORS.strek : COLORS.textFaint}
          />
          <KpiCard
            icon="⚠️"
            title="Høy risiko (>70%)"
            value={highRiskCount.toLocaleString("nb-NO")}
            subtitle={`${smileyCount > 0 ? ((highRiskCount / smileyCount) * 100).toFixed(1) : 0}% av 😊-steder`}
            color={highRiskCount > 0 ? COLORS.sur : COLORS.smil}
          />
        </div>

        {/* ============================================================== */}
        {/* MODEL EVALUATION DETAILS                                       */}
        {/* ============================================================== */}
        {modelInfo && (
          <div className="predict-eval-grid">
            <SectionCard
              title="📊 Modellevaluering"
              subtitle={`Trent på ${modelInfo.trainSize} · Testet på ${modelInfo.testSize} eksempler${modelInfo.syntheticMonths ? ` · Syntetisk grunnlag: ${modelInfo.syntheticMonths} månedsvinduer` : ""}`}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textFaint, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Treningssett</div>
                  <MetricRow label="Nøyaktighet" value={modelInfo.trainMetrics.accuracy} />
                  <MetricRow label="Precision" value={modelInfo.trainMetrics.precision} />
                  <MetricRow label="Recall" value={modelInfo.trainMetrics.recall} />
                  <MetricRow label="F1-score" value={modelInfo.trainMetrics.f1} />
                  <MetricRow label="AUC-ROC" value={modelInfo.trainMetrics.aucRoc} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textFaint, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Testsett</div>
                  <MetricRow label="Nøyaktighet" value={modelInfo.testMetrics.accuracy} />
                  <MetricRow label="Precision" value={modelInfo.testMetrics.precision} />
                  <MetricRow label="Recall" value={modelInfo.testMetrics.recall} />
                  <MetricRow label="F1-score" value={modelInfo.testMetrics.f1} />
                  <MetricRow label="AUC-ROC" value={modelInfo.testMetrics.aucRoc} />
                </div>
              </div>
              <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bg, borderRadius: 8, fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Konfusjonsmatrise (test)</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "2px 8px", fontSize: 11 }}>
                  <span />
                  <span style={{ color: COLORS.textFaint, textAlign: "center" }}>Predikert +</span>
                  <span style={{ color: COLORS.textFaint, textAlign: "center" }}>Predikert −</span>
                  <span style={{ color: COLORS.textFaint }}>Faktisk +</span>
                  <span style={{ textAlign: "center", fontWeight: 600, color: COLORS.smil }}>{modelInfo.testMetrics.truePositives}</span>
                  <span style={{ textAlign: "center", fontWeight: 600, color: COLORS.sur }}>{modelInfo.testMetrics.falseNegatives}</span>
                  <span style={{ color: COLORS.textFaint }}>Faktisk −</span>
                  <span style={{ textAlign: "center", fontWeight: 600, color: COLORS.strek }}>{modelInfo.testMetrics.falsePositives}</span>
                  <span style={{ textAlign: "center", fontWeight: 600, color: COLORS.smil }}>{modelInfo.testMetrics.trueNegatives}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="⚖️ Featurevekter"
              subtitle="Viktigste egenskaper for prediksjonen (absolutt vekt)"
            >
              {modelInfo.featureWeights.map((fw) => {
                const maxWeight = Math.max(...modelInfo.featureWeights.map((w) => Math.abs(w.weight)), 0.01);
                const barWidth = Math.abs(fw.weight) / maxWeight;
                const isPositive = fw.weight >= 0;
                return (
                  <div key={fw.name} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ color: COLORS.text }}>
                        {fw.name}
                        {fw.isFixed && (
                          <span style={{ fontSize: 10, color: COLORS.textFaint, marginLeft: 4 }}>(fast)</span>
                        )}
                      </span>
                      <span style={{ color: isPositive ? COLORS.smil : COLORS.sur, fontWeight: 600 }}>
                        {isPositive ? "+" : ""}{fw.weight.toFixed(3)}
                      </span>
                    </div>
                    <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${(barWidth * 100).toFixed(1)}%`,
                          background: isPositive ? COLORS.smil : COLORS.sur,
                          borderRadius: 3,
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 12, fontSize: 11, color: COLORS.textFaint, lineHeight: 1.4 }}>
                <strong>Positiv vekt</strong> = øker sannsynlighet for inspeksjon.{" "}
                <strong>Negativ vekt</strong> = reduserer sannsynlighet.{" "}
                <strong>(fast)</strong> = fast vekt, ikke trent (forhindrer datalekkasje).
              </div>
            </SectionCard>
          </div>
        )}

        {/* ============================================================== */}
        {/* TOP 50 RANKED LIST                                             */}
        {/* ============================================================== */}
        <SectionCard
          title="🔮 Mest sannsynlige inspeksjoner"
          subtitle="Topp 50 😊-steder rangert etter predikert inspeksjonssannsynlighet"
        >
          <div style={{ overflowX: "auto", maxHeight: 700, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: COLORS.card }}>
                <tr>
                  <th
                    style={{
                      padding: "8px 8px",
                      textAlign: "center",
                      borderBottom: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      fontWeight: 500,
                      fontSize: 11,
                      width: 50,
                    }}
                  >
                    Rang
                  </th>
                  <th
                    style={{
                      padding: "8px 8px",
                      textAlign: "left",
                      borderBottom: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    Navn
                  </th>
                  <th
                    style={{
                      padding: "8px 8px",
                      textAlign: "left",
                      borderBottom: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    Adresse
                  </th>
                  <th
                    style={{
                      padding: "8px 8px",
                      textAlign: "center",
                      borderBottom: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    Sannsynlighet
                  </th>
                  <th
                    style={{
                      padding: "8px 8px",
                      textAlign: "center",
                      borderBottom: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    Dager siden tilsyn
                  </th>
                </tr>
              </thead>
              <tbody>
                {top50.map((item, i) => {
                  const probPct = item.probability * 100;
                  const probColor =
                    probPct >= 70
                      ? COLORS.sur
                      : probPct >= 40
                        ? COLORS.strek
                        : COLORS.smil;

                  // Shorten address for display
                  const addrParts = item.adresse.split(",").map((s) => s.trim());
                  const shortAddr =
                    addrParts.length >= 2
                      ? `${addrParts[0]}, ${addrParts[addrParts.length - 1]}`
                      : item.adresse;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom:
                          i < top50.length - 1 ? `1px solid ${COLORS.border}30` : "none",
                      }}
                    >
                      <td
                        style={{
                          padding: "8px 8px",
                          textAlign: "center",
                          fontWeight: 700,
                          color: COLORS.textFaint,
                          fontSize: 13,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td style={{ padding: "8px 8px", fontWeight: 500 }}>
                        <span
                          style={{
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}
                        >
                          {item.navn}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "8px 8px",
                          color: COLORS.textMuted,
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {shortAddr}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "center" }}>
                        <Badge color={probColor}>{probPct.toFixed(1)}%</Badge>
                      </td>
                      <td
                        style={{
                          padding: "8px 8px",
                          textAlign: "center",
                          color: COLORS.textMuted,
                        }}
                      >
                        {item.daysSinceInspection} d
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ============================================================== */}
        {/* FOOTER                                                         */}
        {/* ============================================================== */}
        <footer
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: `1px solid ${COLORS.border}`,
            fontSize: 12,
            color: COLORS.textFaint,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span>
            Data:{" "}
            <a
              href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: COLORS.primary, textDecoration: "none" }}
            >
              Mattilsynet
            </a>
            {" ("}
            <a
              href="https://data.norge.no/nlod/no/2.0"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: COLORS.primary, textDecoration: "none" }}
            >
              NLOD
            </a>
            {")"}
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: COLORS.primary, textDecoration: "none" }}>
              Kart
            </Link>
            <Link href="/analyse" style={{ color: COLORS.primary, textDecoration: "none" }}>
              Analyse
            </Link>
            <Link href="/varsling" style={{ color: COLORS.primary, textDecoration: "none" }}>
              Varsling
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
