/**
 * Lokale undersider av en kommune: kategori i kommune (/kommune/oslo/sushi) og strøk i en by
 * (/kommune/oslo/grunerlokka). Rene funksjoner, så terskler, strøk-oppslag og nøkkeltall kan testes.
 *
 * Strøkene er avgrenset med postnumre, ikke med offisielle bydelsgrenser. Postnumre som ligger på
 * grensen mellom to strøk, er utelatt i stedet for å bli gjettet inn i ett av dem.
 */
import { leggTil } from "./analyse";
import type { Kategori } from "./classify";
import { smileFromKarakter } from "./smile";
import type { SmileyKind } from "./smiley";
import { tomFordeling, type Fordeling } from "./stats";
import type { Sted, Tilsyn } from "./types";

/** Minste antall steder for at en lokal side lages. Under dette blir siden for tynn. */
export const MIN_LOKAL_STEDER = 10;
/** Minste antall ordinære tilsyn for at en lokal side lages. */
export const MIN_LOKAL_ORDINAERE = 20;

export type LokalType = "kategori" | "strok";

export type Strok = {
  slug: string;
  navn: string;
  /** Navnet med riktig preposisjon: «på Grünerløkka», «i Bjørvika». */
  iNavn: string;
  postnr: readonly string[];
};

/** Postnumre fra og med `fra` til og med `til`, som firesifrede strenger. */
export function postnrSerie(fra: number, til: number): string[] {
  return Array.from({ length: til - fra + 1 }, (_, i) => String(fra + i).padStart(4, "0"));
}

const OSLO = "0301";

/**
 * Strøk per kommunenummer. Hvert postnummer hører til høyst ett strøk. Avgrensningen er kontrollert
 * mot gateadressene og koordinatene til stedene i datasettet.
 */
export const STROK: Readonly<Record<string, readonly Strok[]>> = {
  [OSLO]: [
    {
      slug: "sentrum",
      navn: "Sentrum",
      iNavn: "i sentrum",
      // Kvadraturen, Karl Johan, Stortinget, Youngstorget og Torggata. 0150 er utelatt: det dekker både
      // Akershusstranda, Operaen og Bjørvika og øyene i indre Oslofjord.
      postnr: ["0050", ...postnrSerie(151, 162), ...postnrSerie(164, 166), ...postnrSerie(179, 181), "0183", "0184"],
    },
    { slug: "gronland", navn: "Grønland", iNavn: "på Grønland", postnr: [...postnrSerie(185, 190), "0656"] },
    { slug: "bjorvika", navn: "Bjørvika", iNavn: "i Bjørvika", postnr: ["0191", "0194"] },
    { slug: "toyen", navn: "Tøyen", iNavn: "på Tøyen", postnr: ["0577", "0578", ...postnrSerie(650, 655)] },
    {
      slug: "gamlebyen",
      navn: "Gamlebyen og Vålerenga",
      iNavn: "i Gamlebyen og på Vålerenga",
      postnr: ["0192", "0196", ...postnrSerie(657, 659)],
    },
    { slug: "grunerlokka", navn: "Grünerløkka", iNavn: "på Grünerløkka", postnr: postnrSerie(550, 571) },
    { slug: "sagene-torshov", navn: "Sagene og Torshov", iNavn: "på Sagene og Torshov", postnr: postnrSerie(460, 479) },
    { slug: "nydalen", navn: "Nydalen", iNavn: "i Nydalen", postnr: postnrSerie(483, 485) },
    {
      slug: "st-hanshaugen",
      navn: "St. Hanshaugen",
      iNavn: "på St. Hanshaugen",
      // Bislett, Fagerborg, Fredensborg, Ila og Adamstuen.
      postnr: [...postnrSerie(168, 177), "0350", "0354", "0359", ...postnrSerie(450, 458)],
    },
    { slug: "majorstuen", navn: "Majorstuen", iNavn: "på Majorstuen", postnr: [...postnrSerie(355, 358), ...postnrSerie(361, 369)] },
    { slug: "frogner", navn: "Frogner", iNavn: "på Frogner", postnr: [...postnrSerie(253, 269), ...postnrSerie(271, 273)] },
    {
      slug: "aker-brygge",
      navn: "Aker Brygge og Vika",
      iNavn: "på Aker Brygge og i Vika",
      // Aker Brygge, Tjuvholmen, Filipstad og Vika.
      postnr: ["0250", "0251", "0252", "0270"],
    },
    { slug: "skoyen", navn: "Skøyen", iNavn: "på Skøyen", postnr: postnrSerie(274, 279) },
  ],
};

