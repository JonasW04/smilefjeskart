/**
 * «Gjett smilefjeset» (/quiz): fem ekte serveringssteder per dag, og spilleren gjetter
 * smilefjeset fra siste ordinære tilsyn. Alt her er rene funksjoner som kjører både på
 * serveren (utvalg ved bygging) og i nettleseren (øvingsrunder, deling, rekker).
 *
 * Utvalget er deterministisk: samme dato og samme data gir de samme fem stedene for alle.
 * Nye data kan likevel flytte et sted inn i toppen av rangeringen, så den daglige datajobben
 * fryser utvalget for i dag og i morgen i generated/quiz.json (se frysQuizer). En frosset dag
 * regnes aldri ut på nytt, så alle som spiller samme dag, får de samme stedene og svarene.
 */
import type { Kategori } from "./classify";
import { SMILES, smileFromKarakter, TEMAER, type Smile } from "./smile";
import { dagerMellom, formatDato } from "./stats";
import type { Sted } from "./types";

/** Antall steder per runde. */
export const QUIZ_LENGDE = 5;

/** Bare steder med ordinært tilsyn de siste tre årene, så resultatet fortsatt sier noe. */
export const QUIZ_VINDU_DAGER = 3 * 365;

/** Kommuner med minst så mange steder regnes som by, og stedene der trekkes oftere. */
export const STORBY_MIN_STEDER = 100;

/** Et sted slik quizen trenger det: siste ordinære tilsyn og litt historikk til forklaringen. */
export type QuizSted = {
  slug: string;
  navn: string;
  adresse: string;
  kommunenr: string;
  kommune: string;
  fylke: string | null;
  kategori: Kategori;
  kjede: string | null;
  /** Dato for siste ordinære tilsyn (yyyy-mm-dd). */
  dato: string;
  /** Smilefjeset fra siste ordinære tilsyn: svaret. */
  fasit: Smile;
  /** Temaer med strekmunn eller sur munn ved det tilsynet (kortnavn). */
  anmerkninger: string[];
  /** Antall ordinære tilsyn til og med det siste. */
  antall: number;
  /** Smil på rad ved ordinære tilsyn, talt bakover fra det siste (0 hvis det siste ikke ga smil). */
  smilPaRad: number;
  /** Smilefjeset ved ordinære tilsyn før det siste, eller null for første tilsyn. */
  forrige: Smile | null;
  /** Første oppfølgingstilsyn etter det ordinære tilsynet, hvis det har vært et. */
  oppfolging: { dato: string; smil: Smile } | null;
  /** Ligger i en kommune med minst STORBY_MIN_STEDER steder. */
  storby: boolean;
};

/** "2026-11-19" + 1 → "2026-11-20". */
export function leggTilDager(iso: string, dager: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dager)).toISOString().slice(0, 10);
}

/** Datoen i Norge (Europe/Oslo) som yyyy-mm-dd. Quizen bytter ved midnatt norsk tid. */
export function osloDato(naa: Date): string {
  const deler = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(naa);
  const del = (type: string) => deler.find((p) => p.type === type)?.value ?? "";
  return `${del("year")}-${del("month")}-${del("day")}`;
}

/**
 * Sekunder til neste quiz (midnatt i Norge). Regner ut fra klokkeslettet i Oslo, så natten
 * sommertiden starter eller slutter, bommer nedtellingen med en time.
 */
export function sekunderTilNesteQuiz(naa: Date): number {
  const deler = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(naa);
  const tall = (type: string) => Number(deler.find((p) => p.type === type)?.value ?? 0);
  return 86_400 - (tall("hour") * 3600 + tall("minute") * 60 + tall("second"));
}

/** Temaene som trakk ned: karakter 2 (strek) eller 3 (sur). */
function temaAnmerkninger(temaer: readonly number[]): string[] {
  return TEMAER.filter((_, i) => temaer[i] === 2 || temaer[i] === 3).map((t) => t.kort);
}

