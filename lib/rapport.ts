/**
 * «Smilefjes-rapporten»: månedlige aggregater over ordinære tilsyn (oppfølging holdes utenfor,
 * se lib/analyse.ts). Rene funksjoner; lib/server/rapport.ts kobler dem til datasettet.
 */
import { endringPp, FORSTE_AAR, leggTil, rangerEtterSmil, type Gruppe } from "./analyse";
import { MND_LANG } from "./chart";
import { anmerkninger } from "./siste";
import { andel, dagerMellom, prosent, tomFordeling, type Fordeling } from "./stats";
import { smileFromKarakter } from "./smile";
import type { Sted, Tilsyn } from "./types";

/** Måned som "yyyy-mm". */
export type Ym = string;

const YM = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function erYm(s: string): boolean {
  return YM.test(s);
}

/** Måneden `n` måneder før (negativ n gir måneder etter). */
export function forrigeMaaned(ym: Ym, n = 1): Ym {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) - n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** "2026-10" → "oktober 2026" */
export function maanedNavn(ym: Ym): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MND_LANG[m - 1]} ${y}`;
}

/**
 * Mattilsynet publiserer tilsyn med noen dagers forsinkelse. En måned får rapport først når
 * datasettet har tilsyn minst så mange dager inn i måneden etter.
 */
export const RAPPORT_FORSINKELSE_DAGER = 7;

/** Siste måned som er ferdig nok til å få rapport, gitt siste tilsynsdato i datasettet. */
export function sisteRapportMaaned(sluttDato: string): Ym {
  const ym = sluttDato.slice(0, 7);
  const dag = Number(sluttDato.slice(8, 10));
  return forrigeMaaned(ym, dag >= RAPPORT_FORSINKELSE_DAGER ? 1 : 2);
}

/** Minste antall ordinære tilsyn i måneden for at en kommune rangeres. */
export const MIN_KOMMUNE_MAANED = 10;
/** Minste antall ordinære tilsyn siste 12 måneder for at en kjede rangeres. */
export const MIN_KJEDE_12MND = 10;
/** Hvor mange kommuner som vises på hver side (best og svakest). */
export const ANTALL_KOMMUNER = 5;
/** Færre rangerte kommuner enn dette gir ingen kåring av best og svakest, bare tabellen. */
export const MIN_KOMMUNER_KAARING = 6;
/**
 * Et ordinært tilsyn så kort tid etter forrige regnes ikke som comeback: det er i praksis en
 * oppfølging, selv om Mattilsynet ikke har merket det slik.
 */
export const MIN_COMEBACK_DAGER = 60;

export type MaanedSum = {
  ym: Ym;
  /** Alle tilsyn, også oppfølging. */
  alle: number;
  /** Utfall av ordinære tilsyn. */
  ordinaer: Fordeling;
};

/** Én gjennomgang av datasettet: tilsyn per måned. Måneder før FORSTE_AAR holdes utenfor. */
export function maanedSummer(steder: Iterable<Sted>): Map<Ym, MaanedSum> {
  const m = new Map<Ym, MaanedSum>();
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (Number(t.dato.slice(0, 4)) < FORSTE_AAR) continue;
      const ym = t.dato.slice(0, 7);
      let r = m.get(ym);
      if (!r) m.set(ym, (r = { ym, alle: 0, ordinaer: tomFordeling() }));
      r.alle++;
      if (!t.oppfolging) leggTil(r.ordinaer, t.karakter);
    }
  }
  return m;
}

/** Månedene som har rapport, eldste først: fra FORSTE_AAR til siste ferdige måned, med minst ett ordinært tilsyn. */
export function rapportMaaneder(summer: Map<Ym, MaanedSum>, sluttDato: string): Ym[] {
  const siste = sisteRapportMaaned(sluttDato);
  return [...summer.values()]
    .filter((r) => r.ym <= siste && r.ordinaer.total > 0)
    .map((r) => r.ym)
    .sort();
}

/** Summen av ordinære tilsyn for månedene fra og med `fra` til og med `til`. */
export function periodeSum(summer: Map<Ym, MaanedSum>, fra: Ym, til: Ym): Fordeling {
  const f = tomFordeling();
  for (const r of summer.values()) {
    if (r.ym < fra || r.ym > til) continue;
    f.smil += r.ordinaer.smil;
    f.strek += r.ordinaer.strek;
    f.sur += r.ordinaer.sur;
    f.total += r.ordinaer.total;
  }
  return f;
}

export type RapportTilsyn = {
  sted: Sted;
  tilsyn: Tilsyn;
  /** Forrige ordinære tilsyn hos samme sted, eller null. */
  forrige: Tilsyn | null;
  /** Temaer med strekmunn eller sur munn (kortnavn). */
  anmerkninger: string[];
};

/** Ordinære tilsyn i måneden, nyeste først, med forrige ordinære tilsyn som fikk smilefjes. */
export function ordinaereIMaaned(steder: Iterable<Sted>, ym: Ym): RapportTilsyn[] {
  const ut: RapportTilsyn[] = [];
  for (const s of steder) {
    let forrige: Tilsyn | null = null;
    for (const t of s.tilsyn) {
      if (t.oppfolging) continue;
      if (t.dato.startsWith(ym)) ut.push({ sted: s, tilsyn: t, forrige, anmerkninger: anmerkninger(t) });
      if (smileFromKarakter(t.karakter)) forrige = t;
    }
  }
  return ut.sort((a, b) => b.tilsyn.dato.localeCompare(a.tilsyn.dato) || a.sted.navn.localeCompare(b.sted.navn, "nb"));
}

/**
 * «Comeback»: et ordinært tilsyn med smil der forrige ordinære tilsyn ga strekmunn eller sur munn.
 * Oppfølgingstilsyn i mellom teller ikke – de ender nesten alltid med smil – og et nytt ordinært tilsyn
 * innen MIN_COMEBACK_DAGER regnes heller ikke.
 * Sortert med de største snuoperasjonene først: fra sur munn før fra strekmunn, så karakter 0 før 1.
 */
export function comebacksIMaaned(maaned: readonly RapportTilsyn[]): RapportTilsyn[] {
  const fraVekt = (t: Tilsyn) => (smileFromKarakter(t.karakter) === "sur" ? 0 : 1);
  return maaned
    .filter((r) => {
      if (smileFromKarakter(r.tilsyn.karakter) !== "smil" || !r.forrige) return false;
      const før = smileFromKarakter(r.forrige.karakter);
      return (før === "strek" || før === "sur") && dagerMellom(r.forrige.dato, r.tilsyn.dato) >= MIN_COMEBACK_DAGER;
    })
    .sort(
      (a, b) =>
        fraVekt(a.forrige!) - fraVekt(b.forrige!) ||
        a.tilsyn.karakter - b.tilsyn.karakter ||
        b.tilsyn.dato.localeCompare(a.tilsyn.dato) ||
        a.sted.navn.localeCompare(b.sted.navn, "nb"),
    );
}

/**
 * Grupperer ordinære tilsyn fra og med `fra` til og med `til` (måneder) etter en nøkkel,
 * f.eks. kommunenr eller kjede. `steder` = antall ulike steder med tilsyn i perioden.
 */
export function grupperPeriode(
  steder: Iterable<Sted>,
  fra: Ym,
  til: Ym,
  nokkel: (s: Sted) => string | null,
): Map<string, Gruppe<string>> {
  const m = new Map<string, Gruppe<string>>();
  for (const s of steder) {
    const key = nokkel(s);
    if (key === null) continue;
    let telt = false;
    for (const t of s.tilsyn) {
      const ym = t.dato.slice(0, 7);
      if (ym < fra || ym > til) continue;
      let g = m.get(key);
      if (!g) m.set(key, (g = { key, steder: 0, tilsyn: 0, ordinaer: tomFordeling() }));
      if (!telt) {
        g.steder++;
        telt = true;
      }
      g.tilsyn++;
      if (!t.oppfolging) leggTil(g.ordinaer, t.karakter);
    }
  }
  return m;
}

/**
 * Best og svakest fra en rangert liste (best først). Hver side får høyst en tredjedel av listen,
 * så midtfeltet havner i ingen av dem. Under MIN_KOMMUNER_KAARING kandidater kåres ingen.
 */
export function bestOgSvakest<T>(rangert: readonly T[], n: number): { best: T[]; svakest: T[] } {
  const k = rangert.length < MIN_KOMMUNER_KAARING ? 0 : Math.min(n, Math.floor(rangert.length / 3));
  return { best: rangert.slice(0, k), svakest: k ? rangert.slice(-k).reverse() : [] };
}

export type Rapport = {
  ym: Ym;
  navn: string;
  /** Alle tilsyn i måneden, også oppfølging. */
  alle: number;
  ordinaer: Fordeling;
  /** Samme måned året før, hvis den finnes i datasettet. */
  fjor: { ym: Ym; ordinaer: Fordeling } | null;
  /** Hele landet de siste 12 månedene til og med denne. */
  snitt12: Fordeling;
  sur: RapportTilsyn[];
  strek: RapportTilsyn[];
  comebacks: RapportTilsyn[];
  /** Kommuner med minst MIN_KOMMUNE_MAANED ordinære tilsyn i måneden, best først. Nøkkel = kommunenr. */
  kommuner: Gruppe<string>[];
  /** Kjeder med minst MIN_KJEDE_12MND ordinære tilsyn siste 12 måneder, best først. Nøkkel = kjedeslug. */
  kjeder: Gruppe<string>[];
  /** Første måned i 12-månedersperioden. */
  fra12: Ym;
};

export function lagRapport(steder: readonly Sted[], summer: Map<Ym, MaanedSum>, ym: Ym): Rapport {
  const denne = summer.get(ym);
  const fjorYm = forrigeMaaned(ym, 12);
  const fjor = summer.get(fjorYm);
  const fra12 = forrigeMaaned(ym, 11);
  const maaned = ordinaereIMaaned(steder, ym);
  const med = (s: string) => maaned.filter((r) => smileFromKarakter(r.tilsyn.karakter) === s);
  return {
    ym,
    navn: maanedNavn(ym),
    alle: denne?.alle ?? 0,
    ordinaer: denne?.ordinaer ?? tomFordeling(),
    fjor: fjor && fjor.ordinaer.total > 0 ? { ym: fjorYm, ordinaer: fjor.ordinaer } : null,
    snitt12: periodeSum(summer, fra12, ym),
    sur: med("sur"),
    strek: med("strek"),
    comebacks: comebacksIMaaned(maaned),
    kommuner: rangerEtterSmil(grupperPeriode(steder, ym, ym, (s) => s.kommunenr).values(), MIN_KOMMUNE_MAANED),
    kjeder: rangerEtterSmil(grupperPeriode(steder, fra12, ym, (s) => s.kjedeSlug).values(), MIN_KJEDE_12MND),
    fra12,
  };
}

function flertall(n: number, en: string, flere: string): string {
  return `${n.toLocaleString("nb-NO")} ${n === 1 ? en : flere}`;
}

/** Ferdig sitat for pressen: hovedtallene i hele setninger, med kilde. */
export function sitatTekst(r: Rapport, url: string): string {
  const smil = andel(r.ordinaer, "smil");
  const mot: string[] = [];
  if (r.fjor) mot.push(`${prosent(andel(r.fjor.ordinaer, "smil"))} i ${maanedNavn(r.fjor.ym)}`);
  mot.push(`${prosent(andel(r.snitt12, "smil"))} i snitt de siste tolv månedene`);
  return [
    `I ${r.navn} ga Mattilsynet smilefjes ved ${flertall(r.ordinaer.total, "ordinært tilsyn", "ordinære tilsyn")} av serveringssteder.`,
    `${prosent(smil)} endte med smil, mot ${mot.join(" og ")}.`,
    `${flertall(r.sur.length, "tilsyn", "tilsyn")} endte med sur munn og ${r.strek.length.toLocaleString("nb-NO")} med strekmunn.`,
    `Kilde: Smilefjeskartet.no (${url}), basert på Mattilsynets åpne tilsynsdata.`,
  ].join(" ");
}

/** Endring i andel smil fra `fra` til `til`, i prosentpoeng. */
export function smilEndringPp(fra: Fordeling, til: Fordeling): number {
  return endringPp(andel(fra, "smil"), andel(til, "smil"));
}
