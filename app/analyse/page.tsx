"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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

type DiffData = {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDato(ddmmyyyy: string): string {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return ddmmyyyy;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 8)}`;
}

function parseDatoToDate(ddmmyyyy: string): Date | null {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return null;
  const year = parseInt(d.slice(4, 8));
  const month = parseInt(d.slice(2, 4)) - 1;
  const day = parseInt(d.slice(0, 2));
  return new Date(year, month, day);
}

/** Same logic as map page: max of karakter1-4 (only 0-3 count), fallback to karakter */
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

type SmileGroup = "smil" | "strek" | "sur";

function smileGroupFromScore(score: number): SmileGroup | null {
  if (score === 0 || score === 1) return "smil";
  if (score === 2) return "strek";
  if (score === 3) return "sur";
  return null;
}

function smileGroupLabel(g: SmileGroup): string {
  switch (g) {
    case "smil": return "Smil 😊";
    case "strek": return "Strekmunn 😐";
    case "sur": return "Sur munn 😠";
  }
}

function smileGroupColor(g: SmileGroup): string {
  switch (g) {
    case "smil": return "#2ecc71";
    case "strek": return "#f1c40f";
    case "sur": return "#e74c3c";
  }
}

function scoreLabel(k: number): string {
  switch (k) {
    case 0: return "Ingen brudd 😊";
    case 1: return "Små brudd 😊";
    case 2: return "Strekmunn 😐";
    case 3: return "Sur munn 😠";
    default: return "Ukjent";
  }
}

function scoreColor(k: number): string {
  switch (k) {
    case 0: return "#2ecc71";
    case 1: return "#27ae60";
    case 2: return "#f1c40f";
    case 3: return "#e74c3c";
    default: return "#999";
  }
}

// ---------------------------------------------------------------------------
// Canvas chart helpers
// ---------------------------------------------------------------------------

function drawBarChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  colors: string[],
  title: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Title
  ctx.fillStyle = "#333";
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, w / 2, 22);

  const maxVal = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  const chartTop = 42;
  // Use more label space when there are many bars (rotated labels need more room)
  const useRotatedLabels = labels.length > 5;
  const labelAreaHeight = useRotatedLabels ? 80 : 50;
  const chartBottom = h - labelAreaHeight;
  const chartHeight = chartBottom - chartTop;

  // Calculate bar layout: evenly divide the chart width
  const sidePadding = useRotatedLabels ? 20 : 40;
  const availableWidth = w - sidePadding * 2;
  const slotWidth = availableWidth / labels.length;
  const barWidth = Math.min(80, slotWidth * 0.7);

  // Y-axis grid lines
  ctx.strokeStyle = "#f0f0f0";
  ctx.lineWidth = 1;
  const gridLeft = sidePadding;
  const gridRight = w - sidePadding;
  for (let i = 0; i <= 4; i++) {
    const y = chartTop + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(gridLeft, y);
    ctx.lineTo(gridRight, y);
    ctx.stroke();
  }

  for (let i = 0; i < labels.length; i++) {
    const slotCenter = sidePadding + slotWidth * i + slotWidth / 2;
    const x = slotCenter - barWidth / 2;
    const barH = Math.max(2, (values[i] / maxVal) * chartHeight);
    const y = chartBottom - barH;

    ctx.fillStyle = colors[i] || "#4a90d9";
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, 6);
    ctx.fill();

    // Value on top of bar (skip percentage for many bars to avoid clutter)
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    if (useRotatedLabels) {
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`${values[i]}`, slotCenter, y - 4);
    } else {
      ctx.font = "bold 13px sans-serif";
      const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : "0";
      ctx.fillText(`${values[i]}`, slotCenter, y - 16);
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#888";
      ctx.fillText(`${pct}%`, slotCenter, y - 3);
    }

    // Label
    ctx.fillStyle = "#555";
    if (useRotatedLabels) {
      // Rotated labels at -45° to prevent overlap
      ctx.save();
      ctx.translate(slotCenter, chartBottom + 8);
      ctx.rotate(-Math.PI / 4);
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(labels[i], 0, 0);
      ctx.restore();
    } else {
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[i], slotCenter, chartBottom + 20);
    }
  }
}

function drawTimelineChart(
  canvas: HTMLCanvasElement,
  data: Array<{ label: string; count: number }>,
  title: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Title
  ctx.fillStyle = "#333";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, w / 2, 20);

  if (data.length === 0) return;

  const maxVal = Math.max(...data.map(d => d.count), 1);
  const chartLeft = 50;
  const chartRight = w - 20;
  const chartTop = 40;
  const chartBottom = h - 40;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  // Y-axis grid
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = chartTop + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = "#999";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(maxVal * (1 - i / 4))), chartLeft - 5, y + 4);
  }

  // Line + area
  const stepX = chartWidth / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => ({
    x: chartLeft + i * stepX,
    y: chartTop + chartHeight * (1 - d.count / maxVal),
  }));

  // Area
  ctx.beginPath();
  ctx.moveTo(points[0].x, chartBottom);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1].x, chartBottom);
  ctx.closePath();
  ctx.fillStyle = "rgba(74, 144, 217, 0.15)";
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = "#4a90d9";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#4a90d9";
    ctx.fill();
  }

  // X labels (show subset to avoid overlap)
  const labelStep = Math.max(1, Math.floor(data.length / 8));
  ctx.fillStyle = "#666";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < data.length; i += labelStep) {
    ctx.fillText(data[i].label, points[i].x, chartBottom + 16);
  }
  // Always show last label
  if (data.length > 1) {
    ctx.fillText(data[data.length - 1].label, points[points.length - 1].x, chartBottom + 16);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalysePage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"oversikt" | "nye" | "tidslinje" | "geografi">("oversikt");

  const scoreChartRef = useRef<HTMLCanvasElement>(null);
  const timelineChartRef = useRef<HTMLCanvasElement>(null);
  const regionChartRef = useRef<HTMLCanvasElement>(null);
  const downloadChartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/tilsyn.geojson").then(r => r.json()),
      fetch("/tilsyn-diff.json").then(r => r.json()).catch(() => null),
      fetch("/tilsyn-meta.json").then(r => r.json()).catch(() => null),
    ]).then(([geo, diffData, metaData]) => {
      setFeatures(geo.features ?? []);
      setDiff(diffData);
      setMeta(metaData);
      setLoading(false);
    });
  }, []);

  // Score distribution using same logic as map (max of karakter1-4)
  const scoreDist = useCallback(() => {
    const dist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const f of features) {
      const k = computeSmileScore(f.properties);
      if (k >= 0 && k <= 3) dist[k]++;
    }
    return dist;
  }, [features]);

  // Grouped distribution: smil (0+1), strek (2), sur (3) – matches map colors
  const groupedDist = useCallback(() => {
    const groups: Record<SmileGroup, number> = { smil: 0, strek: 0, sur: 0 };
    for (const f of features) {
      const g = smileGroupFromScore(computeSmileScore(f.properties));
      if (g) groups[g]++;
    }
    return groups;
  }, [features]);

  // Monthly inspection counts
  const monthlyData = useCallback(() => {
    const months: Record<string, number> = {};
    for (const f of features) {
      const date = parseDatoToDate(f.properties.dato);
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months[key] = (months[key] || 0) + 1;
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count }));
  }, [features]);

  // Region distribution (by poststed from address)
  const regionData = useCallback(() => {
    const regions: Record<string, number> = {};
    for (const f of features) {
      const addr = f.properties.adresse;
      const parts = addr.split(",").map(s => s.trim());
      const poststed = parts.length >= 2 ? parts[parts.length - 1] : "Ukjent";
      regions[poststed] = (regions[poststed] || 0) + 1;
    }
    return Object.entries(regions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15);
  }, [features]);

  // Draw charts when data or tab changes
  useEffect(() => {
    if (loading || features.length === 0) return;

    if (activeTab === "oversikt" && scoreChartRef.current) {
      const groups = groupedDist();
      const groupKeys: SmileGroup[] = ["smil", "strek", "sur"];
      drawBarChart(
        scoreChartRef.current,
        groupKeys.map(g => smileGroupLabel(g)),
        groupKeys.map(g => groups[g]),
        groupKeys.map(g => smileGroupColor(g)),
        "Fordeling av smilefjesresultater"
      );
    }

    if (activeTab === "tidslinje" && timelineChartRef.current) {
      drawTimelineChart(
        timelineChartRef.current,
        monthlyData(),
        "Antall kontroller per måned"
      );
    }

    if (activeTab === "geografi" && regionChartRef.current) {
      const regions = regionData();
      drawBarChart(
        regionChartRef.current,
        regions.map(([name]) => name.length > 12 ? name.slice(0, 11) + "…" : name),
        regions.map(([, count]) => count),
        regions.map(() => "#4a90d9"),
        "Topp 15 områder med flest kontroller"
      );
    }

    if (activeTab === "oversikt" && downloadChartRef.current && meta?.downloadHistory) {
      const histData = meta.downloadHistory.map(h => ({
        label: new Date(h.downloadedAt).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" }),
        count: h.newCount,
      }));
      if (histData.length > 0) {
        drawTimelineChart(downloadChartRef.current, histData, "Nye kontroller per nedlasting");
      }
    }
  }, [loading, features, activeTab, scoreDist, groupedDist, monthlyData, regionData, meta]);

  if (loading) {
    return (
      <main style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 1000, margin: "0 auto" }}>
        <p>Laster data…</p>
      </main>
    );
  }

  const dist = scoreDist();
  const groups = groupedDist();

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 1000, margin: "0 auto", padding: "20px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link
          href="/"
          style={{
            color: "#4a90d9",
            textDecoration: "none",
            fontSize: 14,
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "6px 12px",
          }}
        >
          ← Tilbake til kartet
        </Link>
        <h1 style={{ margin: 0, fontSize: 22 }}>📊 Analyse – Tilsynsdata</h1>
      </div>

      {/* Last download info */}
      {meta && (
        <div style={{
          background: "#f0f7ff",
          border: "1px solid #c4ddf7",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 14,
        }}>
          <strong>Siste nedlasting:</strong>{" "}
          {new Date(meta.lastDownload).toLocaleString("nb-NO")}{" "}
          · <strong>{meta.totalFeatures}</strong> tilsyn totalt
          {meta.downloadHistory.length > 1 && (
            <> · <strong>{meta.downloadHistory.length}</strong> nedlastinger i historikken</>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {(["oversikt", "nye", "tidslinje", "geografi"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: activeTab === tab ? "2px solid #4a90d9" : "1px solid #ddd",
              background: activeTab === tab ? "#eef4ff" : "white",
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {tab === "oversikt" && "📈 Oversikt"}
            {tab === "nye" && `🆕 Nye kontroller${diff ? ` (${diff.summary.newCount})` : ""}`}
            {tab === "tidslinje" && "📅 Tidslinje"}
            {tab === "geografi" && "🗺️ Geografi"}
          </button>
        ))}
      </div>

      {/* ---- OVERSIKT TAB ---- */}
      {activeTab === "oversikt" && (
        <div>
          {/* Summary cards – grouped as on map (smil/strek/sur) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "#f8f9fa", border: "1px solid #e9ecef", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{features.length}</div>
              <div style={{ fontSize: 13, color: "#666" }}>Totalt antall tilsyn</div>
            </div>
            {(["smil", "strek", "sur"] as const).map(g => (
              <div key={g} style={{
                background: `${smileGroupColor(g)}15`,
                border: `1px solid ${smileGroupColor(g)}40`,
                borderRadius: 8,
                padding: 16,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{groups[g]}</div>
                <div style={{ fontSize: 14, color: "#444" }}>{smileGroupLabel(g)}</div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                  {((groups[g] / features.length) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>

          {/* Detailed breakdown */}
          <div style={{
            background: "#f8f9fa",
            border: "1px solid #e9ecef",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
          }}>
            <strong style={{ fontSize: 13, color: "#555" }}>Detaljert fordeling (beregnet fra delkarakterer, som på kartet):</strong>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
              {[0, 1, 2, 3].map(k => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: scoreColor(k),
                  }} />
                  <span style={{ fontSize: 13 }}>
                    <strong>{dist[k]}</strong> {scoreLabel(k)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Score chart */}
          <div style={{ background: "white", border: "1px solid #e9ecef", borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <canvas
              ref={scoreChartRef}
              style={{ width: "100%", height: 280 }}
            />
          </div>

          {/* Download history chart */}
          {meta && meta.downloadHistory.length > 1 && (
            <div style={{ background: "white", border: "1px solid #e9ecef", borderRadius: 8, padding: 16 }}>
              <canvas
                ref={downloadChartRef}
                style={{ width: "100%", height: 250 }}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: 8, textAlign: "center" }}>
                Viser antall nye kontroller oppdaget ved hver CSV-nedlasting.
                Nyttig for å vurdere oppdateringsfrekvensen.
              </p>
            </div>
          )}

          {/* Diff summary */}
          {diff && (
            <div style={{ marginTop: 20, background: "#fffbf0", border: "1px solid #f0e0b0", borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: "0 0 8px" }}>🔄 Endringer siden forrige nedlasting</h3>
              {diff.previousDownload && (
                <p style={{ fontSize: 13, color: "#666", margin: "0 0 8px" }}>
                  Forrige nedlasting: {new Date(diff.previousDownload).toLocaleString("nb-NO")}
                </p>
              )}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14 }}>
                  🆕 <strong>{diff.summary.newCount}</strong> nye
                </span>
                <span style={{ fontSize: 14 }}>
                  ✏️ <strong>{diff.summary.changedCount}</strong> endret
                </span>
                <span style={{ fontSize: 14 }}>
                  🗑️ <strong>{diff.summary.removedCount}</strong> fjernet
                </span>
              </div>
              {diff.summary.newCount === 0 && diff.summary.changedCount === 0 && (
                <p style={{ fontSize: 13, color: "#888", margin: "8px 0 0" }}>
                  Ingen endringer oppdaget. CSV-filen har muligens ikke blitt oppdatert mellom nedlastingene.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- NYE KONTROLLER TAB ---- */}
      {activeTab === "nye" && (
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Nye kontroller siden forrige nedlasting</h2>
          {!diff ? (
            <p style={{ color: "#888" }}>
              Ingen endringsdata tilgjengelig ennå. Kjør <code>npm run build:data</code> to ganger for å generere endringsoversikt.
            </p>
          ) : diff.newInspections.length === 0 && diff.changedInspections.length === 0 ? (
            <p style={{ color: "#888" }}>
              Ingen nye eller endrede kontroller oppdaget mellom siste to nedlastinger.
            </p>
          ) : (
            <>
              {diff.newInspections.length > 0 && (
                <>
                  <h3 style={{ fontSize: 15, marginBottom: 8, color: "#2ecc71" }}>
                    🆕 Nye kontroller ({diff.newInspections.length})
                  </h3>
                  <div style={{ overflowX: "auto", marginBottom: 20 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Navn</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Adresse</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Dato</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Karakter</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.newInspections.map((item, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={{ padding: "8px 10px" }}>{item.navn}</td>
                            <td style={{ padding: "8px 10px", color: "#666" }}>{item.adresse}</td>
                            <td style={{ padding: "8px 10px" }}>{formatDato(item.dato)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              {(() => {
                                const score = computeSmileScore(item);
                                const group = smileGroupFromScore(score);
                                return (
                                  <span style={{
                                    background: group ? smileGroupColor(group) : "#999",
                                    color: "white",
                                    borderRadius: 4,
                                    padding: "2px 8px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}>
                                    {group ? smileGroupLabel(group) : "Ukjent"}
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {diff.changedInspections.length > 0 && (
                <>
                  <h3 style={{ fontSize: 15, marginBottom: 8, color: "#f39c12" }}>
                    ✏️ Endrede kontroller ({diff.changedInspections.length})
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Navn</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Adresse</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Dato</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: "2px solid #dee2e6" }}>Karakter</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.changedInspections.map((item, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={{ padding: "8px 10px" }}>{item.navn}</td>
                            <td style={{ padding: "8px 10px", color: "#666" }}>{item.adresse}</td>
                            <td style={{ padding: "8px 10px" }}>{formatDato(item.dato)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              {(() => {
                                const score = computeSmileScore(item);
                                const group = smileGroupFromScore(score);
                                return (
                                  <span style={{
                                    background: group ? smileGroupColor(group) : "#999",
                                    color: "white",
                                    borderRadius: 4,
                                    padding: "2px 8px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}>
                                    {group ? smileGroupLabel(group) : "Ukjent"}
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- TIDSLINJE TAB ---- */}
      {activeTab === "tidslinje" && (
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Kontroller over tid</h2>
          <div style={{ background: "white", border: "1px solid #e9ecef", borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <canvas
              ref={timelineChartRef}
              style={{ width: "100%", height: 300 }}
            />
          </div>
          <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
            Grafen viser antall registrerte kontroller per måned basert på tilsynsdatoen i datasettet.
            Bruk denne til å vurdere hvor ofte nye kontroller registreres, og om det er sesongmessige variasjoner.
            Dersom grafen viser hyppige oppdateringer er varslingstjenesten mer effektiv.
          </p>
        </div>
      )}

      {/* ---- GEOGRAFI TAB ---- */}
      {activeTab === "geografi" && (
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Geografisk fordeling</h2>
          <div style={{ background: "white", border: "1px solid #e9ecef", borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <canvas
              ref={regionChartRef}
              style={{ width: "100%", height: 350 }}
            />
          </div>
          {/* Top regions table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>#</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>Område</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Antall kontroller</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "2px solid #dee2e6" }}>Andel</th>
                </tr>
              </thead>
              <tbody>
                {regionData().map(([name, count], i) => (
                  <tr key={name} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px 10px", color: "#999" }}>{i + 1}</td>
                    <td style={{ padding: "8px 10px" }}>{name}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{count}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#666" }}>
                      {((count / features.length) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #eee", fontSize: 12, color: "#999" }}>
        Data:{" "}
        <a href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9" target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9" }}>
          Mattilsynet
        </a>
        {" ("}
        <a href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9" }}>
          NLOD
        </a>
        {") · "}
        <Link href="/varsling" style={{ color: "#4a90d9" }}>
          Varslingstjeneste
        </Link>
      </div>
    </main>
  );
}
