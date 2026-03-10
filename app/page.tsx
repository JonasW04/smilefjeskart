"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource } from "maplibre-gl";
import Link from "next/link";
import Legend from "./legend";

// Data fra GeoJSON. Vi støtter både:
/// - "karakter" (tidligere beregnet)
//  - "karakter1..karakterN" (riktig smilefjes-logikk kan beregnes fra disse)
type Props = {
  tilsynsobjektid: string;
  orgnummer: string | null;
  navn: string;
  adresse: string;
  dato: string; // ddmmyyyy
  // Kan være feil i datasettet ditt, men vi bruker som fallback
  karakter?: number;

  // Tema/kravpunkt-karakterer (hvis du har dem i geojson)
  karakter1?: string | number;
  karakter2?: string | number;
  karakter3?: string | number;
  karakter4?: string | number;
  karakter5?: string | number;
  karakter6?: string | number;
  karakter7?: string | number;
  karakter8?: string | number;
  karakter9?: string | number;
  karakter10?: string | number;

  status: string | null;
};

type FilterMode = "all" | "smil" | "strek" | "sur";

function toLngLatTuple(coords: GeoJSON.Position): [number, number] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  return [lng, lat];
}

function formatDato(ddmmyyyy: string): string {
  const d = (ddmmyyyy ?? "").trim();
  if (d.length !== 8) return ddmmyyyy;
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  return `${dd}.${mm}.${yyyy}`;
}

