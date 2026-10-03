/** Små, rene hjelpere for SVG-grafene (skalaer og tallformat). */

/**
 * «Pene» akseverdier fra 0 til minst `maks`: steg på 1, 2, 2,5 eller 5 × 10^n,
 * med omtrent `antall` intervaller.
 */
export function penSkala(maks: number, antall = 4): { maks: number; steg: number; ticks: number[] } {
  if (!(maks > 0)) return { maks: 1, steg: 1, ticks: [0, 1] };
  const grovt = maks / antall;
  const pot = 10 ** Math.floor(Math.log10(grovt));
  const steg = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((s) => s >= grovt)!;
  const topp = Math.round(Math.ceil(maks / steg - 1e-9) * steg * 1e9) / 1e9;
  const ticks: number[] = [];
  for (let v = 0; v <= topp + steg / 2; v += steg) ticks.push(Math.round(v * 1e9) / 1e9);
  return { maks: topp, steg, ticks };
}

/** Heltall med norsk tusenskille: 45035 → "45 035". */
export function tall(n: number): string {
  return Math.round(n).toLocaleString("nb-NO");
}

/** Prosentpoeng med fortegn og ekte minus: 3.5 → "+3,5 pp", -1 → "−1,0 pp". */
export function pp(x: number): string {
  const s = Math.abs(x).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (s === "0,0") return "±0,0 pp";
  return `${x > 0 ? "+" : "−"}${s} pp`;
}

/** Kort prosent for akser: 0.25 → "25 %", 0.025 → "2,5 %". */
export function aksePst(x: number): string {
  const v = Math.round(x * 1000) / 10;
  return `${v.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
}

export const MND_KORT = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
export const MND_LANG = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];
export const UKEDAGER = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
