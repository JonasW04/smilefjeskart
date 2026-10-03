/**
 * Smilefjes-figurene. Geometrien defineres én gang og brukes både som React-komponent
 * (components/Smiley.tsx) og som SVG-streng (kartmarkører, OG-bilder).
 */
import type { Smile } from "./smile";

export type SmileyKind = Smile | "ukjent";

export const SMILEY_FARGE: Record<SmileyKind, string> = {
  smil: "#1DB56C",
  strek: "#FFB21E",
  sur: "#F04E5A",
  ukjent: "#B3AAC6",
};

export const INK = "#1E1631";
const ROSA = "#FF8BC2";

type El =
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number; o?: number }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string; o?: number }
  | { t: "path"; d: string; fill?: string; stroke?: string; sw?: number };

const line = (d: string, sw = 3.2): El => ({ t: "path", d, stroke: INK, sw });
const dot = (cx: number, cy: number): El[] => [
  { t: "circle", cx, cy, r: 3.4, fill: INK },
  { t: "circle", cx: cx + 1.1, cy: cy - 1.1, r: 1.1, fill: "#fff" },
];
const kinn: El[] = [
  { t: "ellipse", cx: 15.5, cy: 38, rx: 4.2, ry: 2.6, fill: ROSA, o: 0.75 },
  { t: "ellipse", cx: 48.5, cy: 38, rx: 4.2, ry: 2.6, fill: ROSA, o: 0.75 },
];

const ANSIKT: Record<SmileyKind, El[]> = {
  smil: [
    line("M18.5 28 q4.5 -5.5 9 0"),
    line("M36.5 28 q4.5 -5.5 9 0"),
    ...kinn,
    { t: "path", d: "M18 36 Q32 56 46 36 Z", fill: INK, stroke: INK, sw: 2.4 },
    { t: "path", d: "M25.5 45.5 Q32 51.5 38.5 45.5 Q32 41.5 25.5 45.5 Z", fill: ROSA },
  ],
  strek: [
    ...dot(23, 28),
    ...dot(41, 28),
    line("M36 19.5 q5 -3.5 10 -0.5", 2.6),
    line("M22 43 L42 43"),
  ],
  sur: [
    line("M16.5 20 L27.5 24.5"),
    line("M47.5 20 L36.5 24.5"),
    ...dot(23, 30),
    ...dot(41, 30),
    line("M21 47.5 Q32 37 43 47.5"),
  ],
  ukjent: [...dot(23, 28), ...dot(41, 28), { t: "circle", cx: 32, cy: 43.5, r: 3.6, stroke: INK, sw: 3 }],
};

export function smileyElements(kind: SmileyKind): El[] {
  return [
    { t: "circle", cx: 32, cy: 32, r: 28.5, fill: SMILEY_FARGE[kind], stroke: INK, sw: 3.2 },
    ...ANSIKT[kind],
  ];
}

export type { El as SmileyElement };

function attrs(el: El): string {
  const a: string[] = [];
  if (el.t === "circle") a.push(`cx="${el.cx}" cy="${el.cy}" r="${el.r}"`);
  if (el.t === "ellipse") a.push(`cx="${el.cx}" cy="${el.cy}" rx="${el.rx}" ry="${el.ry}"`);
  if (el.t === "path") a.push(`d="${el.d}"`);
  const fill = "fill" in el && el.fill ? el.fill : "none";
  a.push(`fill="${fill}"`);
  if ("stroke" in el && el.stroke) {
    a.push(`stroke="${el.stroke}" stroke-width="${el.sw ?? 3}" stroke-linecap="round" stroke-linejoin="round"`);
  }
  if ("o" in el && el.o !== undefined) a.push(`opacity="${el.o}"`);
  return a.join(" ");
}

/** Smilefjes som frittstående SVG-markup. */
export function smileySvg(kind: SmileyKind, size = 64): string {
  const body = smileyElements(kind)
    .map((el) => `<${el.t} ${attrs(el)}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${body}</svg>`;
}

export function kindFromKarakter(k: number): SmileyKind {
  if (k === 0 || k === 1) return "smil";
  if (k === 2) return "strek";
  if (k === 3) return "sur";
  return "ukjent";
}
