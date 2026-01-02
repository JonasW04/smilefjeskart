"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { GeoJSONSource } from "maplibre-gl";

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

  const sourceUrl = useMemo(() => "/tilsyn.geojson", []);

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
      const enriched: GeoJSON.FeatureCollection<GeoJSON.Point, Props & { smileScore: number }> = {
        type: "FeatureCollection",
        features: raw.features.map((f) => ({
          ...f,
          properties: { ...f.properties, smileScore: computeSmileScore(f.properties) },
        })),
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
        const f = e.features?.[0] as ClickFeature | undefined;
        if (!f?.properties || !("cluster_id" in f.properties)) return;

        const coords = toLngLatTuple(f.geometry.coordinates);
        if (!coords) return;

        const clusterId = Number((f.properties as ClusterProps).cluster_id);
        if (!Number.isFinite(clusterId)) return;

        const src = map.getSource("tilsyn") as unknown as {
          getClusterExpansionZoom?: (clusterId: number, cb: (err: unknown, zoom: number) => void) => void;
          getClusterLeaves?: (
            clusterId: number,
            limit: number,
            offset: number,
            cb: (err: unknown, features: Array<GeoJSON.Feature<GeoJSON.Point, Props>>) => void
          ) => void;
        };

        if (src.getClusterExpansionZoom) {
          src.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: coords, zoom });
          });
          return;
        }

        map.easeTo({ center: coords, zoom: Math.min(map.getZoom() + 2, 16) });

        if (src.getClusterLeaves) {
          src.getClusterLeaves(clusterId, 1, 0, (_err, leaves) => {
            if (!leaves?.length) return;
            const leafCoords = toLngLatTuple(leaves[0].geometry.coordinates);
            if (!leafCoords) return;
            map.easeTo({ center: leafCoords, zoom: Math.min(map.getZoom() + 1, 16) });
          });
        }
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
      setHits([]);
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

    setHits(next);
  }, [query, filterMode]);

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
        <strong>Smilefjeskart (MVP)</strong>

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
      </header>

      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
    </main>
  );
}