/**
 * Alle steder som kan være med i quizen på en gitt dato. Bare tilsyn til og med datoen
 * telles, så en dato regnes likt i byggene før og etter den.
 */
export function quizKandidater(steder: readonly Sted[], dato: string): QuizSted[] {
  const fra = leggTilDager(dato, -QUIZ_VINDU_DAGER);
  const perKommune = new Map<string, number>();
  for (const s of steder) {
    if (s.kommunenr) perKommune.set(s.kommunenr, (perKommune.get(s.kommunenr) ?? 0) + 1);
  }

  const ut: QuizSted[] = [];
  for (const s of steder) {
    if (!s.kommunenr || !s.kommune) continue;
    const tidligere = s.tilsyn.filter((t) => t.dato <= dato);
    const ordinaere = tidligere.filter((t) => !t.oppfolging);
    const siste = ordinaere[ordinaere.length - 1];
    if (!siste || siste.dato < fra) continue;
    const fasit = smileFromKarakter(siste.karakter);
    if (!fasit) continue;

    let smilPaRad = 0;
    for (let i = ordinaere.length - 1; i >= 0 && smileFromKarakter(ordinaere[i].karakter) === "smil"; i--) smilPaRad++;
    const etter = tidligere.find((t) => t.oppfolging && t.dato > siste.dato && smileFromKarakter(t.karakter));

    ut.push({
      slug: s.slug,
      navn: s.navn,
      adresse: s.adresse,
      kommunenr: s.kommunenr,
      kommune: s.kommune,
      fylke: s.fylke,
      kategori: s.kategori,
      kjede: s.kjede,
      dato: siste.dato,
      fasit,
      anmerkninger: temaAnmerkninger(siste.temaer),
      antall: ordinaere.length,
      smilPaRad,
      forrige: ordinaere.length > 1 ? smileFromKarakter(ordinaere[ordinaere.length - 2].karakter) : null,
      oppfolging: etter ? { dato: etter.dato, smil: smileFromKarakter(etter.karakter)! } : null,
      storby: (perKommune.get(s.kommunenr) ?? 0) >= STORBY_MIN_STEDER,
    });
  }
  return ut;
}

/**
 * Hvor gjerne et sted trekkes. Steder i byene og kjedesteder er lettere å kjenne igjen,
 * steder med flere tilsyn har en historie å fortelle, og kantiner er sjelden åpne for folk flest.
 */
export function quizVekt(q: QuizSted, dato: string): number {
  let w = 1;
  if (q.storby) w *= 3;
  if (q.kjede) w *= 2;
  if (q.antall >= 3) w *= 1.5;
  if (q.kategori === "kantine") w *= 0.3;
  if (dagerMellom(q.dato, dato) > 548) w *= 0.5;
  return w;
}

/** FNV-1a med murmur3-finalisering: rask, stabil 32-bits hash av en streng. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash til et tall i (0, 1). */
function enhet(s: string): number {
  return (hash32(s) + 0.5) / 4_294_967_296;
}

/**
 * Fordelingen av smil, strekmunn og sur munn i en runde, i rekkefølgen [smil, strek, sur].
 * Ekte tilsyn gir smil over ni av ti ganger, så runden blandes for å bli spennende. Blandingen
 * varierer fra dag til dag, så det lønner seg ikke å telle seg fram til svaret.
 */
export const KOMPOSISJONER: ReadonlyArray<readonly [number, number, number]> = [
  [2, 2, 1],
  [2, 2, 1],
  [2, 2, 1],
  [3, 1, 1],
  [3, 1, 1],
  [2, 1, 2],
  [1, 2, 2],
  [1, 3, 1],
  [3, 2, 0],
  [2, 3, 0],
];

/**
 * Velger fem steder deterministisk ut fra frøet. Hver karakter fylles fra sine beste
 * kandidater etter vektet hash-rangering. Mangler det steder med en karakter (en liten
 * kommune uten sur munn), fylles runden opp med de neste i rangeringen. Maks ett sted per kjede.
 */
