/**
 * MapLibre-oppsett for kartsiden: grunnkart (OpenFreeMap), smilefjesbilder, kilder, lag og klyngemarkører.
 */
import maplibregl from "maplibre-gl";
import type { Modus, StedProps } from "@/lib/kart";
import { smileySvg, type SmileyKind } from "@/lib/smiley";

export const STIL_URL = {
  lys: "https://tiles.openfreemap.org/styles/positron",
  mork: "https://tiles.openfreemap.org/styles/dark",
};

const GRUPPE_KIND: SmileyKind[] = ["smil", "strek", "sur", "ukjent"];
export const GRUPPE_FARGE = ["#1DB56C", "#FFB21E", "#F04E5A", "#B3AAC6"];

/** Varmere farger på grunnkartet, så det passer papir-uttrykket. */
export function tilpassGrunnkart(map: maplibregl.Map, mork: boolean) {
  const sett = (id: string, prop: string, verdi: string) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, verdi);
  };
  if (mork) {
    sett("background", "background-color", "#16111f");
    sett("water", "fill-color", "#271f40");
    sett("landuse_park", "fill-color", "#1b2722");
    sett("landcover_wood", "fill-color", "#1b2722");
    sett("building", "fill-color", "#211a2e");
  } else {
    sett("background", "background-color", "#fbf3e4");
    sett("water", "fill-color", "#bcd9ee");
    sett("park", "fill-color", "#d9eed5");
    sett("landcover_wood", "fill-color", "#e0eed6");
    sett("landuse_residential", "fill-color", "#f5ead8");
    sett("building", "fill-color", "#eee1cc");
  }
}

export async function leggTilSmilefjes(map: maplibregl.Map) {
  await Promise.all(
    GRUPPE_KIND.map(
      (kind, g) =>
        new Promise<void>((resolve) => {
          const img = new Image(72, 72);
          img.onload = () => {
            if (!map.hasImage(`smiley-${g}`)) map.addImage(`smiley-${g}`, img, { pixelRatio: 2 });
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(smileySvg(kind, 72))}`;
        }),
    ),
  );
}

const sum = (felt: "k" | "v", g: number): maplibregl.ExpressionSpecification =>
  ["+", ["case", ["==", ["get", felt], g], 1, 0]] as unknown as maplibregl.ExpressionSpecification;

export function leggTilLag(map: maplibregl.Map, data: GeoJSON.FeatureCollection<GeoJSON.Point, StedProps>, modus: Modus, mork: boolean) {
  const felt = modus === "siste" ? "k" : "v";
  map.addSource("steder", {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 50,
    clusterProperties: {
      k0: sum("k", 0), k1: sum("k", 1), k2: sum("k", 2),
      v0: sum("v", 0), v1: sum("v", 1), v2: sum("v", 2),
    },
  });

  // Usynlig lag så klyngene lastes og kan spørres etter; selve tegningen gjøres med HTML-markører.
  map.addLayer({
    id: "klynger",
    type: "circle",
    source: "steder",
    filter: ["has", "point_count"],
    paint: { "circle-radius": 1, "circle-opacity": 0 },
  });

  map.addLayer({
    id: "valgt-ring",
    type: "circle",
    source: "steder",
    filter: ["==", ["get", "s"], ""],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 16, 16, 26],
      "circle-color": "#6b4eff",
      "circle-opacity": 0.22,
      "circle-stroke-color": "#6b4eff",
      "circle-stroke-width": 3,
    },
  });

  map.addLayer({
    id: "steder-ikon",
    type: "symbol",
    source: "steder",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["concat", "smiley-", ["to-string", ["get", felt]]],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.55, 12, 0.75, 16, 1],
      "icon-allow-overlap": true,
      // Dårlige resultater tegnes øverst.
      "symbol-sort-key": ["match", ["get", felt], 3, -1, ["get", felt]],
    },
  });

  map.addLayer({
    id: "steder-navn",
    type: "symbol",
    source: "steder",
    filter: ["!", ["has", "point_count"]],
    minzoom: 14.5,
    layout: {
      "text-field": ["get", "n"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-max-width": 10,
      "text-optional": true,
    },
    paint: {
      "text-color": mork ? "#fbf6ff" : "#1e1631",
      "text-halo-color": mork ? "#16111f" : "#fff8ec",
      "text-halo-width": 1.6,
    },
  });
}

export function settModus(map: maplibregl.Map, modus: Modus) {
  const felt = modus === "siste" ? "k" : "v";
  if (!map.getLayer("steder-ikon")) return;
  map.setLayoutProperty("steder-ikon", "icon-image", ["concat", "smiley-", ["to-string", ["get", felt]]]);
  map.setLayoutProperty("steder-ikon", "symbol-sort-key", ["match", ["get", felt], 3, -1, ["get", felt]]);
}

function forkort(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return String(n);
}

/** Smultring-klynge: andel smil/strek/sur rundt antallet. */
export function klyngeElement(p: Record<string, number>, modus: Modus): HTMLButtonElement {
  const pre = modus === "siste" ? "k" : "v";
  const total = p.point_count;
  const deler = [p[`${pre}0`] ?? 0, p[`${pre}1`] ?? 0, p[`${pre}2`] ?? 0];
  deler.push(Math.max(0, total - deler[0] - deler[1] - deler[2]));
  const size = total >= 500 ? 66 : total >= 100 ? 56 : total >= 20 ? 48 : 40;
  const r = size / 2 - 5;
  const omkrets = 2 * Math.PI * r;
  let offset = 0;
  const buer = deler
    .map((n, g) => {
      if (n === 0) return "";
      const len = (n / total) * omkrets;
      const bue = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${GRUPPE_FARGE[g]}" stroke-width="8" stroke-dasharray="${len} ${omkrets - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += len;
      return bue;
    })
    .join("");

  const el = document.createElement("button");
  el.type = "button";
  el.className = "kart-klynge";
  const tekst = [`${total} steder`];
  if (deler[1]) tekst.push(`${deler[1]} med strekmunn`);
  if (deler[2]) tekst.push(`${deler[2]} med sur munn`);
  el.setAttribute("aria-label", `${tekst.join(", ")}. Zoom inn.`);
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>
    ${buer}
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-weight="800" font-size="${size >= 56 ? 15 : 13}" fill="var(--ink)">${forkort(total)}</text>
  </svg>`;
  return el;
}
