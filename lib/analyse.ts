/**
 * Rene aggregeringsfunksjoner for analysesiden og område-sidene (kommune, fylke, kjede).
 *
 * Nesten alle steder har smil ved siste tilsyn, fordi Mattilsynet kommer tilbake raskt etter
 * strekmunn/sur munn og oppfølgingen nesten alltid gir smil. Derfor bygger alle sammenligninger
 * her på ORDINÆRE tilsyn (oppfolging === false), med mindre noe annet står eksplisitt.
 */
import { smileFromKarakter, TEMAER } from "./smile";
import { andel, dagerMellom, tomFordeling, type Fordeling } from "./stats";
import type { Sted, Tilsyn } from "./types";

/** Første hele år i datasettet. 2015 har bare én løs rad og holdes utenfor tidsseriene. */
export const FORSTE_AAR = 2016;

export function leggTil(f: Fordeling, karakter: number): void {
  const s = smileFromKarakter(karakter);
  if (!s) return;
  f[s]++;
  f.total++;
}

export function slaaSammen(a: Fordeling, b: Fordeling): Fordeling {
  return { smil: a.smil + b.smil, strek: a.strek + b.strek, sur: a.sur + b.sur, total: a.total + b.total };
}

/** Andel ordinære tilsyn med strekmunn eller sur munn. */
export function anmerkningAndel(f: Fordeling): number {
  return f.total === 0 ? 0 : (f.strek + f.sur) / f.total;
}

/** Endring i prosentpoeng (b − a), avrundet til én desimal. */
export function endringPp(fra: number, til: number): number {
  return Math.round((til - fra) * 1000) / 10;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Siste tilsynsdato i datasettet (yyyy-mm-dd). */
export function sisteDato(steder: readonly Sted[]): string {
  let maks = "";
  for (const s of steder) {
    const d = s.tilsyn[s.tilsyn.length - 1]?.dato ?? "";
    if (d > maks) maks = d;
  }
  return maks;
}

/* ------------------------------------------------------------------ */
/* Per år                                                               */
/* ------------------------------------------------------------------ */

export type AarRad = {
  aar: number;
  /** Utfall av ordinære tilsyn. */
  ordinaer: Fordeling;
  /** Alle tilsyn (ordinære + oppfølging). */
  alle: number;
  oppfolging: number;
  /** Året er ikke ferdig i datasettet. */
  delvis: boolean;
};

/**
 * Tidsserie per år fra FORSTE_AAR til året for `sluttDato`. Året til sluttDato markeres som
 * delvis med mindre sluttDato er 31. desember.
 */
export function perAar(steder: Iterable<Sted>, sluttDato: string, fraAar = FORSTE_AAR): AarRad[] {
  const sluttAar = Number(sluttDato.slice(0, 4));
  const rader: AarRad[] = [];
  for (let aar = fraAar; aar <= sluttAar; aar++) {
    rader.push({ aar, ordinaer: tomFordeling(), alle: 0, oppfolging: 0, delvis: aar === sluttAar && !sluttDato.endsWith("-12-31") });
  }
  for (const s of steder) {
    for (const t of s.tilsyn) {
      const i = Number(t.dato.slice(0, 4)) - fraAar;
      const r = rader[i];
      if (!r) continue;
      r.alle++;
      if (t.oppfolging) r.oppfolging++;
      else leggTil(r.ordinaer, t.karakter);
    }
  }
  return rader;
}

/** Siste hele år (ikke delvis) i en tidsserie, eller null. */
export function sisteHeleAar(rader: readonly AarRad[]): AarRad | null {
  for (let i = rader.length - 1; i >= 0; i--) if (!rader[i].delvis) return rader[i];
  return null;
}

/**
 * Ordinære tilsyn i samme kalenderperiode (1. jan. til og med mm-dd) for et gitt år.
 * Brukes for å sammenligne «hittil i år» rettferdig med fjoråret.
 */
export function hittilIAar(steder: Iterable<Sted>, aar: number, tilMmDd: string): Fordeling {
  const f = tomFordeling();
  const fra = `${aar}-01-01`;
  const til = `${aar}-${tilMmDd}`;
  for (const s of steder) for (const t of s.tilsyn) if (!t.oppfolging && t.dato >= fra && t.dato <= til) leggTil(f, t.karakter);
  return f;
}

/* ------------------------------------------------------------------ */
/* Sesong                                                               */
/* ------------------------------------------------------------------ */

export type MaanedRad = { maaned: number; ordinaer: Fordeling; alle: number; aar: number };

/**
 * Per kalendermåned, kun hele år (fraAar..tilAar), slik at et delvis år ikke blåser opp
 * de første månedene. `alle` er gjennomsnittlig antall tilsyn per år i måneden.
 */
export function perMaaned(steder: Iterable<Sted>, fraAar: number, tilAar: number): MaanedRad[] {
  const antallAar = Math.max(1, tilAar - fraAar + 1);
  const rader = Array.from({ length: 12 }, (_, i) => ({ maaned: i + 1, ordinaer: tomFordeling(), alle: 0, aar: antallAar }));
  for (const s of steder) {
    for (const t of s.tilsyn) {
      const aar = Number(t.dato.slice(0, 4));
      if (aar < fraAar || aar > tilAar) continue;
      const r = rader[Number(t.dato.slice(5, 7)) - 1];
      r.alle++;
      if (!t.oppfolging) leggTil(r.ordinaer, t.karakter);
    }
  }
  for (const r of rader) r.alle = r.alle / antallAar;
  return rader;
}

/** Antall tilsyn per ukedag, mandag først. */
export function perUkedag(steder: Iterable<Sted>): number[] {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const s of steder) for (const t of s.tilsyn) n[(new Date(`${t.dato}T12:00:00Z`).getUTCDay() + 6) % 7]++;
  return n;
}