const strokOppslag = new Map<string, Strok>();
for (const [kommunenr, liste] of Object.entries(STROK)) {
  for (const s of liste) for (const p of s.postnr) strokOppslag.set(`${kommunenr}:${p}`, s);
}

/** Strøket et postnummer hører til i en kommune, eller null hvis det ikke er avgrenset. */
export function strokForPostnr(kommunenr: string | null, postnr: string): Strok | null {
  return kommunenr ? (strokOppslag.get(`${kommunenr}:${postnr}`) ?? null) : null;
}

export type LokalKategori = Exclude<Kategori, "annet">;

/** Tekster per kategori: overskrift («Sushi i Oslo») og flertall i løpende tekst («de 50 sushistedene»). */
export const KATEGORI_TEKST: Record<LokalKategori, { tittel: string; ubestemt: string; bestemt: string }> = {
  hotell: { tittel: "Hoteller", ubestemt: "hoteller", bestemt: "hotellene" },
  bakeri: { tittel: "Bakerier", ubestemt: "bakerier", bestemt: "bakeriene" },
  kafe: { tittel: "Kafeer", ubestemt: "kafeer", bestemt: "kafeene" },
  pizza: { tittel: "Pizza", ubestemt: "pizzasteder", bestemt: "pizzastedene" },
  sushi: { tittel: "Sushi", ubestemt: "sushisteder", bestemt: "sushistedene" },
  burger: { tittel: "Burger", ubestemt: "burgersteder", bestemt: "burgerstedene" },
  kebab: { tittel: "Kebab", ubestemt: "kebabsteder", bestemt: "kebabstedene" },
  asiatisk: { tittel: "Asiatisk mat", ubestemt: "asiatiske restauranter", bestemt: "de asiatiske restaurantene" },
  indisk: { tittel: "Indisk og nepalsk mat", ubestemt: "indiske og nepalske restauranter", bestemt: "de indiske og nepalske restaurantene" },
  meksikansk: { tittel: "Meksikansk mat", ubestemt: "meksikanske restauranter", bestemt: "de meksikanske restaurantene" },
  bar: { tittel: "Barer og puber", ubestemt: "barer og puber", bestemt: "barene og pubene" },
  gatekjokken: { tittel: "Gatekjøkken", ubestemt: "gatekjøkken", bestemt: "gatekjøkkenene" },
  kantine: { tittel: "Kantiner", ubestemt: "kantiner", bestemt: "kantinene" },
};

/** Postnumre som korte intervaller: ["0185", …, "0190", "0656"] → «0185–0190 og 0656». */
export function postnrTekst(postnr: readonly string[]): string {
  const tall = [...new Set(postnr.map(Number))].sort((a, b) => a - b);
  const deler: string[] = [];
  const fmt = (n: number) => String(n).padStart(4, "0");
  for (let i = 0; i < tall.length; ) {
    let j = i;
    while (j + 1 < tall.length && tall[j + 1] === tall[j] + 1) j++;
    deler.push(j === i ? fmt(tall[i]) : `${fmt(tall[i])}–${fmt(tall[j])}`);
    i = j + 1;
  }
  return deler.length > 1 ? `${deler.slice(0, -1).join(", ")} og ${deler[deler.length - 1]}` : (deler[0] ?? "");
}

export type LokalGruppe = {
  type: LokalType;
  kommunenr: string;
  /** Andre ledd i URL-en: kategorinøkkelen eller strøkets slug. */
  slug: string;
  /** Visningsnavn: «Sushi», «Kafeer» eller «Grünerløkka». */
  navn: string;
  kategori: LokalKategori | null;
  strok: Strok | null;
  steder: Sted[];
  ordinaer: Fordeling;
  tilsyn: number;
};