function karakterLabel(k: number): string {
  switch (k) {
    case 0:
      return "0 = Ingen brudd på regelverket funnet. Stort smil.";
    case 1:
      return "1 = Mindre brudd på regelverket som ikke krever oppfølging. Stort smil.";
    case 2:
      return "2 = Brudd på regelverket som krever oppfølging. Strekmunn.";
    case 3:
      return "3 = Alvorlig brudd på regelverket. Sur munn.";
    case 4:
      return "4 = Ikke aktuelt – Påvirker ikke smilefjeskarakter.";
    case 5:
      return "5 = Ikke vurdert – Påvirker ikke smilefjeskarakter.";
    default:
      return "Ukjent karakter.";
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Draw a smiley-face icon on an off-screen canvas and return its ImageData.
 * `mouth` controls the expression:
 *   "smile" → upward curve  (green / happy)
 *   "neutral" → straight line (yellow / neutral)
 *   "frown" → downward curve (red / sad)
 */
function createSmileyImage(
  fillColor: string,
  mouth: "smile" | "neutral" | "frown",
  size = 40
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2; // leave room for stroke

  // Filled circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#222";
  ctx.stroke();

  // Eyes
  const eyeR = size * 0.065;
  const eyeY = cy - r * 0.18;
  const eyeSpread = r * 0.35;
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(cx - eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#222";
  const mouthWidth = r * 0.55;
  const mouthY = cy + r * 0.3;

  if (mouth === "smile") {
    ctx.arc(cx, mouthY - r * 0.05, mouthWidth, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (mouth === "frown") {
    ctx.arc(cx, mouthY + r * 0.35, mouthWidth, 1.15 * Math.PI, 1.85 * Math.PI);
  } else {
    // neutral — straight line
    ctx.moveTo(cx - mouthWidth, mouthY);
    ctx.lineTo(cx + mouthWidth, mouthY);
  }
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function toNumberMaybe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ✅ RIKTIG SMILEFJES-LOGIKK:
// Smilefjes = max av karakterX der X er kravpunkt/tema, men bare verdier 0..3 teller.
// 4 og 5 påvirker ikke smilefjes.
// Hvis vi ikke finner noen karakterX, faller vi tilbake til "karakter".
function computeSmileScore(p: Props): number {
  const candidates: number[] = [];

  // Ta med karakter1..karakter10 (utvid hvis du har flere)
  const raws: unknown[] = [
    p.karakter1,
    p.karakter2,
    p.karakter3,
    p.karakter4,
    p.karakter5,
    p.karakter6,
    p.karakter7,
    p.karakter8,
    p.karakter9,
    p.karakter10,
  ];

  for (const r of raws) {
    const n = toNumberMaybe(r);
    if (n === null) continue;
    if (n >= 0 && n <= 3) candidates.push(n); // ignorer 4/5
  }

  if (candidates.length > 0) return Math.max(...candidates);

  // fallback: bruk eksisterende karakter (hvis den ser ut som 0..3)
  const fallback = toNumberMaybe(p.karakter);
  if (fallback !== null && fallback >= 0 && fallback <= 3) return fallback;

  // ellers ukjent -> -1 (grå)
  return -1;
}

type SearchHit = {
  id: string;
  navn: string;
  adresse: string;
  orgnummer: string | null;
  dato: string;
  smileScore: number;
  coords: [number, number];
};

function smileEmoji(score: number): string {
  if (score === 0 || score === 1) return "😊";
  if (score === 2) return "😐";
  if (score === 3) return "😠";
  return "❓";
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Fullt datasett + derivert datasett med computed smileScore lagt inn
  const fullDataRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Point, (Props & { smileScore: number })> | null>(
    null
  );

  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  // Søk
  const [query, setQuery] = useState<string>("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Info-popup
  const [showInfo, setShowInfo] = useState(false);
  const infoWrapRef = useRef<HTMLDivElement | null>(null);  

  // Geolocation / near-me
  const [locating, setLocating] = useState(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const sourceUrl = useMemo(() => "/tilsyn.geojson", []);

  // Spread out features that share the same coordinates (e.g., multiple restaurants in a mall)
  const spreadFeatures = (
    features: GeoJSON.Feature<GeoJSON.Point, Props & { smileScore: number }>[]
  ): GeoJSON.Feature<GeoJSON.Point, Props & { smileScore: number }>[] => {
    const coordMap = new Map<string, GeoJSON.Feature<GeoJSON.Point, Props & { smileScore: number }>[]>();

    // Group features by coordinates
    for (const f of features) {
      const [lng, lat] = f.geometry.coordinates;
      const key = `${lng},${lat}`;
      if (!coordMap.has(key)) coordMap.set(key, []);
      coordMap.get(key)!.push(f);
    }

    // Apply slight offsets to duplicates
    const result: GeoJSON.Feature<GeoJSON.Point, Props & { smileScore: number }>[] = [];
    for (const group of coordMap.values()) {
      if (group.length === 1) {
        result.push(group[0]);
      } else {
        // Multiple features at same location: spread them in a circle
        const [baseLng, baseLat] = group[0].geometry.coordinates;
        const radiusDegrees = 0.0003; // ~30 meters at equator, varies by latitude

        for (let i = 0; i < group.length; i++) {
          const angle = (i / group.length) * Math.PI * 2;
          const offsetLng = baseLng + radiusDegrees * Math.cos(angle);
          const offsetLat = baseLat + radiusDegrees * Math.sin(angle);

          result.push({
            ...group[i],
            geometry: {
              type: "Point",
              coordinates: [offsetLng, offsetLat],
            },
          });
        }
      }
    }

    return result;
  };

  // Init map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [10.75, 59.91],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
      // Register smiley-face icons for map markers
      const iconSize = 40;
      map.addImage("smiley-green", createSmileyImage("#2ecc71", "smile", iconSize), { pixelRatio: 2 });
      map.addImage("smiley-yellow", createSmileyImage("#f1c40f", "neutral", iconSize), { pixelRatio: 2 });
      map.addImage("smiley-red", createSmileyImage("#e74c3c", "frown", iconSize), { pixelRatio: 2 });
      map.addImage("smiley-gray", createSmileyImage("#7f8c8d", "neutral", iconSize), { pixelRatio: 2 });

      const res = await fetch(sourceUrl);
      const raw = (await res.json()) as GeoJSON.FeatureCollection<GeoJSON.Point, Props>;

      // ✅ legg på computed smileScore i properties (front-end only)
      let features = raw.features.map((f) => ({
        ...f,
        properties: { ...f.properties, smileScore: computeSmileScore(f.properties) },
      }));

      // ✅ spread features that share the same coordinates
      features = spreadFeatures(features);

      const enriched: GeoJSON.FeatureCollection<GeoJSON.Point, Props & { smileScore: number }> = {
        type: "FeatureCollection",
        features,
      };

      fullDataRef.current = enriched;

      map.addSource("tilsyn", {
        type: "geojson",
        data: enriched,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // clusters
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "tilsyn",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 16, 20, 22, 50, 28],
          "circle-opacity": 0.7,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "tilsyn",
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
      });

      // unclustered smiley-face icons colored by smileScore
      map.addLayer({
        id: "unclustered",
        type: "symbol",
        source: "tilsyn",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": [
            "case",
            ["any", ["==", ["get", "smileScore"], 0], ["==", ["get", "smileScore"], 1]],
            "smiley-green",
            ["==", ["get", "smileScore"], 2],
            "smiley-yellow",
            ["==", ["get", "smileScore"], 3],
            "smiley-red",
            "smiley-gray",
          ],
          "icon-size": 1,
          "icon-allow-overlap": true,
        },
      });

      // unclustered labels (names shown when zoomed in)
      map.addLayer({
        id: "unclustered-labels",
        type: "symbol",
        source: "tilsyn",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "navn"],
          "text-size": 20,
          "text-offset": [0, -2],
          "text-anchor": "top",
          "text-max-width": 50,
        },
        paint: {
          "text-color": "#1d1d1dff",
          "text-halo-color": "#fff",
          "text-halo-width": 1.2,
        },
        minzoom: 14,
      });

      // cluster click => zoom
      map.on("click", "clusters", (e) => {
        const eventCoords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const currentZoom = map.getZoom();
        const newZoom = Math.min(currentZoom + 3, 16);
        map.easeTo({ center: eventCoords, zoom: newZoom, duration: 300 });
      });

      // point click => popup (uten adressekilde)
      map.on("click", "unclustered", (e) => {
        const f = e.features?.[0] as GeoJSON.Feature<GeoJSON.Point, Props & { smileScore: number }> | undefined;
        if (!f?.properties) return;

        const coords = toLngLatTuple(f.geometry.coordinates);
        if (!coords) return;

        const p = f.properties;
        const score = p.smileScore;

        new maplibregl.Popup({ offset: 18 })
          .setLngLat(coords)
          .setHTML(
            `<strong>${p.navn}</strong><br/>${p.adresse}<br/>Dato: ${formatDato(
              p.dato
            )}<br/><br/><strong>Smilefjeskarakter:</strong> ${score}<br/>${karakterLabel(score)}`
          )
          .addTo(map);

        setSelectedId(p.tilsynsobjektid);
      });

      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered", () => (map.getCanvas().style.cursor = ""));
    });

    mapRef.current = map;
    return () => map.remove();
  }, [sourceUrl]);

  // Filter: oppdater source-data (clusters følger filter)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource("tilsyn") as GeoJSONSource | undefined;
      const full = fullDataRef.current;
      if (!src || !full) return;

      const passes = (score: number) => {
        if (filterMode === "all") return true;
        if (filterMode === "smil") return score === 0 || score === 1;
        if (filterMode === "strek") return score === 2;
        if (filterMode === "sur") return score === 3;
        return true;
      };

      src.setData({
        type: "FeatureCollection",
        features: full.features.filter((f) => passes(f.properties.smileScore)),
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [filterMode]);

  // Søk (innenfor filter)
  useEffect(() => {
    const full = fullDataRef.current;
    if (!full) return;

    const q = normalize(query);
    if (q.length < 2) {
      // Schedule clearing of hits to avoid sync setState in effect
      setTimeout(() => setHits([]), 0);
      return;
    }

    const passes = (score: number) => {
      if (filterMode === "all") return true;
      if (filterMode === "smil") return score === 0 || score === 1;
      if (filterMode === "strek") return score === 2;
      if (filterMode === "sur") return score === 3;
      return true;
    };

    const next: SearchHit[] = [];
    for (const f of full.features) {
      const p = f.properties;
      if (!passes(p.smileScore)) continue;

      const coords = toLngLatTuple(f.geometry.coordinates);
      if (!coords) continue;

      const hay = normalize([p.navn, p.adresse, p.orgnummer ?? ""].filter(Boolean).join(" | "));
      if (!hay.includes(q)) continue;

      next.push({
        id: p.tilsynsobjektid,
        navn: p.navn,
        adresse: p.adresse,
        orgnummer: p.orgnummer,
        dato: p.dato,
        smileScore: p.smileScore,
        coords,
      });

      if (next.length >= 10) break;
    }

    // Schedule to avoid synchronous setState inside effect
    setTimeout(() => setHits(next), 0);
  }, [query, filterMode]);

  // Lukk info-popup ved klikk utenfor eller Escape
  useEffect(() => {
    if (!showInfo) return;

    function onDocClick(e: MouseEvent) {
      if (infoWrapRef.current && !infoWrapRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowInfo(false);
    }

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showInfo]);

  const flyToHit = (hit: SearchHit) => {
    const map = mapRef.current;
    if (!map) return;

    setSelectedId(hit.id);
    setHits([]);

    map.easeTo({ center: hit.coords, zoom: Math.max(map.getZoom(), 15) });

    new maplibregl.Popup({ offset: 18 })
      .setLngLat(hit.coords)
      .setHTML(
        `<strong>${hit.navn}</strong><br/>${hit.adresse}<br/>Dato: ${formatDato(
          hit.dato
        )}<br/><br/><strong>Smilefjeskarakter:</strong> ${hit.smileScore}<br/>${karakterLabel(hit.smileScore)}`
      )
      .addTo(map);
  };

  // Center map on user's current location
  const centerOnUser = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      alert("Geolocation ikke støttet i denne nettleseren.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const map = mapRef.current;
        if (!map) return;

        map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 14) });

        if (userMarkerRef.current) {
          userMarkerRef.current.setLngLat(coords);
        } else {
          userMarkerRef.current = new maplibregl.Marker({ color: "#0077ff" }).setLngLat(coords).addTo(map);
        }
      },
      (err) => {
        setLocating(false);
        alert("Kunne ikke hente posisjon: " + err.message);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }
    );
  };

  return (
    <main style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <header className="map-header">
        <strong style={{ fontSize: 16, whiteSpace: "nowrap" }}>🍽️ Smilefjeskartet</strong>

        <nav aria-label="Filter og søk" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", flex: 1 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong>Filter:</strong>
          <select
            value={filterMode}
            onChange={(e) => {
              setFilterMode(e.target.value as FilterMode);
              setQuery("");
              setHits([]);
              setSelectedId(null);
            }}
          >
            <option value="all">Alle</option>
            <option value="smil">Smil</option>
            <option value="strek">Strek</option>
            <option value="sur">Sur</option>
          </select>
        </label>

        <div className="map-search-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk (navn, adresse, orgnr)…"
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid #ddd",
              borderRadius: 8,
              outline: "none",
            }}
          />

          {hits.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: 40,
                left: 0,
                right: 0,
                background: "white",
                border: "1px solid #ddd",
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
              }}
            >
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => flyToHit(h)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    background: selectedId === h.id ? "#f6f6f6" : "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{h.navn}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {h.adresse} • {smileEmoji(h.smileScore)}
                    {h.orgnummer ? ` • Orgnr ${h.orgnummer}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        </nav>

        <div
        ref={infoWrapRef}
        className="map-actions-wrap"
        > 
          <Link
            href="/analyse"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              textDecoration: "none",
              color: "inherit",
              fontSize: 14,
            }}
            title="Analyse av tilsynsdata"
          >
            📊 Analyse
          </Link>
          <button
            aria-expanded={showInfo}
            onClick={() => setShowInfo((s) => !s)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
            }}
            title="Om denne nettsiden"
          >
            Info
          </button>

          {showInfo && (
            <div
              ref={infoWrapRef}
              role="dialog"
              aria-label="Om smilefjeskart"
              className="map-info-dialog"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: "inherit" }}>Om dette kartet</h2>
                <button
                  onClick={() => setShowInfo(false)}
                  aria-label="Lukk"
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14 }}
                >
                  ✕
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
                <p style={{ margin: 0 }}>
                  <strong>Smilefjeskartet</strong> viser resultatene fra Mattilsynets
                  restaurantkontroller i Norge. Se forklaringen til venstre for hva
                  fargene betyr.
                </p>

                <p style={{ margin: "12px 0 6px", fontWeight: 600 }}>Datakilder:</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                  <li>
                    Tilsynsdata: <a href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>Mattilsynet – Smilefjesordningen</a>
                    <br />
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Lisensiert under <a href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>NLOD 2.0</a></span>
                  </li>
                  <li>
                    Kart: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>© OpenStreetMap</a>
                  </li>
                  <li>
                    Adresseoppslag: <a href="https://kartverket.no/" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline" }}>Kartverket</a>
                  </li>
                </ul>

                <p style={{ margin: "12px 0 0", fontSize: 12, color: "#666" }}>
                  Denne nettsiden er ikke tilknyttet Mattilsynet. Dataene oppdateres jevnlig fra offentlig tilgjengelige kilder.
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      <Legend />

      <button
        onClick={centerOnUser}
        title="Sentrer kartet på min posisjon"
        className="map-locate-btn"
      >
        {locating ? "…" : "📍 Nær meg"}
      </button>

      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      <footer
        style={{
          position: "absolute",
          bottom: 2,
          left: 4,
          zIndex: 2,
          fontSize: 11,
          color: "#555",
          background: "rgba(255,255,255,0.75)",
          padding: "2px 6px",
          borderRadius: 4,
          pointerEvents: "auto",
        }}
      >
        Data:{" "}
        <a
          href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#1d4ed8", textDecoration: "none" }}
        >
          Mattilsynet
        </a>
        {" ("}
        <a
          href="https://data.norge.no/nlod/no/2.0"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#1d4ed8", textDecoration: "none" }}
        >
          NLOD
        </a>
        {") · "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#1d4ed8", textDecoration: "none" }}
        >
          © OpenStreetMap
        </a>
      </footer>
    </main>
  );
}