export function velgQuiz(kandidater: readonly QuizSted[], fro: string, dato: string): QuizSted[] {
  const rangert = kandidater
    .map((q) => ({ q, r: -Math.log(enhet(`${fro}|${q.slug}`)) / quizVekt(q, dato) }))
    .sort((a, b) => a.r - b.r || (a.q.slug < b.q.slug ? -1 : 1))
    .map((x) => x.q);
  const blanding = KOMPOSISJONER[hash32(`${fro}|blanding`) % KOMPOSISJONER.length];

  const valgt: QuizSted[] = [];
  const brukt = new Set<string>();
  const kjeder = new Set<string>();
  const ledig = (q: QuizSted) => !brukt.has(q.slug) && !(q.kjede && kjeder.has(q.kjede));
  const ta = (q: QuizSted) => {
    valgt.push(q);
    brukt.add(q.slug);
    if (q.kjede) kjeder.add(q.kjede);
  };

  SMILES.forEach((smil, i) => {
    let igjen = blanding[i];
    for (const q of rangert) {
      if (igjen === 0) break;
      if (q.fasit === smil && ledig(q)) {
        ta(q);
        igjen--;
      }
    }
  });
  for (const q of rangert) {
    if (valgt.length >= QUIZ_LENGDE) break;
    if (ledig(q)) ta(q);
  }
  for (const q of rangert) {
    if (valgt.length >= QUIZ_LENGDE) break;
    if (!brukt.has(q.slug)) ta(q);
  }

  const plass = (q: QuizSted) => enhet(`${fro}|rekkefolge|${q.slug}`);
  return valgt.sort((a, b) => plass(a) - plass(b));
}

/** Dagens fem steder, regnet ut fra dataene slik de er nå. */
export function dagensQuiz(kandidater: readonly QuizSted[], dato: string): QuizSted[] {
  return velgQuiz(kandidater, `dag:${dato}`, dato);
}

/** Frosne dagsquizer, nøkkel = dato i Norge. Lagres i generated/quiz.json. */
export type FrosneQuizer = Record<string, QuizSted[]>;

/** Hvor mange dager datajobben fryser framover: i dag og i morgen. */
export const FRYS_DAGER = 2;
/** Frosne dager eldre enn dette slettes fra fila. */
export const FRYS_BEHOLD_DAGER = 14;

/**
 * Legger til dagsquizer for i dag og i morgen som ikke er frosset ennå, og sletter gamle.
 * Dager som allerede er frosset, beholdes uendret selv om dataene har endret seg siden.
 */
export function frysQuizer(frosne: FrosneQuizer, steder: readonly Sted[], iDag: string): FrosneQuizer {
  const fra = leggTilDager(iDag, -FRYS_BEHOLD_DAGER);
  const ut: FrosneQuizer = {};
  for (const [dato, quiz] of Object.entries(frosne)) if (dato >= fra) ut[dato] = quiz;
  for (let i = 0; i < FRYS_DAGER; i++) {
    const dato = leggTilDager(iDag, i);
    ut[dato] ??= dagensQuiz(quizKandidater(steder, dato), dato);
  }
  return Object.fromEntries(Object.entries(ut).sort(([a], [b]) => a.localeCompare(b)));
}

/** Dagsquizene for datoene: frosne der de finnes, ellers regnet ut fra dataene nå. */
export function quizerForDatoer(frosne: FrosneQuizer, steder: readonly Sted[], datoer: readonly string[]): FrosneQuizer {
  return Object.fromEntries(
    datoer.map((dato) => [dato, frosne[dato]?.length === QUIZ_LENGDE ? frosne[dato] : dagensQuiz(quizKandidater(steder, dato), dato)]),
  );
}

// ------------------------------------------------------------------ //
// Svar, poeng og deling                                                //
// ------------------------------------------------------------------ //

export type Runde = { fasit: Smile; gjett: Smile };

const STEG: Record<Smile, number> = { smil: 0, strek: 1, sur: 2 };

