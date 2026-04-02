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

const SCORE_EMOJI: Record<number, string> = {
  0: "😊",
  1: "😊",
  2: "😐",
  3: "😠",
};

const SCORE_LABELS: Record<number, string> = {
  0: "Ingen brudd",
  1: "Små brudd",
  2: "Strekmunn",
  3: "Sur munn",
};

// ---------------------------------------------------------------------------
// Logistic Regression (from scratch)
// ---------------------------------------------------------------------------

function sigmoid(x: number): number {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

/** Train logistic regression with gradient descent and return weights + bias. */
function trainLogisticRegression(
  X: number[][],
  y: number[],
  learningRate: number,
  epochs: number,
): { weights: number[]; bias: number; accuracy: number } {
  const n = X.length;
  if (n === 0) return { weights: [], bias: 0, accuracy: 0 };
  const featureCount = X[0].length;
  const weights = new Array<number>(featureCount).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const dW = new Array<number>(featureCount).fill(0);
    let dB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < featureCount; j++) {
        z += weights[j] * X[i][j];
      }
      const pred = sigmoid(z);
      const error = pred - y[i];
      for (let j = 0; j < featureCount; j++) {
        dW[j] += error * X[i][j];
      }
      dB += error;
    }

    for (let j = 0; j < featureCount; j++) {
      weights[j] -= (learningRate / n) * dW[j];
    }
    bias -= (learningRate / n) * dB;
  }

  // Compute accuracy
  let correct = 0;
  for (let i = 0; i < n; i++) {
    let z = bias;
    for (let j = 0; j < featureCount; j++) {
      z += weights[j] * X[i][j];
    }
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
  }

  return { weights, bias, accuracy: n > 0 ? correct / n : 0 };
}

