/** Rene statistikkfunksjoner over steder og tilsyn. */
import { smileFromKarakter, type Smile } from "./smile";
import type { Sted, Tilsyn } from "./types";

export function sisteTilsyn(s: Sted): Tilsyn {
  return s.tilsyn[s.tilsyn.length - 1];
}

export function sisteSmil(s: Sted): Smile | null {
  return smileFromKarakter(sisteTilsyn(s).karakter);
}

export type Fordeling = Record<Smile, number> & { total: number };

export function tomFordeling(): Fordeling {
  return { smil: 0, strek: 0, sur: 0, total: 0 };
}

/** Fordeling av smilefjes for en liste karakterer (ukjente telles ikke). */
export function fordeling(karakterer: Iterable<number>): Fordeling {
  const f = tomFordeling();
  for (const k of karakterer) {
    const s = smileFromKarakter(k);
    if (!s) continue;
    f[s]++;
    f.total++;
  }
  return f;
}

export function andel(f: Fordeling, s: Smile): number {
  return f.total === 0 ? 0 : f[s] / f.total;
}

export function dagerMellom(isoA: string, isoB: string): number {
  return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86_400_000);
}

export type StedStats = {
  antall: number;
  forste: string;
  siste: string;
  fordeling: Fordeling;
  antallOppfolging: number;
  /** Lengste rekke med smil på rad (ordinære og oppfølgingstilsyn). */
  lengsteSmilRekke: number;
};

export function stedStats(s: Sted): StedStats {
  let rekke = 0;
  let lengste = 0;
  for (const t of s.tilsyn) {
    if (smileFromKarakter(t.karakter) === "smil") lengste = Math.max(lengste, ++rekke);
    else rekke = 0;
  }
  return {
    antall: s.tilsyn.length,
    forste: s.tilsyn[0].dato,
    siste: sisteTilsyn(s).dato,
    fordeling: fordeling(s.tilsyn.map((t) => t.karakter)),
    antallOppfolging: s.tilsyn.filter((t) => t.oppfolging).length,
    lengsteSmilRekke: lengste,
  };
}

const MND = ["jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."];

/** "2026-01-14" → "14. jan. 2026" */
export function formatDato(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d}. ${MND[m - 1]} ${y}`;
}

/** Menneskelig tid siden: "i dag", "for 3 dager siden", "for 2 år siden". */
export function tidSiden(iso: string, naa: Date = new Date()): string {
  const dager = Math.floor((naa.getTime() - Date.parse(iso)) / 86_400_000);
  if (dager <= 0) return "i dag";
  if (dager === 1) return "i går";
  if (dager < 31) return `for ${dager} dager siden`;
  const mnd = Math.floor(dager / 30.44);
  if (mnd < 12) return mnd === 1 ? "for en måned siden" : `for ${mnd} måneder siden`;
  const aar = Math.floor(dager / 365.25);
  return aar === 1 ? "for ett år siden" : `for ${aar} år siden`;
}

export function prosent(x: number, desimaler = 0): string {
  return `${(x * 100).toLocaleString("nb-NO", { maximumFractionDigits: desimaler, minimumFractionDigits: desimaler })} %`;
}

/**
 * Karakterer fra ordinære tilsyn (ikke oppfølging). Nesten alle steder ender med smil
 * etter oppfølging, så det er de ordinære tilsynene som sier noe om hvordan stedet drives.
 */
export function ordinaereKarakterer(s: Sted): number[] {
  return s.tilsyn.filter((t) => !t.oppfolging).map((t) => t.karakter);
}

export function ordinaerFordeling(steder: Iterable<Sted>): Fordeling {
  const f = tomFordeling();
  for (const s of steder) {
    const g = fordeling(ordinaereKarakterer(s));
    f.smil += g.smil;
    f.strek += g.strek;
    f.sur += g.sur;
    f.total += g.total;
  }
  return f;
}