/** 😀 riktig, 😐 ett hakk unna, 😠 helt bom (smil mot sur munn). Røper ikke svarene. */
export function treffEmoji(r: Runde): string {
  const avstand = Math.abs(STEG[r.fasit] - STEG[r.gjett]);
  return avstand === 0 ? "😀" : avstand === 1 ? "😐" : "😠";
}

export function poengsum(runder: readonly Runde[]): number {
  return runder.filter((r) => r.fasit === r.gjett).length;
}

export type QuizModus = { type: "dag" } | { type: "ovelse"; omrade: string | null };

/** «😀😀😐😠😀 3/5 på dagens Smilefjes-quiz! smilefjeskartet.no/quiz» */
export function delingstekst(runder: readonly Runde[], modus: QuizModus = { type: "dag" }): string {
  const rad = runder.map(treffEmoji).join("");
  const poeng = `${poengsum(runder)}/${runder.length}`;
  if (modus.type === "dag") return `${rad} ${poeng} på dagens Smilefjes-quiz! smilefjeskartet.no/quiz`;
  const hvor = modus.omrade ? `øvingsrunde: ${modus.omrade}` : "øvingsrunde";
  return `${rad} ${poeng} på Smilefjes-quizen (${hvor})! smilefjeskartet.no/quiz`;
}

/** Dager på rad med fullført dagsquiz, til og med i dag (eller i går, hvis dagens ikke er tatt ennå). */
export function quizRekke(historikk: Readonly<Record<string, number>>, iDag: string): number {
  let dag = iDag in historikk ? iDag : leggTilDager(iDag, -1);
  let rekke = 0;
  while (dag in historikk) {
    rekke++;
    dag = leggTilDager(dag, -1);
  }
  return rekke;
}

const SMIL_TEKST: Record<Smile, string> = { smil: "smil", strek: "strekmunn", sur: "sur munn" };

/** Kort forklaring etter at svaret er avslørt: hva som trakk ned, rekker og oppfølging. */
export function quizKontekst(q: QuizSted): string[] {
  const linjer: string[] = [];
  if (q.anmerkninger.length > 0) linjer.push(`Trakk ned: ${q.anmerkninger.join(", ")}.`);
  if (q.fasit === "smil") {
    if (!q.forrige) linjer.push("Første ordinære tilsyn, og rett inn med smil.");
    else if (q.forrige !== "smil") linjer.push(`Comeback! Hadde ${SMIL_TEKST[q.forrige]} gangen før.`);
    else if (q.smilPaRad >= 2) linjer.push(`${q.smilPaRad} smil på rad ved ordinære tilsyn.`);
    return linjer;
  }
  if (!q.forrige) linjer.push("Første ordinære tilsyn for stedet.");
  else if (q.forrige === q.fasit) linjer.push(`Hadde ${SMIL_TEKST[q.forrige]} gangen før også.`);
  else linjer.push(`Hadde ${SMIL_TEKST[q.forrige]} gangen før.`);
  if (q.oppfolging) linjer.push(`Fikk ${SMIL_TEKST[q.oppfolging.smil]} på oppfølgingstilsynet ${formatDato(q.oppfolging.dato)}.`);
  else linjer.push("Ingen oppfølgingstilsyn i dataene ennå.");
  return linjer;
}

// ------------------------------------------------------------------ //
// Kompakt format for øvingsrundene (/quiz/steder.json)                 //
// ------------------------------------------------------------------ //

type QuizRad = [
  slug: string,
  navn: string,
  adresse: string,
  kommuneIdx: number,
  kategori: Kategori,
  kjede: string,
  dato: string,
  fasit: number,
  anmerkninger: number,
  antall: number,
  smilPaRad: number,
  forrige: number,
  oppfolgingDato: string,
  oppfolgingSmil: number,
  storby: 0 | 1,
];

export type QuizData = {
  v: 1;
  /** Datoen kandidatene er regnet ut for. */
  dato: string;
  kommuner: Array<[nr: string, navn: string, fylke: string]>;
  rader: QuizRad[];
};

