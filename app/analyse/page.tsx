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

const COLORS = {
  smil: "#10b981",
  smilLight: "#d1fae5",
  strek: "#f59e0b",
  strekLight: "#fef3c7",
  sur: "#ef4444",
  surLight: "#fee2e2",
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

const SCORE_COLORS: Record<number, string> = {
  0: "#10b981",
  1: "#34d399",
  2: "#f59e0b",
  3: "#ef4444",
};

const SCORE_LABELS: Record<number, string> = {
  0: "Ingen brudd",
  1: "Små brudd",
  2: "Strekmunn",
  3: "Sur munn",
};

const CATEGORY_LABELS: Record<number, string> = {
  1: "Rutiner & ledelse",
  2: "Lokaler & utstyr",
  3: "Mathåndtering",
  4: "Merking & sporbarhet",
};

// ---------------------------------------------------------------------------
// Canvas chart: Donut
// ---------------------------------------------------------------------------

function drawDonutChart(
  canvas: HTMLCanvasElement,
  segments: Array<{ label: string; value: number; color: string }>,
  centerLabel: string,
  centerValue: string
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

  const total = segments.reduce((a, b) => a + b.value, 0);
  if (total === 0) return;

  const cx = w / 2;
  const cy = h / 2;
  const outerR = Math.min(cx, cy) - 16;
  const innerR = outerR * 0.62;
  const gapAngle = 0.03;

  let startAngle = -Math.PI / 2;

  for (const seg of segments) {
    const sliceAngle = (seg.value / total) * Math.PI * 2;
    const drawAngle = Math.max(0, sliceAngle - gapAngle);

    // Gradient from segment color to lighter version
    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0, seg.color + "cc");
    grad.addColorStop(1, seg.color);

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle + gapAngle / 2, startAngle + drawAngle + gapAngle / 2);
    ctx.arc(cx, cy, innerR, startAngle + drawAngle + gapAngle / 2, startAngle + gapAngle / 2, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle shadow
    ctx.shadowColor = seg.color + "40";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    startAngle += sliceAngle;
  }

  // Center text
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold ${Math.round(outerR * 0.32)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(centerValue, cx, cy - 6);
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `${Math.round(outerR * 0.13)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(centerLabel, cx, cy + outerR * 0.2);
}

// ---------------------------------------------------------------------------
// Canvas chart: Smooth Area Chart
// ---------------------------------------------------------------------------

function drawAreaChart(
  canvas: HTMLCanvasElement,
  data: Array<{ label: string; value: number }>,
  color: string,
  title: string,
  showDots: boolean = true
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

  if (data.length === 0) return;

  // Title
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 14px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 16, 24);

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const chartLeft = 52;
  const chartRight = w - 20;
  const chartTop = 44;
  const chartBottom = h - 44;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  // Y-axis grid lines
  for (let i = 0; i <= 4; i++) {
    const y = chartTop + (chartH / 4) * i;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = COLORS.textFaint;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round(maxVal * (1 - i / 4))), chartLeft - 8, y);
  }

  const stepX = chartW / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => ({
    x: chartLeft + i * stepX,
    y: chartTop + chartH * (1 - d.value / maxVal),
  }));

  // Smooth bezier path
  function buildSmoothPath(pts: typeof points) {
    ctx!.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) return;
    if (pts.length === 2) {
      ctx!.lineTo(pts[1].x, pts[1].y);
      return;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const cpx = (pts[i].x + pts[i + 1].x) / 2;
      ctx!.bezierCurveTo(cpx, pts[i].y, cpx, pts[i + 1].y, pts[i + 1].x, pts[i + 1].y);
    }
  }

  // Area fill with gradient
  const grad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
  grad.addColorStop(0, color + "30");
  grad.addColorStop(1, color + "05");
  ctx.beginPath();
  ctx.moveTo(points[0].x, chartBottom);
  buildSmoothPath(points);
  ctx.lineTo(points[points.length - 1].x, chartBottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  buildSmoothPath(points);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Dots
  if (showDots && points.length <= 30) {
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // X labels
  const maxLabels = 8;
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < data.length; i += labelStep) {
    ctx.fillText(data[i].label, points[i].x, chartBottom + 8);
  }
  if (data.length > 1 && (data.length - 1) % labelStep !== 0) {
    ctx.fillText(data[data.length - 1].label, points[points.length - 1].x, chartBottom + 8);
  }
}

// ---------------------------------------------------------------------------
// Canvas chart: Horizontal Bar (for geographic hot zones)
// ---------------------------------------------------------------------------

function drawHorizontalBarChart(
  canvas: HTMLCanvasElement,
  data: Array<{ label: string; value: number; riskPct: number }>,
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

  if (data.length === 0) return;

  // Title
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 14px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 16, 24);

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const chartLeft = 140;
  const chartRight = w - 60;
  const chartTop = 40;
  const barHeight = 28;
  const barGap = 6;
  const chartW = chartRight - chartLeft;

  for (let i = 0; i < data.length; i++) {
    const y = chartTop + i * (barHeight + barGap);
    const barW = Math.max(4, (data[i].value / maxVal) * chartW);

    // Label
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(
      data[i].label.length > 16 ? data[i].label.slice(0, 15) + "…" : data[i].label,
      chartLeft - 10,
      y + barHeight / 2
    );

    // Bar with risk-based gradient
    const riskPct = data[i].riskPct;
    const grad = ctx.createLinearGradient(chartLeft, 0, chartLeft + barW, 0);
    if (riskPct > 15) {
      grad.addColorStop(0, COLORS.sur + "cc");
      grad.addColorStop(1, COLORS.sur);
    } else if (riskPct > 8) {
      grad.addColorStop(0, COLORS.strek + "cc");
      grad.addColorStop(1, COLORS.strek);
    } else {
      grad.addColorStop(0, COLORS.smil + "cc");
      grad.addColorStop(1, COLORS.smil);
    }

    ctx.beginPath();
    ctx.roundRect(chartLeft, y, barW, barHeight, 6);
    ctx.fillStyle = grad;
    ctx.fill();

    // Value
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${data[i].value}`, chartLeft + barW + 8, y + barHeight / 2);
  }
}