/* ------------------------------------------------------------------ */
/* Temaer                                                               */
/* ------------------------------------------------------------------ */

export type TemaRad = {
  indeks: number;
  /** Ordinære tilsyn der temaet fikk en karakter 0–3. */
  vurdert: number;
  /** Karakter 2 (brudd som må følges opp). */
  strek: number;
  /** Karakter 3 (alvorlige brudd). */
  sur: number;
  /** Blant ordinære tilsyn med strekmunn/sur munn: hvor ofte dette temaet hadde den dårligste karakteren. */
  feltSmilet: number;
};

export function temaStatistikk(steder: Iterable<Sted>): { rader: TemaRad[]; daarlige: number } {
  const rader: TemaRad[] = TEMAER.map((_, indeks) => ({ indeks, vurdert: 0, strek: 0, sur: 0, feltSmilet: 0 }));
  let daarlige = 0;
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (t.oppfolging) continue;
      t.temaer.forEach((k, i) => {
        if (k < 0 || k > 3) return;
        rader[i].vurdert++;
        if (k === 2) rader[i].strek++;
        if (k === 3) rader[i].sur++;
      });
      const smil = smileFromKarakter(t.karakter);
      if (smil === "strek" || smil === "sur") {
        const gradert = t.temaer.filter((k) => k >= 0 && k <= 3);
        if (gradert.length === 0) continue;
        daarlige++;
        const verst = Math.max(...gradert);
        t.temaer.forEach((k, i) => {
          if (k === verst) rader[i].feltSmilet++;
        });
      }
    }
  }
  return { rader, daarlige };
}

/** Andel ordinære tilsyn der temaet fikk karakter 2 eller 3, per tema og år. */
export function temaPerAar(
  steder: Iterable<Sted>,
  fraAar: number,
  tilAar: number,
): Array<{ aar: number; andel: number[]; vurdert: number[] }> {
  const rader = Array.from({ length: tilAar - fraAar + 1 }, (_, i) => ({ aar: fraAar + i, brudd: [0, 0, 0, 0], vurdert: [0, 0, 0, 0] }));
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (t.oppfolging) continue;
      const r = rader[Number(t.dato.slice(0, 4)) - fraAar];
      if (!r) continue;
      t.temaer.forEach((k, i) => {
        if (k < 0 || k > 3) return;
        r.vurdert[i]++;
        if (k >= 2) r.brudd[i]++;
      });
    }
  }
  return rader.map((r) => ({ aar: r.aar, vurdert: r.vurdert, andel: r.brudd.map((b, i) => (r.vurdert[i] ? b / r.vurdert[i] : 0)) }));
}

/* ------------------------------------------------------------------ */
/* Grupper (fylke, kommune, kategori, kjede)                            */
/* ------------------------------------------------------------------ */

export type Gruppe<K> = {
  key: K;
  steder: number;
  /** Alle tilsyn. */
  tilsyn: number;
  ordinaer: Fordeling;
};