function nyGruppe(type: LokalType, kommunenr: string, slug: string, navn: string, kategori: LokalKategori | null, strok: Strok | null): LokalGruppe {
  return { type, kommunenr, slug, navn, kategori, strok, steder: [], ordinaer: tomFordeling(), tilsyn: 0 };
}

function leggTilSted(g: LokalGruppe, s: Sted): void {
  g.steder.push(s);
  g.tilsyn += s.tilsyn.length;
  for (const t of s.tilsyn) if (!t.oppfolging) leggTil(g.ordinaer, t.karakter);
}

/** Om en gruppe er stor nok til å få sin egen side. */
export function storNok(g: Pick<LokalGruppe, "steder" | "ordinaer">): boolean {
  return g.steder.length >= MIN_LOKAL_STEDER && g.ordinaer.total >= MIN_LOKAL_ORDINAERE;
}

/**
 * Alle lokale grupper over tersklene: kategori × kommune (uten «annet») og strøk × kommune.
 * Rekkefølge: kommunenummer, så type (kategori først), så flest steder.
 */
export function lokaleGrupper(steder: Iterable<Sted>): LokalGruppe[] {
  const m = new Map<string, LokalGruppe>();
  const hent = (key: string, lag: () => LokalGruppe) => {
    let g = m.get(key);
    if (!g) m.set(key, (g = lag()));
    return g;
  };
  for (const s of steder) {
    if (!s.kommunenr) continue;
    const nr = s.kommunenr;
    if (s.kategori !== "annet") {
      const kat = s.kategori;
      leggTilSted(hent(`${nr}:k:${kat}`, () => nyGruppe("kategori", nr, kat, KATEGORI_TEKST[kat].tittel, kat, null)), s);
    }
    const strok = strokForPostnr(nr, s.postnr);
    if (strok) leggTilSted(hent(`${nr}:s:${strok.slug}`, () => nyGruppe("strok", nr, strok.slug, strok.navn, null, strok)), s);
  }
  return [...m.values()]
    .filter(storNok)
    .sort(
      (a, b) =>
        a.kommunenr.localeCompare(b.kommunenr) ||
        (a.type === b.type ? 0 : a.type === "kategori" ? -1 : 1) ||
        b.steder.length - a.steder.length ||
        a.slug.localeCompare(b.slug),
    );
}

/* ------------------------------------------------------------------ */
/* Nøkkeltall                                                           */
/* ------------------------------------------------------------------ */

export type LokaltTilsyn = { sted: Sted; tilsyn: Tilsyn };

/** Dato ett år før `sluttDato` (yyyy-mm-dd). 29. februar blir 28. februar. */
export function ettAarFor(sluttDato: string): string {
  const aar = Number(sluttDato.slice(0, 4)) - 1;
  const mmdd = sluttDato.slice(5) === "02-29" ? "02-28" : sluttDato.slice(5);
  return `${aar}-${mmdd}`;
}

export type LokalStats = {
  /** Ordinære tilsyn de siste 12 månedene før sluttDato. */
  sisteAar: Fordeling;
  /** Ordinære tilsyn med strekmunn eller sur munn siste 12 måneder, sur munn først, så nyeste. */
  verste: LokaltTilsyn[];
  /** Steder der siste ordinære tilsyn i perioden var helt uten avvik (karakter 0), nyeste først. */
  beste: LokaltTilsyn[];
};

/**
 * Nylige høydepunkter og bunnpunkter for en gruppe steder. «Siste 12 måneder» regnes fra datasettets
 * siste tilsynsdato, ikke fra dagens dato, så siden ikke tømmes om data blir gamle.
 */
