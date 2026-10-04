/**
 * MapLibre-oppsett for kartsiden: grunnkart (OpenFreeMap), smilefjesbilder, kilder, lag og klyngemarkører.
 */
import * as maplibregl from "maplibre-gl";
import { klyngeHumor, type Modus, type StedProps } from "@/lib/kart";
import { smileySvg, type SmileyKind } from "@/lib/smiley";

export const STIL_URL = {
  lys: "https://tiles.openfreemap.org/styles/positron",
  mork: "https://tiles.openfreemap.org/styles/dark",
};

const GRUPPE_KIND: SmileyKind[] = ["smil", "strek", "sur", "ukjent"];
export const GRUPPE_FARGE = ["#1DB56C", "#FFB21E", "#F04E5A", "#B3AAC6"];

/** Varmere farger på grunnkartet, så det passer papir-uttrykket. */
export function tilpassGrunnkart(map: maplibregl.Map, mork: boolean) {
  const sett = (id: string, prop: "background-color" | "fill-color", verdi: string) => {
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

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lite fjes inni smultringen. Munnen bøyer seg etter humøret (-1 sur … 1 glis); ytterpunktene
 * får ekstra detaljer – røde kinn og åpent glis, eller sinte øyebryn. Ukjent humør gir «o»-munn.
 */
function humorFjes(c: number, f: number, humor: number | null): string {
  const ink = "var(--ink)";
  const ey = r2(c - 0.22 * f);
  const ex = 0.36 * f;
  const er = r2(Math.max(1.6, 0.13 * f));
  const sw = r2(Math.max(2, 0.15 * f));
  const strek = `fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const oyne = `<g class="kart-klynge-oyne"><circle cx="${r2(c - ex)}" cy="${ey}" r="${er}" fill="${ink}"/><circle cx="${r2(c + ex)}" cy="${ey}" r="${er}" fill="${ink}"/></g>`;
  if (humor === null) return `${oyne}<circle cx="${c}" cy="${r2(c + 0.38 * f)}" r="${r2(0.16 * f)}" ${strek}/>`;

  const hw = 0.42 * f;
  const y0 = r2(c + 0.34 * f - 0.1 * f * humor);
  const ctrl = r2(y0 + 0.62 * f * humor);
  const bue = `M${r2(c - hw)} ${y0} Q${c} ${ctrl} ${r2(c + hw)} ${y0}`;
  let ekstra = "";
  let munn = `<path d="${bue}" ${strek}/>`;
  if (humor > 0.75) {
    munn = `<path d="${bue} Z" fill="${ink}" stroke="${ink}" stroke-width="${r2(sw * 0.7)}" stroke-linejoin="round"/>`;
    for (const side of [-1, 1]) {
      ekstra += `<ellipse cx="${r2(c + side * 0.66 * f)}" cy="${r2(c + 0.16 * f)}" rx="${r2(0.17 * f)}" ry="${r2(0.1 * f)}" fill="#FF8BC2" opacity="0.8"/>`;
    }
  } else if (humor < -0.6) {
    for (const side of [-1, 1]) {
      const ytre = r2(c + side * (ex + 0.22 * f));
      const indre = r2(c + side * (ex - 0.2 * f));
      ekstra += `<path d="M${ytre} ${r2(ey - 0.5 * f)} L${indre} ${r2(ey - 0.3 * f)}" ${strek}/>`;
    }
  }
  return oyne + ekstra + munn;
}

/** Smultring-klynge: andel smil/strek/sur rundt et fjes som viser humøret, med antallet under. */
export function klyngeElement(p: Record<string, number>, modus: Modus): HTMLButtonElement {
  const pre = modus === "siste" ? "k" : "v";
  const total = p.point_count;
  const deler = [p[`${pre}0`] ?? 0, p[`${pre}1`] ?? 0, p[`${pre}2`] ?? 0];
  deler.push(Math.max(0, total - deler[0] - deler[1] - deler[2]));
  const size = total >= 500 ? 70 : total >= 100 ? 60 : total >= 20 ? 52 : 46;
  const c = size / 2;
  const r = c - 5;
  const omkrets = 2 * Math.PI * r;
  let offset = 0;
  const buer = deler
    .map((n, g) => {
      if (n === 0) return "";
      const len = (n / total) * omkrets;
      const bue = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${GRUPPE_FARGE[g]}" stroke-width="8" stroke-dasharray="${len} ${omkrets - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})"/>`;
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
  // Fjeset fyller hullet i smultringen (indre kant er r - 4), med litt luft.
  el.innerHTML = `<span class="kart-klynge-innhold"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${c - 1}" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>
    ${buer}
    ${humorFjes(c, r - 5.5, klyngeHumor(deler[0], deler[1], deler[2]))}
  </svg><span class="kart-klynge-tall">${forkort(total)}</span></span>`;
  return el;
}