// ---------------------------------------------------------------------------
// Canvas chart: Stacked area (timeline by score)
// ---------------------------------------------------------------------------

function drawStackedAreaChart(
  canvas: HTMLCanvasElement,
  months: string[],
  series: Array<{ label: string; color: string; values: number[] }>,
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

  if (months.length === 0) return;

  // Title
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 14px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 16, 24);

  const chartLeft = 52;
  const chartRight = w - 20;
  const chartTop = 44;
  const chartBottom = h - 44;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  // Compute stacked totals
  const stackedTotals = months.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const maxVal = Math.max(...stackedTotals, 1);

  const stepX = chartW / Math.max(months.length - 1, 1);

  // Y-axis grid
  for (let i = 0; i <= 4; i++) {
    const y = chartTop + (chartH / 4) * i;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = COLORS.textFaint;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round(maxVal * (1 - i / 4))), chartLeft - 8, y);
  }

  // Draw areas bottom-to-top
  const reversedSeries = [...series].reverse();
  for (let s = 0; s < reversedSeries.length; s++) {
    const ser = reversedSeries[s];
    // Compute cumulative values (sum of this series + all below)
    const seriesIndex = series.indexOf(ser);
    const cumulativeTop = months.map((_, i) => {
      let sum = 0;
      for (let j = 0; j <= seriesIndex; j++) sum += series[j].values[i];
      return sum;
    });
    const cumulativeBottom = months.map((_, i) => {
      let sum = 0;
      for (let j = 0; j < seriesIndex; j++) sum += series[j].values[i];
      return sum;
    });

    const topPoints = cumulativeTop.map((v, i) => ({
      x: chartLeft + i * stepX,
      y: chartTop + chartH * (1 - v / maxVal),
    }));
    const bottomPoints = cumulativeBottom.map((v, i) => ({
      x: chartLeft + i * stepX,
      y: chartTop + chartH * (1 - v / maxVal),
    }));

    // Area
    const grad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
    grad.addColorStop(0, ser.color + "60");
    grad.addColorStop(1, ser.color + "15");

    ctx.beginPath();
    ctx.moveTo(topPoints[0].x, topPoints[0].y);
    for (let i = 1; i < topPoints.length; i++) {
      const cpx = (topPoints[i - 1].x + topPoints[i].x) / 2;
      ctx.bezierCurveTo(cpx, topPoints[i - 1].y, cpx, topPoints[i].y, topPoints[i].x, topPoints[i].y);
    }
    for (let i = bottomPoints.length - 1; i >= 0; i--) {
      if (i === bottomPoints.length - 1) {
        ctx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
      } else {
        const cpx = (bottomPoints[i + 1].x + bottomPoints[i].x) / 2;
        ctx.bezierCurveTo(cpx, bottomPoints[i + 1].y, cpx, bottomPoints[i].y, bottomPoints[i].x, bottomPoints[i].y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Top line
    ctx.beginPath();
    ctx.moveTo(topPoints[0].x, topPoints[0].y);
    for (let i = 1; i < topPoints.length; i++) {
      const cpx = (topPoints[i - 1].x + topPoints[i].x) / 2;
      ctx.bezierCurveTo(cpx, topPoints[i - 1].y, cpx, topPoints[i].y, topPoints[i].x, topPoints[i].y);
    }
    ctx.strokeStyle = ser.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // X labels
  const maxLabels = 8;
  const labelStep = Math.max(1, Math.ceil(months.length / maxLabels));
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < months.length; i += labelStep) {
    ctx.fillText(months[i], chartLeft + i * stepX, chartBottom + 8);
  }
  if (months.length > 1 && (months.length - 1) % labelStep !== 0) {
    ctx.fillText(months[months.length - 1], chartLeft + (months.length - 1) * stepX, chartBottom + 8);
  }
}

// ---------------------------------------------------------------------------
// Canvas chart: Category radar-like horizontal bars
// ---------------------------------------------------------------------------

function drawCategoryChart(
  canvas: HTMLCanvasElement,
  categories: Array<{ label: string; avgScore: number; failPct: number; count: number }>,
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
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 14px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 16, 24);

  const chartLeft = 150;
  const chartRight = w - 80;
  const chartTop = 50;
  const barHeight = 36;
  const barGap = 14;
  const chartW = chartRight - chartLeft;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const y = chartTop + i * (barHeight + barGap);

    // Label
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(cat.label, chartLeft - 12, y + barHeight / 2);

    // Background bar
    ctx.beginPath();
    ctx.roundRect(chartLeft, y, chartW, barHeight, 8);
    ctx.fillStyle = COLORS.border + "60";
    ctx.fill();

    // Fail percentage bar
    const failW = Math.max(4, (cat.failPct / 100) * chartW);
    const grad = ctx.createLinearGradient(chartLeft, 0, chartLeft + failW, 0);
    if (cat.failPct > 20) {
      grad.addColorStop(0, COLORS.sur);
      grad.addColorStop(1, "#f87171");
    } else if (cat.failPct > 10) {
      grad.addColorStop(0, COLORS.strek);
      grad.addColorStop(1, "#fbbf24");
    } else {
      grad.addColorStop(0, "#6ee7b7");
      grad.addColorStop(1, COLORS.smil);
    }

    ctx.beginPath();
    ctx.roundRect(chartLeft, y, failW, barHeight, 8);
    ctx.fillStyle = grad;
    ctx.fill();

    // Percentage label on bar
    ctx.fillStyle = cat.failPct > 8 ? "#fff" : COLORS.text;
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (failW > 40) {
      ctx.fillText(`${cat.failPct.toFixed(1)}%`, chartLeft + 10, y + barHeight / 2);
    }

    // Count on right
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${cat.failPct.toFixed(1)}%`, chartRight + 8, y + barHeight / 2);
  }

  // Footer note
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  const footerY = chartTop + categories.length * (barHeight + barGap) + 8;
  ctx.fillText("Andel kontroller med brudd (karakter 2-3) per kravpunktkategori", 16, footerY);
}

// ---------------------------------------------------------------------------
// Mini sparkline (for KPI cards)
// ---------------------------------------------------------------------------

function drawSparkline(
  canvas: HTMLCanvasElement,
  values: number[],
  color: string
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

  if (values.length < 2) return;

  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;
  const padY = 4;
  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: padY + (1 - (v - minVal) / range) * (h - padY * 2),
  }));

  // Area
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + "30");
  grad.addColorStop(1, color + "05");
  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      ctx.lineTo(points[i].x, points[i].y);
    } else {
      const cpx = (points[i - 1].x + points[i].x) / 2;
      ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
    }
  }
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const cpx = (points[i - 1].x + points[i].x) / 2;
    ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
  sparkData,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: string;
  sparkData?: number[];
}) {
  const sparkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (sparkRef.current && sparkData && sparkData.length >= 2) {
      drawSparkline(sparkRef.current, sparkData, color);
    }
  }, [sparkData, color]);

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
      {/* Gradient accent bar */}
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
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 6, fontWeight: 500 }}>{icon} {title}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: COLORS.text, lineHeight: 1.1 }}>{value}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4 }}>{subtitle}</div>
          )}
        </div>
        {sparkData && sparkData.length >= 2 && (
          <canvas
            ref={sparkRef}
            style={{ width: 80, height: 36, opacity: 0.9, flexShrink: 0 }}
          />
        )}
      </div>
    </div>
  );
}

function SectionCard({
  children,
  title,
  subtitle,
  noPad,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  noPad?: boolean;
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
      <div style={{ padding: noPad ? 0 : "12px 20px 20px" }}>{children}</div>
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
// Interactive Heatmap Component
// ---------------------------------------------------------------------------

type RecentGeoJSON = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { navn: string; adresse: string; dato: string; score: number };
  }>;
};

function RecentHeatmap({ geojson }: { geojson: RecentGeoJSON }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null); // null = all days, 0-6 = specific day

  // Build the 7-day timeline labels
  const days = useMemo(() => {
    const now = new Date();
    const result: Array<{ index: number; date: Date; label: string; shortLabel: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStr = `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
      const count = geojson.features.filter(f => f.properties.dato === dayStr).length;
      const isToday = i === 0;
      const isYesterday = i === 1;
      result.push({
        index: 6 - i,
        date: d,
        label: isToday ? "I dag" : isYesterday ? "I går" : d.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric" }),
        shortLabel: isToday ? "I dag" : d.toLocaleDateString("nb-NO", { weekday: "short" }),
        count,
      });
    }
    return result;
  }, [geojson]);

  // Filter geojson by selected day
  const filteredGeoJSON = useMemo(() => {
    if (selectedDay === null) return geojson;
    const day = days[selectedDay];
    if (!day) return geojson;
    const d = day.date;
    const dayStr = `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
    return {
      ...geojson,
      features: geojson.features.filter(f => f.properties.dato === dayStr),
    };
  }, [geojson, selectedDay, days]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "&copy; OpenStreetMap",
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm",
            paint: { "raster-saturation": -0.3, "raster-brightness-max": 0.92 },
          },
        ],
      },
      center: [10.75, 63.43],
      zoom: 4,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // Add clustered source
      map.addSource("recent-inspections", {
        type: "geojson",
        data: filteredGeoJSON as GeoJSON.GeoJSON,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 60,
      });

      // Heatmap layer (visible at low zooms)
      map.addLayer({
        id: "inspections-heat",
        type: "heatmap",
        source: "recent-inspections",
        maxzoom: 12,
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 10, 2],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(239,68,68,0)",
            0.1, "rgba(251,146,60,0.3)",
            0.3, "rgba(249,115,22,0.5)",
            0.5, "rgba(239,68,68,0.6)",
            0.7, "rgba(220,38,38,0.75)",
            1, "rgba(185,28,28,0.9)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 20, 10, 30],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.9, 12, 0],
        },
      });

      // Cluster circles
      map.addLayer({
        id: "cluster-circles",
        type: "circle",
        source: "recent-inspections",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step", ["get", "point_count"],
            "#f97316", 5,
            "#ef4444", 15,
            "#dc2626", 30,
            "#991b1b",
          ],
          "circle-radius": [
            "step", ["get", "point_count"],
            16, 5,
            22, 15,
            28, 30,
            36,
          ],
          "circle-opacity": 0.85,
          "circle-stroke-width": 3,
          "circle-stroke-color": "rgba(255,255,255,0.5)",
        },
      });

      // Cluster count labels
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "recent-inspections",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      // Individual points (unclustered) — pulsing effect via CSS animation
      map.addLayer({
        id: "unclustered-point-glow",
        type: "circle",
        source: "recent-inspections",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match", ["get", "score"],
            0, COLORS.smil,
            1, COLORS.smil,
            2, COLORS.strek,
            3, COLORS.sur,
            "#ef4444",
          ],
          "circle-radius": 18,
          "circle-opacity": 0.15,
          "circle-stroke-width": 0,
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "recent-inspections",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match", ["get", "score"],
            0, COLORS.smil,
            1, COLORS.smil,
            2, COLORS.strek,
            3, COLORS.sur,
            "#ef4444",
          ],
          "circle-radius": 7,
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      // Click cluster → zoom in
      map.on("click", "cluster-circles", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["cluster-circles"] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource("recent-inspections") as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then(zoom => {
          const geom = features[0].geometry;
          if (geom.type === "Point") {
            map.easeTo({ center: geom.coordinates as [number, number], zoom });
          }
        });
      });

      // Click individual point → popup (shows ALL restaurants at that location)
      map.on("click", "unclustered-point", (e) => {
        const allAtPoint = map.queryRenderedFeatures(e.point, { layers: ["unclustered-point"] });
        if (!allAtPoint.length) return;
        const anchor = allAtPoint[0];
        if (anchor.geometry.type !== "Point") return;

        const entries = allAtPoint.map(f => {
          const p = f.properties;
          const score = p?.score ?? -1;
          const emoji = score <= 1 ? "😊" : score === 2 ? "😐" : score === 3 ? "😠" : "❓";
          const scoreLabel = score === 0 ? "Ingen brudd" : score === 1 ? "Små brudd" : score === 2 ? "Strekmunn" : score === 3 ? "Sur munn" : "Ukjent";
          const d = (p?.dato ?? "").trim();
          const formattedDate = d.length === 8 ? `${d.slice(0,2)}.${d.slice(2,4)}.${d.slice(4,8)}` : d;
          return `<div style="padding:4px 0;${allAtPoint.length > 1 ? "border-bottom:1px solid #e2e8f0;" : ""}">
            <strong>${p?.navn ?? ""}</strong><br/>
            <span style="color:#64748b;font-size:11px">${p?.adresse ?? ""}</span><br/>
            <span style="font-size:12px">${emoji} ${scoreLabel} · ${formattedDate}</span>
          </div>`;
        });

        const header = allAtPoint.length > 1
          ? `<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;font-weight:600">${allAtPoint.length} kontroller på denne adressen</div>`
          : "";

        new maplibregl.Popup({ offset: 12, closeButton: allAtPoint.length > 1, maxWidth: "280px" })
          .setLngLat(anchor.geometry.coordinates as [number, number])
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;max-height:240px;overflow-y:auto">
              ${header}${entries.join("")}
            </div>
          `)
          .addTo(map);
      });

      // Cursor
      map.on("mouseenter", "cluster-circles", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "cluster-circles", () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "unclustered-point", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "unclustered-point", () => { map.getCanvas().style.cursor = ""; });

      // Fit bounds to data
      if (filteredGeoJSON.features.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const f of filteredGeoJSON.features) {
          bounds.extend(f.geometry.coordinates as [number, number]);
        }
        map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data when filtered geojson changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("recent-inspections") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(filteredGeoJSON as GeoJSON.GeoJSON);
    }
  }, [filteredGeoJSON]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 420,
          borderRadius: 12,
          overflow: "hidden",
        }}
      />
      {/* Pulsing animation overlay via CSS */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
      {/* Legend overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 11,
          color: COLORS.text,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 2 }}>Kontrollaktivitet</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.smil, display: "inline-block" }} />
          Smil (0–1)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.strek, display: "inline-block" }} />
          Strekmunn (2)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.sur, display: "inline-block" }} />
          Sur munn (3)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, color: COLORS.textFaint }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "linear-gradient(135deg, #f97316, #dc2626)", display: "inline-block" }} />
          Klynge = flere kontroller
        </div>
        {geojson.features.length > 0 && (
          <div style={{ color: COLORS.textMuted, marginTop: 2 }}>
            {filteredGeoJSON.features.length} kontroll{filteredGeoJSON.features.length !== 1 ? "er" : ""}{selectedDay !== null ? " denne dagen" : " siste 7 dager"}
          </div>
        )}
      </div>

      {/* Timeline scrubber — bottom right */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          borderRadius: 12,
          padding: "10px 12px 8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 260,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 11, color: COLORS.text }}>Tidslinje</span>
          <button
            onClick={() => setSelectedDay(null)}
            style={{
              fontSize: 10,
              color: selectedDay === null ? COLORS.textFaint : COLORS.primary,
              background: "none",
              border: "none",
              cursor: selectedDay === null ? "default" : "pointer",
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 500,
            }}
          >
            {selectedDay === null ? "Alle dager" : "Vis alle"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
          {days.map((day) => {
            const isActive = selectedDay === day.index;
            const maxCount = Math.max(...days.map(d => d.count), 1);
            const barH = Math.max(4, (day.count / maxCount) * 32);
            return (
              <button
                key={day.index}
                onClick={() => setSelectedDay(isActive ? null : day.index)}
                title={`${day.label}: ${day.count} kontroller`}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {/* Mini bar */}
                <div
                  style={{
                    width: "100%",
                    height: barH,
                    borderRadius: 3,
                    background: isActive
                      ? `linear-gradient(180deg, ${COLORS.sur}, ${COLORS.strek})`
                      : day.count > 0 ? COLORS.border : COLORS.border + "60",
                    transition: "all 0.2s ease",
                    opacity: selectedDay !== null && !isActive ? 0.35 : 1,
                  }}
                />
                {/* Count */}
                <span style={{
                  fontSize: 9,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? COLORS.text : COLORS.textFaint,
                  lineHeight: 1,
                }}>
                  {day.count}
                </span>
                {/* Day label */}
                <span style={{
                  fontSize: 9,
                  color: isActive ? COLORS.text : COLORS.textFaint,
                  fontWeight: isActive ? 600 : 400,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}>
                  {day.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AnalysePage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>("all");

  const donutRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLCanvasElement>(null);
  const categoryRef = useRef<HTMLCanvasElement>(null);
  const stackedRef = useRef<HTMLCanvasElement>(null);
  const downloadRef = useRef<HTMLCanvasElement>(null);

  // Load data
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

  // ---------------------------------------------------------------------------
  // Computed data
  // ---------------------------------------------------------------------------

  const scoreDist = useMemo(() => {
    const dist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const f of features) {
      const k = computeSmileScore(f.properties);
      if (k >= 0 && k <= 3) dist[k]++;
    }
    return dist;
  }, [features]);

  const groupedDist = useMemo(() => {
    const groups: Record<SmileGroup, number> = { smil: 0, strek: 0, sur: 0 };
    for (const f of features) {
      const g = smileGroupFromScore(computeSmileScore(f.properties));
      if (g) groups[g]++;
    }
    return groups;
  }, [features]);

  const passRate = useMemo(() => {
    const total = groupedDist.smil + groupedDist.strek + groupedDist.sur;
    return total > 0 ? ((groupedDist.smil / total) * 100) : 0;
  }, [groupedDist]);

  const failRate = useMemo(() => {
    const total = groupedDist.smil + groupedDist.strek + groupedDist.sur;
    return total > 0 ? (((groupedDist.strek + groupedDist.sur) / total) * 100) : 0;
  }, [groupedDist]);

  // Monthly data
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    for (const f of features) {
      const date = parseDatoToDate(f.properties.dato);
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months[key] = (months[key] || 0) + 1;
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, value: count }));
  }, [features]);

  // Monthly data by score group (for stacked chart)
  const monthlyByGroup = useMemo(() => {
    const months: Record<string, Record<SmileGroup, number>> = {};
    for (const f of features) {
      const date = parseDatoToDate(f.properties.dato);
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!months[key]) months[key] = { smil: 0, strek: 0, sur: 0 };
      const g = smileGroupFromScore(computeSmileScore(f.properties));
      if (g) months[key][g]++;
    }
    const sorted = Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
    return {
      months: sorted.map(([k]) => k),
      smil: sorted.map(([, v]) => v.smil),
      strek: sorted.map(([, v]) => v.strek),
      sur: sorted.map(([, v]) => v.sur),
    };
  }, [features]);

  // Recent inspections (last 7 days) as GeoJSON for the heatmap
  const recentGeoJSON = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentFeatures = features.filter(f => {
      const date = parseDatoToDate(f.properties.dato);
      return date && date >= cutoff;
    });
    return {
      type: "FeatureCollection" as const,
      features: recentFeatures.map(f => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          navn: f.properties.navn,
          adresse: f.properties.adresse,
          dato: f.properties.dato,
          score: computeSmileScore(f.properties),
        },
      })),
    };
  }, [features]);

  // Riskiest areas (sorted by failure rate, min 5 inspections)
  const recentHotspots = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const regions: Record<string, { postcode: string; total: number; latestDate: Date | null }> = {};
    for (const f of features) {
      const date = parseDatoToDate(f.properties.dato);
      if (!date || date < cutoff) continue;
      const addr = f.properties.adresse;
      const parts = addr.split(",").map(s => s.trim());
      // Format: "street, postcode, city"
      const postcode = parts.length >= 3 ? parts[1] : "";
      const city = parts.length >= 3 ? parts[2] : parts.length >= 2 ? parts[1] : "Ukjent";
      const key = postcode ? `${postcode} ${city}` : city;
      if (!regions[key]) regions[key] = { postcode, total: 0, latestDate: null };
      regions[key].total++;
      if (!regions[key].latestDate || date > regions[key].latestDate) {
        regions[key].latestDate = date;
      }
    }
    return Object.entries(regions)
      .map(([name, v]) => ({
        name,
        postcode: v.postcode,
        total: v.total,
        latestDate: v.latestDate,
        daysAgo: v.latestDate ? Math.round((now.getTime() - v.latestDate.getTime()) / (1000 * 60 * 60 * 24)) : 999,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [features]);

  // Category analysis (karakter1-4 breakdown)
  const categoryAnalysis = useMemo(() => {
    const cats = [1, 2, 3, 4].map(k => {
      let total = 0;
      let fails = 0;
      let sum = 0;
      for (const f of features) {
        const val = f.properties[`karakter${k}` as keyof TilsynProperties] as number;
        if (typeof val === "number" && Number.isFinite(val) && val >= 0 && val <= 3) {
          total++;
          sum += val;
          if (val >= 2) fails++;
        }
      }
      return {
        label: CATEGORY_LABELS[k] || `Kategori ${k}`,
        avgScore: total > 0 ? sum / total : 0,
        failPct: total > 0 ? (fails / total) * 100 : 0,
        count: total,
      };
    });
    return cats;
  }, [features]);

  // Worst performers
  const worstPerformers = useMemo(() => {
    return [...features]
      .filter(f => computeSmileScore(f.properties) === 3)
      .sort((a, b) => {
        const da = parseDatoToDate(a.properties.dato);
        const db = parseDatoToDate(b.properties.dato);
        if (da && db) return db.getTime() - da.getTime();
        return 0;
      })
      .slice(0, 15);
  }, [features]);

  // Repeat offenders (places with multiple inspections, find ones that improved or got worse)
  const repeatAnalysis = useMemo(() => {
    const byName: Record<string, Feature[]> = {};
    for (const f of features) {
      const key = f.properties.navn.toLowerCase();
      if (!byName[key]) byName[key] = [];
      byName[key].push(f);
    }

    const repeats: Array<{
      name: string;
      inspections: number;
      latestScore: number;
      previousScore: number;
      trend: "improved" | "worsened" | "same";
      latestDate: string;
    }> = [];

    for (const [, group] of Object.entries(byName)) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => {
        const da = parseDatoToDate(a.properties.dato);
        const db = parseDatoToDate(b.properties.dato);
        if (da && db) return da.getTime() - db.getTime();
        return 0;
      });
      const latest = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      const latestScore = computeSmileScore(latest.properties);
      const previousScore = computeSmileScore(prev.properties);
      let trend: "improved" | "worsened" | "same" = "same";
      if (latestScore < previousScore) trend = "improved";
      if (latestScore > previousScore) trend = "worsened";

      repeats.push({
        name: latest.properties.navn,
        inspections: group.length,
        latestScore,
        previousScore,
        trend,
        latestDate: latest.properties.dato,
      });
    }

    return repeats
      .sort((a, b) => {
        if (a.trend === "worsened" && b.trend !== "worsened") return -1;
        if (b.trend === "worsened" && a.trend !== "worsened") return 1;
        return b.inspections - a.inspections;
      })
      .slice(0, 20);
  }, [features]);

  // Sparkline data for download history
  const downloadSparkData = useMemo(() => {
    if (!meta?.downloadHistory) return [];
    return meta.downloadHistory.map(h => h.newCount);
  }, [meta]);

  // Monthly sparkline for KPI
  const monthlySparkData = useMemo(() => {
    return monthlyData.slice(-12).map(d => d.value);
  }, [monthlyData]);

  // ---------------------------------------------------------------------------
  // Draw charts on mount / data change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (loading || features.length === 0) return;

    // Donut chart
    if (donutRef.current) {
      drawDonutChart(
        donutRef.current,
        [
          { label: "Smil", value: groupedDist.smil, color: COLORS.smil },
          { label: "Strekmunn", value: groupedDist.strek, color: COLORS.strek },
          { label: "Sur munn", value: groupedDist.sur, color: COLORS.sur },
        ],
        "kontroller totalt",
        String(features.length)
      );
    }

    // Timeline
    if (timelineRef.current) {
      drawAreaChart(
        timelineRef.current,
        monthlyData,
        COLORS.primary,
        "Kontroller per måned",
        monthlyData.length <= 24
      );
    }

    // Category analysis
    if (categoryRef.current) {
      drawCategoryChart(
        categoryRef.current,
        categoryAnalysis,
        "Bruddrate per kravpunktkategori"
      );
    }

    // Stacked area chart
    if (stackedRef.current) {
      drawStackedAreaChart(
        stackedRef.current,
        monthlyByGroup.months,
        [
          { label: "Sur", color: COLORS.sur, values: monthlyByGroup.sur },
          { label: "Strekmunn", color: COLORS.strek, values: monthlyByGroup.strek },
          { label: "Smil", color: COLORS.smil, values: monthlyByGroup.smil },
        ],
        "Resultatfordeling over tid"
      );
    }

    // Download history
    if (downloadRef.current && meta?.downloadHistory && meta.downloadHistory.length > 1) {
      const histData = meta.downloadHistory.map(h => ({
        label: new Date(h.downloadedAt).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" }),
        value: h.newCount,
      }));
      drawAreaChart(downloadRef.current, histData, COLORS.accent, "Nye kontroller per nedlasting", true);
    }
  }, [loading, features, groupedDist, monthlyData, categoryAnalysis, monthlyByGroup, meta]);

  // Resize handler
  useEffect(() => {
    if (loading) return;
    const handler = () => {
      // Re-trigger chart drawing
      const event = new Event("resize-charts");
      window.dispatchEvent(event);
    };
    const resizeObserver = new ResizeObserver(handler);
    const refs = [donutRef, timelineRef, categoryRef, stackedRef, downloadRef];
    for (const ref of refs) {
      if (ref.current) resizeObserver.observe(ref.current);
    }
    return () => resizeObserver.disconnect();
  }, [loading]);

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
          <p style={{ color: COLORS.textMuted, fontSize: 15 }}>Laster analysedata…</p>
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
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
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
                Analyse
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textFaint }}>
                Smilefjeskartet · Hygienekontroller
              </p>
            </div>
          </div>

          {meta && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.textMuted }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: COLORS.smil,
                display: "inline-block",
              }} />
              Oppdatert {new Date(meta.lastDownload).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* ============================================================== */}
        {/* KPI CARDS ROW                                                  */}
        {/* ============================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <KpiCard
            icon="📋"
            title="Totalt kontroller"
            value={features.length.toLocaleString("nb-NO")}
            subtitle={meta ? `Fra ${meta.downloadHistory.length} nedlastinger` : undefined}
            color={COLORS.primary}
            sparkData={monthlySparkData}
          />
          <KpiCard
            icon="😊"
            title="Godkjenningsrate"
            value={`${passRate.toFixed(1)}%`}
            subtitle={`${groupedDist.smil.toLocaleString("nb-NO")} bestått`}
            color={COLORS.smil}
          />
          <KpiCard
            icon="⚠️"
            title="Bruddrate"
            value={`${failRate.toFixed(1)}%`}
            subtitle={`${(groupedDist.strek + groupedDist.sur).toLocaleString("nb-NO")} med brudd`}
            color={failRate > 15 ? COLORS.sur : COLORS.strek}
          />
          <KpiCard
            icon="😠"
            title="Sur munn"
            value={groupedDist.sur}
            subtitle={`${((groupedDist.sur / features.length) * 100).toFixed(1)}% av alle`}
            color={COLORS.sur}
            sparkData={downloadSparkData.length >= 2 ? downloadSparkData : undefined}
          />
        </div>

        {/* ============================================================== */}
        {/* ROW: Donut + Timeline                                          */}
        {/* ============================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1fr) minmax(400px, 2fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Donut */}
          <SectionCard>
            <canvas
              ref={donutRef}
              style={{ width: "100%", height: 280 }}
            />
            {/* Legend below donut */}
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
              {([
                { label: "Smil 😊", color: COLORS.smil, count: groupedDist.smil },
                { label: "Strekmunn 😐", color: COLORS.strek, count: groupedDist.strek },
                { label: "Sur munn 😠", color: COLORS.sur, count: groupedDist.sur },
              ]).map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, display: "inline-block" }} />
                  <span style={{ color: COLORS.textMuted }}>{item.label}</span>
                  <span style={{ fontWeight: 600 }}>{item.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Timeline */}
          <SectionCard>
            <canvas
              ref={timelineRef}
              style={{ width: "100%", height: 320 }}
            />
          </SectionCard>
        </div>

        {/* ============================================================== */}
        {/* ROW: Stacked Area + Category Breakdown                         */}
        {/* ============================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(400px, 3fr) minmax(320px, 2fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Stacked area */}
          <SectionCard>
            <canvas
              ref={stackedRef}
              style={{ width: "100%", height: 300 }}
            />
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
              {[
                { label: "Smil", color: COLORS.smil },
                { label: "Strekmunn", color: COLORS.strek },
                { label: "Sur munn", color: COLORS.sur },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, display: "inline-block" }} />
                  <span style={{ color: COLORS.textMuted }}>{item.label}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Category analysis */}
          <SectionCard>
            <canvas
              ref={categoryRef}
              style={{ width: "100%", height: 300 }}
            />
          </SectionCard>
        </div>

        {/* ============================================================== */}
        {/* FULL WIDTH: Interactive Heatmap                                */}
        {/* ============================================================== */}
        <div style={{ marginBottom: 16 }}>
          <SectionCard title="🗺️ Kontrollaktivitet siste 7 dager" subtitle="Klynger og varmekart viser hvor kontroller gjennomføres nå. Zoom inn for detaljer.">
            <RecentHeatmap geojson={recentGeoJSON} />
          </SectionCard>
        </div>

        {/* ============================================================== */}
        {/* ROW: Active Areas + Worst Performers + Repeat Offenders        */}
        {/* ============================================================== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Recent hotspots table */}
          <SectionCard title="📍 Aktive kontrollområder" subtitle="Steder med flest kontroller siste 7 dager">
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: COLORS.card }}>
                  <tr>
                    <th style={{ padding: "8px 8px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Område</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Kontroller</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Sist aktiv</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHotspots.map((area, i) => (
                    <tr key={area.name} style={{ borderBottom: i < recentHotspots.length - 1 ? `1px solid ${COLORS.border}30` : "none" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 500 }}>{area.name}</td>
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>
                        <Badge color={area.total >= 10 ? COLORS.primary : area.total >= 5 ? COLORS.accent : COLORS.textMuted}>
                          {area.total}
                        </Badge>
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "center", color: COLORS.textMuted, fontSize: 11 }}>
                        {area.daysAgo === 0 ? "I dag" : area.daysAgo === 1 ? "I går" : `${area.daysAgo} dager siden`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Worst performers */}
          <SectionCard title="😠 Siste kontroller med sur munn" subtitle="De nyeste tilsynene som fikk dårligst resultat">
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: COLORS.card }}>
                  <tr>
                    <th style={{ padding: "8px 8px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Navn</th>
                    <th style={{ padding: "8px 8px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Dato</th>
                    <th style={{ padding: "8px 8px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Sted</th>
                  </tr>
                </thead>
                <tbody>
                  {worstPerformers.map((f, i) => {
                    const addr = f.properties.adresse;
                    const parts = addr.split(",").map(s => s.trim());
                    const location = parts.length >= 2 ? parts[parts.length - 1] : addr;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}20` }}>
                        <td style={{ padding: "6px 8px", fontWeight: 500 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: COLORS.sur, fontSize: 14 }}>😠</span>
                            <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.properties.navn}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "6px 8px", color: COLORS.textMuted, whiteSpace: "nowrap" }}>{formatDato(f.properties.dato)}</td>
                        <td style={{ padding: "6px 8px", color: COLORS.textFaint }}>{location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Repeat offenders / trends */}
          <SectionCard title="🔄 Gjenbesøk-analyse" subtitle="Steder med flere kontroller – trend mellom siste to">
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: COLORS.card }}>
                  <tr>
                    <th style={{ padding: "8px 8px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Navn</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>#</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {repeatAnalysis.map((item, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}20` }}>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {item.name}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", color: COLORS.textMuted }}>{item.inspections}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        {item.trend === "worsened" && (
                          <Badge color={COLORS.sur}>↗ Forverret</Badge>
                        )}
                        {item.trend === "improved" && (
                          <Badge color={COLORS.smil}>↘ Forbedret</Badge>
                        )}
                        {item.trend === "same" && (
                          <Badge color={COLORS.textFaint}>→ Uendret</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* ============================================================== */}
        {/* Diff / Recent Changes                                          */}
        {/* ============================================================== */}
        {diff && (diff.newInspections.length > 0 || diff.changedInspections.length > 0) && (
          <SectionCard
            title="🆕 Nylige endringer"
            subtitle={`${diff.summary.newCount} nye, ${diff.summary.changedCount} endret, ${diff.summary.removedCount} fjernet siden forrige nedlasting`}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <button
                onClick={() => setActiveSection("all")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: `1px solid ${activeSection === "all" ? COLORS.primary : COLORS.border}`,
                  background: activeSection === "all" ? COLORS.primaryLight : "transparent",
                  color: activeSection === "all" ? COLORS.primary : COLORS.textMuted,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Alle ({diff.newInspections.length + diff.changedInspections.length})
              </button>
              <button
                onClick={() => setActiveSection("new")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: `1px solid ${activeSection === "new" ? COLORS.smil : COLORS.border}`,
                  background: activeSection === "new" ? COLORS.smilLight : "transparent",
                  color: activeSection === "new" ? COLORS.smil : COLORS.textMuted,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Nye ({diff.newInspections.length})
              </button>
              <button
                onClick={() => setActiveSection("changed")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: `1px solid ${activeSection === "changed" ? COLORS.strek : COLORS.border}`,
                  background: activeSection === "changed" ? COLORS.strekLight : "transparent",
                  color: activeSection === "changed" ? COLORS.strek : COLORS.textMuted,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Endret ({diff.changedInspections.length})
              </button>
            </div>

            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: COLORS.card }}>
                  <tr>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Type</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Navn</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Adresse</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Dato</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontWeight: 500, fontSize: 11 }}>Resultat</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...(activeSection !== "changed" ? diff.newInspections.map(item => ({ ...item, _type: "ny" as const })) : []),
                    ...(activeSection !== "new" ? diff.changedInspections.map(item => ({ ...item, _type: "endret" as const })) : []),
                  ].map((item, i) => {
                    const score = computeSmileScore(item);
                    const group = smileGroupFromScore(score);
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}20` }}>
                        <td style={{ padding: "7px 10px" }}>
                          <Badge color={item._type === "ny" ? COLORS.smil : COLORS.strek}>
                            {item._type === "ny" ? "Ny" : "Endret"}
                          </Badge>
                        </td>
                        <td style={{ padding: "7px 10px", fontWeight: 500 }}>{item.navn}</td>
                        <td style={{ padding: "7px 10px", color: COLORS.textMuted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.adresse}</td>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{formatDato(item.dato)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>
                          <Badge color={group ? (group === "smil" ? COLORS.smil : group === "strek" ? COLORS.strek : COLORS.sur) : COLORS.textFaint}>
                            {group === "smil" ? "😊" : group === "strek" ? "😐" : group === "sur" ? "😠" : "?"}{" "}
                            {SCORE_LABELS[score] ?? "Ukjent"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ============================================================== */}
        {/* Download History                                               */}
        {/* ============================================================== */}
        {meta && meta.downloadHistory.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <SectionCard>
              <canvas
                ref={downloadRef}
                style={{ width: "100%", height: 220 }}
              />
            </SectionCard>
          </div>
        )}

        {/* ============================================================== */}
        {/* Detailed Score Breakdown                                       */}
        {/* ============================================================== */}
        <div style={{ marginTop: 16 }}>
          <SectionCard title="📊 Detaljert karakterfordeling" subtitle="Fordeling av individuelle kravpunktkarakterer (0–3)">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 8 }}>
              {[0, 1, 2, 3].map(k => {
                const count = scoreDist[k];
                const pct = features.length > 0 ? (count / features.length) * 100 : 0;
                return (
                  <div
                    key={k}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 12,
                      padding: "16px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* Progress bar background */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: `${pct}%`,
                        height: "100%",
                        background: SCORE_COLORS[k] + "10",
                        transition: "width 0.5s ease",
                      }}
                    />
                    <div style={{ position: "relative" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 24, fontWeight: 700 }}>{count.toLocaleString("nb-NO")}</span>
                        <Badge color={SCORE_COLORS[k]}>{pct.toFixed(1)}%</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                        {k === 0 && "Ingen brudd 😊"}
                        {k === 1 && "Små brudd 😊"}
                        {k === 2 && "Strekmunn 😐"}
                        {k === 3 && "Sur munn 😠"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

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
            <a href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.primary, textDecoration: "none" }}>
              Mattilsynet
            </a>
            {" ("}
            <a href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.primary, textDecoration: "none" }}>
              NLOD
            </a>
            {")"}
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: COLORS.primary, textDecoration: "none" }}>Kart</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