const smilIdx = (s: Smile | null) => (s ? SMILES.indexOf(s) : -1);
const smilFra = (i: number): Smile | null => SMILES[i] ?? null;

export function kodQuizData(kandidater: readonly QuizSted[], dato: string): QuizData {
  const kommuner: QuizData["kommuner"] = [];
  const idx = new Map<string, number>();
  const rader = kandidater.map((q): QuizRad => {
    let k = idx.get(q.kommunenr);
    if (k === undefined) {
      k = kommuner.push([q.kommunenr, q.kommune, q.fylke ?? ""]) - 1;
      idx.set(q.kommunenr, k);
    }
    const maske = TEMAER.reduce((m, t, i) => (q.anmerkninger.includes(t.kort) ? m | (1 << i) : m), 0);
    return [
      q.slug,
      q.navn,
      q.adresse,
      k,
      q.kategori,
      q.kjede ?? "",
      q.dato,
      smilIdx(q.fasit),
      maske,
      q.antall,
      q.smilPaRad,
      smilIdx(q.forrige),
      q.oppfolging?.dato ?? "",
      smilIdx(q.oppfolging?.smil ?? null),
      q.storby ? 1 : 0,
    ];
  });
  return { v: 1, dato, kommuner, rader };
}

export function lesQuizData(data: QuizData): QuizSted[] {
  return data.rader.map((r) => {
    const [nr, kommune, fylke] = data.kommuner[r[3]];
    const oppf = smilFra(r[13]);
    return {
      slug: r[0],
      navn: r[1],
      adresse: r[2],
      kommunenr: nr,
      kommune,
      fylke: fylke || null,
      kategori: r[4],
      kjede: r[5] || null,
      dato: r[6],
      fasit: smilFra(r[7])!,
      anmerkninger: TEMAER.filter((_, i) => r[8] & (1 << i)).map((t) => t.kort),
      antall: r[9],
      smilPaRad: r[10],
      forrige: smilFra(r[11]),
      oppfolging: r[12] && oppf ? { dato: r[12], smil: oppf } : null,
      storby: r[14] === 1,
    };
  });
}

// ------------------------------------------------------------------ //
// Lagring i nettleseren                                                //
// ------------------------------------------------------------------ //

export type DagLagret = { dato: string; steder: QuizSted[]; gjett: Smile[] };
export type QuizLagret = { dag: DagLagret | null; historikk: Record<string, number> };

const erSmil = (x: unknown): x is Smile => typeof x === "string" && (SMILES as readonly string[]).includes(x);

/** Leser lagret quiztilstand. Ugyldig eller manglende innhold gir en tom tilstand. */
export function lesLagret(raa: string | null): QuizLagret {
  const tom: QuizLagret = { dag: null, historikk: {} };
  if (!raa) return tom;
  try {
    const x = JSON.parse(raa) as Partial<QuizLagret>;
    const historikk: Record<string, number> = {};
    if (x.historikk && typeof x.historikk === "object") {
      for (const [d, p] of Object.entries(x.historikk)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isInteger(p)) historikk[d] = p;
      }
    }
    const d = x.dag;
    const dag =
      d &&
      typeof d.dato === "string" &&
      Array.isArray(d.steder) &&
      d.steder.length === QUIZ_LENGDE &&
      d.steder.every((s) => s && typeof s.slug === "string" && erSmil(s.fasit)) &&
      Array.isArray(d.gjett) &&
      d.gjett.length <= QUIZ_LENGDE &&
      d.gjett.every(erSmil)
        ? d
        : null;
    return { dag, historikk };
  } catch {
    return tom;
  }
}

/** Beholder historikken for det siste året, så lagringen ikke vokser for alltid. */
export function trimHistorikk(historikk: Record<string, number>, iDag: string): Record<string, number> {
  const fra = leggTilDager(iDag, -400);
  return Object.fromEntries(Object.entries(historikk).filter(([d]) => d >= fra));
}