function predict(
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
// Feature extraction for each establishment
// ---------------------------------------------------------------------------

type EstablishmentData = {
  id: string;
  navn: string;
  adresse: string;
  dato: string;
  score: number;
  daysSinceInspection: number;
  worstScore: number;
  violationCount: number;
  lat: number;
  lng: number;
};

function extractEstablishments(features: Feature[]): EstablishmentData[] {
  const now = new Date();
  const byId = new Map<string, Feature>();

  // Keep the most recent inspection per establishment
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

  const result: EstablishmentData[] = [];
  for (const [id, f] of byId) {
    const p = f.properties;
    const inspDate = parseDatoToDate(p.dato);
    const daysSince = inspDate
      ? Math.max(0, Math.round((now.getTime() - inspDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 365;

    const scores = [p.karakter1, p.karakter2, p.karakter3, p.karakter4]
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 3);
    const worstScore = scores.length > 0 ? Math.max(...scores) : computeSmileScore(p);
    const violationCount = scores.filter((v) => v >= 2).length;

    const [lng, lat] = f.geometry.coordinates;

    result.push({
      id,
      navn: p.navn,
      adresse: p.adresse,
      dato: p.dato,
      score: computeSmileScore(p),
      daysSinceInspection: daysSince,
      worstScore: worstScore >= 0 ? worstScore : 0,
      violationCount,
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
): number[] {
  // Feature 1: Days since inspection (normalized 0-1)
  const daysFeat = maxDays > 0 ? Math.min(est.daysSinceInspection / maxDays, 1) : 0;

  // Feature 2: Worst score (normalized 0-1)
  const scoreFeat = est.worstScore / 3;

  // Feature 3: Number of category violations (normalized 0-1)
  const violFeat = est.violationCount / 4;

  // Feature 4: Area activity — count of other inspections within 15km
  let areaCount = 0;
  for (const other of allEstablishments) {
    if (other.id === est.id) continue;
    if (haversineKm(est.lat, est.lng, other.lat, other.lng) <= 15) {
      areaCount++;
    }
  }
  // Normalize area activity (cap at 200 for normalization)
  const areaFeat = Math.min(areaCount / 200, 1);

  // Feature 5: Normalized latitude
  const latRange = maxLat - minLat || 1;
  const latFeat = (est.lat - minLat) / latRange;

  // Feature 6: Normalized longitude
  const lngRange = maxLng - minLng || 1;
  const lngFeat = (est.lng - minLng) / lngRange;

  return [daysFeat, scoreFeat, violFeat, areaFeat, latFeat, lngFeat];
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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PredictionPage() {
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [modelAccuracy, setModelAccuracy] = useState(0);
  const [totalEstablishments, setTotalEstablishments] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/tilsyn.geojson").then((r) => r.json()),
      fetch("/tilsyn-diff.json")
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([geo, diffData]) => {
      const features: Feature[] = geo.features ?? [];

      // Parse diff history
      let diffHistory: DiffEntry[] = [];
      if (Array.isArray(diffData)) {
        diffHistory = diffData;
      } else if (diffData && typeof diffData === "object" && diffData.generatedAt) {
        diffHistory = [diffData];
      }

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

      // Use a sample for area activity calculation to keep it performant
      // For large datasets, sample neighbours instead of full O(n²)
      const sampleSize = Math.min(establishments.length, 2000);
      const sample =
        establishments.length <= sampleSize
          ? establishments
          : establishments
              .map((e, i) => ({ e, i, r: Math.random() }))
              .sort((a, b) => a.r - b.r)
              .slice(0, sampleSize)
              .map((x) => x.e);

      // Build feature vectors
      const featureVectors: number[][] = [];
      const labels: number[] = [];

      for (const est of establishments) {
        const fv = buildFeatureVector(est, maxDays, sample, minLat, maxLat, minLng, maxLng);
        featureVectors.push(fv);
        labels.push(recentlyInspectedIds.has(est.id) ? 1 : 0);
      }

      // Train model
      const positiveCount = labels.filter((l) => l === 1).length;
      const hasPositives = positiveCount > 0 && positiveCount < labels.length;

      let model: { weights: number[]; bias: number; accuracy: number };
      if (hasPositives) {
        model = trainLogisticRegression(featureVectors, labels, 1.0, 200);
      } else {
        // Fallback: no ground truth, use heuristic weights
        // Higher weight for days since inspection and worst score
        model = {
          weights: [2.0, 1.5, 1.0, 0.3, 0.1, 0.1],
          bias: -1.5,
          accuracy: 0,
        };
      }

      setModelAccuracy(model.accuracy);

      // Generate predictions for all establishments
      const results: PredictionResult[] = establishments.map((est, i) => ({
        id: est.id,
        navn: est.navn,
        adresse: est.adresse,
        dato: est.dato,
        score: est.score,
        probability: predict(featureVectors[i], model.weights, model.bias),
        daysSinceInspection: est.daysSinceInspection,
      }));

      // Sort by probability descending
      results.sort((a, b) => b.probability - a.probability);
      setPredictions(results);
      setLoading(false);
    });
  }, []);

  // Derived stats
  const avgConfidence = useMemo(() => {
    if (predictions.length === 0) return 0;
    const sum = predictions.reduce((acc, p) => acc + p.probability, 0);
    return sum / predictions.length;
  }, [predictions]);

  const highRiskCount = useMemo(
    () => predictions.filter((p) => p.probability > 0.7).length,
    [predictions],
  );

  const top50 = useMemo(() => predictions.slice(0, 50), [predictions]);

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
        @media (max-width: 768px) {
          .predict-grid-kpi { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
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
                Smilefjeskartet · Hvilke steder inspiseres neste?
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
            icon="📋"
            title="Serveringssteder"
            value={totalEstablishments.toLocaleString("nb-NO")}
            subtitle="Unike tilsynsobjekter"
            color={COLORS.primary}
          />
          <KpiCard
            icon="🎯"
            title="Modellnøyaktighet"
            value={modelAccuracy > 0 ? `${(modelAccuracy * 100).toFixed(1)}%` : "–"}
            subtitle={modelAccuracy > 0 ? "Logistisk regresjon" : "Heuristisk modell"}
            color={modelAccuracy >= 0.7 ? COLORS.smil : modelAccuracy > 0 ? COLORS.strek : COLORS.textFaint}
          />
          <KpiCard
            icon="📊"
            title="Gj.snitt konfidens"
            value={`${(avgConfidence * 100).toFixed(1)}%`}
            subtitle="Gjennomsnittlig sannsynlighet"
            color={COLORS.accent}
          />
          <KpiCard
            icon="⚠️"
            title="Høy risiko (>70%)"
            value={highRiskCount.toLocaleString("nb-NO")}
            subtitle={`${totalEstablishments > 0 ? ((highRiskCount / totalEstablishments) * 100).toFixed(1) : 0}% av alle steder`}
            color={highRiskCount > 0 ? COLORS.sur : COLORS.smil}
          />
        </div>

        {/* ============================================================== */}
        {/* TOP 50 RANKED LIST                                             */}
        {/* ============================================================== */}
        <SectionCard
          title="🔮 Mest sannsynlige inspeksjoner"
          subtitle="Topp 50 serveringssteder rangert etter predikert inspeksjonssannsynlighet"
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
                    Karakter
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

                  const scoreColor =
                    item.score <= 1
                      ? COLORS.smil
                      : item.score === 2
                        ? COLORS.strek
                        : item.score === 3
                          ? COLORS.sur
                          : COLORS.textFaint;

                  const emoji = SCORE_EMOJI[item.score] ?? "❓";
                  const scoreLabel = SCORE_LABELS[item.score] ?? "Ukjent";

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
                      <td style={{ padding: "8px 8px", textAlign: "center" }}>
                        <Badge color={scoreColor}>
                          {emoji} {scoreLabel}
                        </Badge>
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
          </div>
        </footer>
      </div>
    </main>
  );
}