/** Grupperer steder og teller ordinære tilsyn. Steder der nøkkelen er null, hoppes over. */
export function grupper<K>(steder: Iterable<Sted>, nokkel: (s: Sted) => K | null): Map<K, Gruppe<K>> {
  const m = new Map<K, Gruppe<K>>();
  for (const s of steder) {
    const key = nokkel(s);
    if (key === null) continue;
    let g = m.get(key);
    if (!g) m.set(key, (g = { key, steder: 0, tilsyn: 0, ordinaer: tomFordeling() }));
    g.steder++;
    g.tilsyn += s.tilsyn.length;
    for (const t of s.tilsyn) if (!t.oppfolging) leggTil(g.ordinaer, t.karakter);
  }
  return m;
}

/**
 * Sorterer grupper etter andel smil i ordinære tilsyn (best først), med minste utvalg.
 * Ved lik andel vinner den med flest tilsyn.
 */
export function rangerEtterSmil<K>(grupper: Iterable<Gruppe<K>>, minOrdinaere = 0): Gruppe<K>[] {
  return [...grupper]
    .filter((g) => g.ordinaer.total > 0 && g.ordinaer.total >= minOrdinaere)
    .sort((a, b) => andel(b.ordinaer, "smil") - andel(a.ordinaer, "smil") || b.ordinaer.total - a.ordinaer.total);
}

/**
 * 95 % Wilson-intervall for en andel. Brukes for å vise hvor usikre små utvalg er.
 */
export function wilson(suksess: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = suksess / n;
  const z2 = z * z;
  const senter = (p + z2 / (2 * n)) / (1 + z2 / n);
  const halv = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, senter - halv), Math.min(1, senter + halv)];
}

/* ------------------------------------------------------------------ */
/* Oppfølging                                                           */
/* ------------------------------------------------------------------ */

export type OppfolgingStat = {
  /** Antall tilsyn med dette resultatet som har et senere tilsyn. */
  n: number;
  medianDager: number | null;
  /** Andel som fikk nytt tilsyn innen 30 dager. */
  innen30: number;
  /** Andel der neste tilsyn ga smil. */
  nesteSmil: number;
};

/** Hvor raskt Mattilsynet kommer tilbake etter strekmunn og sur munn, og hvordan det går da. */
export function oppfolgingstid(steder: Iterable<Sted>): Record<"strek" | "sur", OppfolgingStat> {
  const dager: Record<"strek" | "sur", number[]> = { strek: [], sur: [] };
  const smil: Record<"strek" | "sur", number> = { strek: 0, sur: 0 };
  for (const s of steder) {
    for (let i = 0; i < s.tilsyn.length - 1; i++) {
      const r = smileFromKarakter(s.tilsyn[i].karakter);
      if (r !== "strek" && r !== "sur") continue;
      const neste = s.tilsyn[i + 1];
      dager[r].push(dagerMellom(s.tilsyn[i].dato, neste.dato));
      if (smileFromKarakter(neste.karakter) === "smil") smil[r]++;
    }
  }
  const stat = (r: "strek" | "sur"): OppfolgingStat => {
    const d = dager[r];
    return {
      n: d.length,
      medianDager: median(d),
      innen30: d.length ? d.filter((x) => x <= 30).length / d.length : 0,
      nesteSmil: d.length ? smil[r] / d.length : 0,
    };
  };
  return { strek: stat("strek"), sur: stat("sur") };
}

/* ------------------------------------------------------------------ */
/* Steder som skiller seg ut                                            */
/* ------------------------------------------------------------------ */

export type Comeback = {
  sted: Sted;
  /** Dato for siste sur munn. */
  surDato: string;
  /** Ordinære tilsyn med smil på rad etter den sure munnen (og ingen strek/sur siden). */
  smilPaaRad: number;
  sisteDato: string;
};

/**
 * «Comebacks»: steder som har hatt sur munn, men bare smil siden – sortert etter hvor
 * mange ordinære tilsyn på rad de har klart. Oppfølgingen rett etter teller ikke.
 */
export function comebacks(steder: Iterable<Sted>, minSmil = 3): Comeback[] {
  const ut: Comeback[] = [];
  for (const s of steder) {
    let surIdx = -1;
    for (let i = s.tilsyn.length - 1; i >= 0; i--) {
      if (smileFromKarakter(s.tilsyn[i].karakter) === "sur") {
        surIdx = i;
        break;
      }
    }
    if (surIdx < 0) continue;
    const etter = s.tilsyn.slice(surIdx + 1);
    if (etter.some((t) => smileFromKarakter(t.karakter) !== "smil")) continue;
    const smilPaaRad = etter.filter((t) => !t.oppfolging).length;
    if (smilPaaRad < minSmil) continue;
    ut.push({ sted: s, surDato: s.tilsyn[surIdx].dato, smilPaaRad, sisteDato: s.tilsyn[s.tilsyn.length - 1].dato });
  }
  return ut.sort(
    (a, b) => b.smilPaaRad - a.smilPaaRad || a.surDato.localeCompare(b.surDato) || a.sted.navn.localeCompare(b.sted.navn, "nb"),
  );
}