export function lokalStats(steder: Iterable<Sted>, sluttDato: string, antall = 8): LokalStats {
  const fra = ettAarFor(sluttDato);
  const sisteAar = tomFordeling();
  const verste: LokaltTilsyn[] = [];
  const beste: LokaltTilsyn[] = [];
  for (const sted of steder) {
    let sisteHer: Tilsyn | null = null;
    for (const t of sted.tilsyn) {
      if (t.oppfolging || t.dato <= fra || t.dato > sluttDato) continue;
      leggTil(sisteAar, t.karakter);
      const smil = smileFromKarakter(t.karakter);
      if (smil === "strek" || smil === "sur") verste.push({ sted, tilsyn: t });
      if (!sisteHer || t.dato >= sisteHer.dato) sisteHer = t;
    }
    // Bare steder der det nyeste ordinære tilsynet var feilfritt, så et sted med sur munn etterpå ikke listes som rent.
    if (sisteHer?.karakter === 0) beste.push({ sted, tilsyn: sisteHer });
  }
  const nyestFoerst = (a: LokaltTilsyn, b: LokaltTilsyn) => b.tilsyn.dato.localeCompare(a.tilsyn.dato) || a.sted.navn.localeCompare(b.sted.navn, "nb");
  verste.sort((a, b) => b.tilsyn.karakter - a.tilsyn.karakter || nyestFoerst(a, b));
  beste.sort(nyestFoerst);
  return { sisteAar, verste: verste.slice(0, antall), beste: beste.slice(0, antall) };
}

/* ------------------------------------------------------------------ */
/* Kartutsnitt                                                          */
/* ------------------------------------------------------------------ */

export type Utsnitt = [vest: number, sor: number, ost: number, nord: number];

function persentil(sortert: number[], p: number): number {
  return sortert[Math.min(sortert.length - 1, Math.max(0, Math.round((sortert.length - 1) * p)))];
}

/**
 * Kartutsnitt rundt stedene. Med minst 26 steder kuttes de ytterste 2 % i hver retning, så noen få
 * feilgeokodede steder ikke drar utsnittet ut over halve landet. Med færre steder tas alle med.
 * Null uten koordinater.
 */
export function utsnitt(steder: Iterable<Sted>): Utsnitt | null {
  const lng: number[] = [];
  const lat: number[] = [];
  for (const s of steder) {
    if (s.lng === null || s.lat === null) continue;
    lng.push(s.lng);
    lat.push(s.lat);
  }
  if (lng.length === 0) return null;
  lng.sort((a, b) => a - b);
  lat.sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 10_000) / 10_000;
  return [r(persentil(lng, 0.02)), r(persentil(lat, 0.02)), r(persentil(lng, 0.98)), r(persentil(lat, 0.98))];
}

/* ------------------------------------------------------------------ */
/* Sorterbar stedsliste                                                 */
/* ------------------------------------------------------------------ */

export type SorterbarRad = {
  slug: string;
  navn: string;
  kind: SmileyKind;
  label: string;
  under: string;
  /** Dato for siste tilsyn (yyyy-mm-dd). */
  siste: string;
  /** Ordinære tilsyn med smil og totalt. */
  smil: number;
  total: number;
};

export const SORTERING = {
  siste: "Sist inspisert",
  daarligst: "Lavest andel smil",
  best: "Høyest andel smil",
  navn: "Navn",
} as const;

export type Sortering = keyof typeof SORTERING;

const andel = (r: SorterbarRad) => (r.total ? r.smil / r.total : -1);
const navn = (a: SorterbarRad, b: SorterbarRad) => a.navn.localeCompare(b.navn, "nb");

export function sorterSteder(rader: readonly SorterbarRad[], etter: Sortering): SorterbarRad[] {
  const l = [...rader];
  if (etter === "navn") return l.sort(navn);
  if (etter === "siste") return l.sort((a, b) => b.siste.localeCompare(a.siste) || navn(a, b));
  // Steder uten ordinære tilsyn havner alltid nederst.
  const ukjent = (r: SorterbarRad) => (r.total ? 0 : 1);
  const retning = etter === "best" ? -1 : 1;
  return l.sort((a, b) => ukjent(a) - ukjent(b) || retning * (andel(a) - andel(b)) || b.total - a.total || navn(a, b));
}
