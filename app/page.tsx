"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource } from "maplibre-gl";
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

type ClusterProps = {
  cluster: true;
  cluster_id: number | string;
  point_count: number;
  point_count_abbreviated: string;
};

type ClickFeature = GeoJSON.Feature<GeoJSON.Point, Props | ClusterProps>;

// Source interface for clustered GeoJSON sources (Mapbox/MapLibre + supercluster)
type ClusterSource = maplibregl.GeoJSONSource & {
  getClusterExpansionZoom?: (clusterId: number, cb: (err: unknown, zoom: number) => void) => void;
  getClusterLeaves?: (
    clusterId: number,
    limit: number,
    offset: number,
    cb: (err: unknown, features: Array<GeoJSON.Feature<GeoJSON.Point, Props>>) => void
  ) => void;
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
  const infoRef = useRef<HTMLDivElement | null>(null);

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

      // unclustered circles colored by smileScore
      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "tilsyn",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-stroke-width": 1,
          "circle-opacity": 0.9,
          "circle-color": [
            "case",
            ["any", ["==", ["get", "smileScore"], 0], ["==", ["get", "smileScore"], 1]],
            "#2ecc71", // Smil
            ["==", ["get", "smileScore"], 2],
            "#f1c40f", // Strek
            ["==", ["get", "smileScore"], 3],
            "#e74c3c", // Sur
            "#7f8c8d", // ukjent
          ],
        },
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
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowInfo(false);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
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
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
    );
  };

  return (
    <main style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <header
        style={{
          padding: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
          borderBottom: "1px solid #eee",
          fontFamily: "system-ui",
          position: "relative",
          zIndex: 2,
        }}
      >
        <strong>Smilefjeskartet</strong>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Filter:
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

        <div style={{ position: "relative", flex: 1, maxWidth: 520 }}>
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
                    {h.adresse} • Smilefjes {h.smileScore}
                    {h.orgnummer ? ` • Orgnr ${h.orgnummer}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center" }}>
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
            Om
          </button>

          <button
            onClick={centerOnUser}
            title="Sentrer kartet på min posisjon"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
            }}
          >
            {locating ? "…" : "📍 Nær meg"}
          </button>

          {showInfo && (
            <div
              ref={infoRef}
              role="dialog"
              aria-label="Om smilefjeskart"
              style={{
                position: "absolute",
                top: 44,
                right: 0,
                width: 320,
                background: "white",
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong>Om dette kartet</strong>
                <button
                  onClick={() => setShowInfo(false)}
                  aria-label="Lukk"
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14 }}
                >
                  ✕
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.4 }}>
                <p style={{ margin: 0 }}>
                  <strong>Smilefjeskartet</strong> viser resultatene fra <strong>Mattilsynet</strong> sine restaurantkontroller i <strong>Norge</strong>. Alle dataene er basert på offentlig tilgjengelige tilsynsdata.
                </p>

                <p style={{ margin: "8px 0 6px", fontWeight: 600 }}>Fargeforklaring:</p>

                <ul style={{ margin: 0, paddingLeft: 18, marginBottom: 0 }}>
                  <li>
                    <span style={{ color: "#2ecc71", fontWeight: 700 }}>Grønn</span> — Smil (ingen eller små avvik)
                  </li>
                  <li>
                    <span style={{ color: "#f1c40f", fontWeight: 700 }}>Gul</span> — Strek (avvik som må følges opp)
                  </li>
                  <li>
                    <span style={{ color: "#e74c3c", fontWeight: 700 }}>Rød</span> — Sur munn (alvorlige brudd)
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </header>

      <Legend />

      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
    </main>
  );
}