export type StedTall = { sted: Sted; ordinaer: Fordeling };

function ordinaerFor(s: Sted): Fordeling {
  const f = tomFordeling();
  for (const t of s.tilsyn) if (!t.oppfolging) leggTil(f, t.karakter);
  return f;
}

/** Steder med flest ordinære tilsyn der alle endte med smil. */
export function feilfrie(steder: Iterable<Sted>, min = 5): StedTall[] {
  const ut: StedTall[] = [];
  for (const s of steder) {
    const f = ordinaerFor(s);
    if (f.total >= min && f.smil === f.total) ut.push({ sted: s, ordinaer: f });
  }
  return ut.sort((a, b) => b.ordinaer.total - a.ordinaer.total || a.sted.tilsyn[0].dato.localeCompare(b.sted.tilsyn[0].dato));
}

/** Steder med flest ordinære tilsyn som endte med strekmunn eller sur munn. */
export function flestAnmerkninger(steder: Iterable<Sted>, min = 3): StedTall[] {
  const ut: StedTall[] = [];
  for (const s of steder) {
    const f = ordinaerFor(s);
    if (f.strek + f.sur >= min) ut.push({ sted: s, ordinaer: f });
  }
  return ut.sort(
    (a, b) =>
      b.ordinaer.strek + b.ordinaer.sur - (a.ordinaer.strek + a.ordinaer.sur) ||
      b.ordinaer.sur - a.ordinaer.sur ||
      a.sted.navn.localeCompare(b.sted.navn, "nb"),
  );
}

export type NyttTilsyn = { sted: Sted; tilsyn: Tilsyn };

/** Alle tilsyn de siste `dager` dagene (til og med sluttDato), nyeste først. */
export function sisteTilsynPeriode(steder: Iterable<Sted>, sluttDato: string, dager = 7): NyttTilsyn[] {
  const fra = new Date(Date.parse(sluttDato) - (dager - 1) * 86_400_000).toISOString().slice(0, 10);
  const ut: NyttTilsyn[] = [];
  for (const s of steder) for (const t of s.tilsyn) if (t.dato >= fra && t.dato <= sluttDato) ut.push({ sted: s, tilsyn: t });
  const rang = (t: Tilsyn) => (smileFromKarakter(t.karakter) === "sur" ? 0 : smileFromKarakter(t.karakter) === "strek" ? 1 : 2);
  return ut.sort(
    (a, b) => b.tilsyn.dato.localeCompare(a.tilsyn.dato) || rang(a.tilsyn) - rang(b.tilsyn) || a.sted.navn.localeCompare(b.sted.navn, "nb"),
  );
}

/* ------------------------------------------------------------------ */
/* Slugs og CSV                                                         */
/* ------------------------------------------------------------------ */

/**
 * Lager unike slugs. Navn som kolliderer (f.eks. Herøy i Nordland og Herøy i Møre og Romsdal)
 * får alle et suffiks, så ingen av dem «vinner» den korte slugen tilfeldig.
 */
export function unikeSlugs<T>(elementer: readonly T[], slug: (e: T) => string, reserve: (e: T) => string): Map<T, string> {
  const antall = new Map<string, number>();
  for (const e of elementer) antall.set(slug(e), (antall.get(slug(e)) ?? 0) + 1);
  const brukt = new Set<string>();
  const ut = new Map<T, string>();
  for (const e of elementer) {
    let s = antall.get(slug(e))! > 1 ? reserve(e) : slug(e);
    const base = s;
    for (let i = 2; brukt.has(s); i++) s = `${base}-${i}`;
    brukt.add(s);
    ut.set(e, s);
  }
  return ut;
}

function csvCelle(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV med komma som skilletegn og punktum som desimaltegn (lett å lese inn i verktøy). */
export function tilCsv(header: readonly string[], rader: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  return [header, ...rader].map((r) => r.map(csvCelle).join(",")).join("\n") + "\n";
}
