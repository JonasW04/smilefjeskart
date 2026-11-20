/**
 * Kildene kategoriForSted bruker i tillegg til navnet: næringskode og navn fra Enhetsregisteret (oppslag på
 * organisasjonsnummeret Mattilsynet oppgir) og type og kjøkken fra OpenStreetMap (samme navn på samme sted).
 *
 * Svarene lagres i generated/kilder/ og sjekkes inn, så `npm run reclassify` og testene gir samme kategori uten nett.
 * build:data henter nye organisasjonsnumre hver dag og alt på nytt når filene er eldre enn OPPFRISK_DAGER.
 */
import fs from "node:fs";
import path from "node:path";
import type { Kilder } from "../../lib/classify";
import { asciiFold } from "../../lib/text";

/** Det vi bruker fra Enhetsregisteret per organisasjonsnummer. */
export type BrregPost = { kode: string | null; navn: string; aktivitet: string | null };
export type BrregFil = { hentet: string; enheter: Record<string, BrregPost> };

/** [lat, lon, navn, type, cuisine] */
export type OsmPost = [number, number, string, string, string | null];
export type OsmFil = { hentet: string; steder: OsmPost[] };

export const KILDE_DIR = path.join(process.cwd(), "generated", "kilder");
const BRREG_PATH = path.join(KILDE_DIR, "brreg.json");
const OSM_PATH = path.join(KILDE_DIR, "osm.json");
const OPPFRISK_DAGER = 7;

const BRREG_API = "https://data.brreg.no/enhetsregisteret/api";
const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const OVERPASS_QUERY = `[out:json][timeout:240];
area["ISO3166-1"="NO"][admin_level=2]->.no;
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|pub|bar|ice_cream|food_court|biergarten)$"]["name"](area.no);
  nwr["shop"~"^(bakery|pastry|confectionery)$"]["name"](area.no);
  nwr["tourism"~"^(hotel|motel|hostel|guest_house)$"]["name"](area.no);
);
out center tags;`;

// ---------------------------------------------------------------------------
// Lesing og skriving
// ---------------------------------------------------------------------------

export function lesKilder(): { brreg: BrregFil; osm: OsmFil } {
  const les = <T>(p: string, tom: T): T => (fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : tom);
  return {
    brreg: les<BrregFil>(BRREG_PATH, { hentet: "", enheter: {} }),
    osm: les<OsmFil>(OSM_PATH, { hentet: "", steder: [] }),
  };
}

/** Én post per linje og sortert, så de daglige diffene bare viser endringene. */
function skrivBrreg(f: BrregFil) {
  fs.mkdirSync(KILDE_DIR, { recursive: true });
  const linjer = Object.keys(f.enheter)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(f.enheter[k])}`);
  fs.writeFileSync(BRREG_PATH, `{"hentet":${JSON.stringify(f.hentet)},"enheter":{\n${linjer.join(",\n")}\n}}\n`, "utf8");
}

function skrivOsm(f: OsmFil) {
  fs.mkdirSync(KILDE_DIR, { recursive: true });
  const linjer = [...f.steder]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]))
    .map((p) => JSON.stringify(p));
  fs.writeFileSync(OSM_PATH, `{"hentet":${JSON.stringify(f.hentet)},"steder":[\n${linjer.join(",\n")}\n]}\n`, "utf8");
}

const eldreEnn = (iso: string, dager: number, naa: Date) =>
  !iso || naa.getTime() - new Date(iso).getTime() > dager * 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
// Henting
// ---------------------------------------------------------------------------

type BrregEnhet = {
  organisasjonsnummer: string;
  navn: string;
  overordnetEnhet?: string;
  naeringskode1?: { kode: string };
  aktivitet?: string[];
  vedtektsfestetFormaal?: string[];
};

async function hentBrreg(type: "enheter" | "underenheter", orgnr: string[]): Promise<Map<string, BrregEnhet>> {
  const ut = new Map<string, BrregEnhet>();
  for (let i = 0; i < orgnr.length; i += 100) {
    const del = orgnr.slice(i, i + 100);
    const res = await fetch(`${BRREG_API}/${type}?organisasjonsnummer=${del.join(",")}&size=100`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Enhetsregisteret svarte HTTP ${res.status}`);
    const body = (await res.json()) as { _embedded?: Record<string, BrregEnhet[]> };
    for (const e of body._embedded?.[type] ?? []) ut.set(e.organisasjonsnummer, e);
  }
  return ut;
}

const aktivitetTekst = (e: BrregEnhet | undefined) => {
  const t = [...new Set([...(e?.aktivitet ?? []), ...(e?.vedtektsfestetFormaal ?? [])])].join(" ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : null;
};

/**
 * Slår opp organisasjonsnumrene. Mattilsynet oppgir som regel underenheten (selve utsalget), men noen steder
 * har hovedenhetens nummer. Aktiviteten står bare på hovedenheten.
 */
async function hentBrregPoster(orgnr: string[]): Promise<Record<string, BrregPost>> {
  const under = await hentBrreg("underenheter", orgnr);
  const hovedNr = new Set<string>();
  for (const nr of orgnr) {
    const u = under.get(nr);
    if (!u) hovedNr.add(nr);
    else if (u.overordnetEnhet) hovedNr.add(u.overordnetEnhet);
  }
  const hoved = await hentBrreg("enheter", [...hovedNr]);
  const ut: Record<string, BrregPost> = {};
  for (const nr of orgnr) {
    const u = under.get(nr);
    const e = u ? hoved.get(u.overordnetEnhet ?? "") : hoved.get(nr);
    const kilde = u ?? e;
    if (!kilde) continue;
    ut[nr] = { kode: kilde.naeringskode1?.kode ?? null, navn: kilde.navn, aktivitet: aktivitetTekst(e) };
  }
  return ut;
}

async function hentOsm(): Promise<OsmPost[]> {
  const res = await fetch(OVERPASS_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "smilefjeskart-databygg" },
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass svarte HTTP ${res.status}`);
  const body = (await res.json()) as {
    elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
  };
  const ut: OsmPost[] = [];
  for (const e of body.elements) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const t = e.tags ?? {};
    const type = t.amenity ?? t.shop ?? t.tourism;
    if (lat === undefined || lon === undefined || !t.name || !type) continue;
    ut.push([Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, t.name, type, t.cuisine ?? null]);
  }
  return ut;
}

/**
 * Oppdaterer generated/kilder/ og returnerer innholdet. Feiler en kilde, brukes forrige versjon, så en treg
 * Overpass-server aldri stopper den daglige jobben.
 */
export async function oppdaterKilder(
  orgnr: string[],
  { naa = new Date(), tving = false }: { naa?: Date; tving?: boolean } = {},
): Promise<{ brreg: BrregFil; osm: OsmFil }> {
  const { brreg, osm } = lesKilder();
  const unike = [...new Set(orgnr)];

  const manglende = () => unike.filter((nr) => !(nr in brreg.enheter));
  let fullOppfrisking = tving || eldreEnn(brreg.hentet, OPPFRISK_DAGER, naa);
  if (fullOppfrisking) {
    try {
      const nye = await hentBrregPoster(unike);
      if (Object.keys(nye).length < unike.length * 0.9) {
        throw new Error(`bare ${Object.keys(nye).length} av ${unike.length} organisasjonsnumre funnet`);
      }
      brreg.enheter = nye;
      brreg.hentet = naa.toISOString();
      skrivBrreg(brreg);
      console.log(`Enhetsregisteret: ${Object.keys(nye).length} av ${unike.length} organisasjonsnumre hentet`);
    } catch (e) {
      console.warn(`Enhetsregisteret: full oppfrisking feilet, henter bare nye (${e instanceof Error ? e.message : e})`);
      fullOppfrisking = false;
    }
  }
  // Nye organisasjonsnumre hentes hver dag, også når den fulle oppfriskingen feiler.
  const hent = fullOppfrisking ? [] : manglende();
  if (hent.length > 0) {
    try {
      const nye = await hentBrregPoster(hent);
      brreg.enheter = { ...brreg.enheter, ...nye };
      skrivBrreg(brreg);
      console.log(`Enhetsregisteret: ${Object.keys(nye).length} av ${hent.length} nye organisasjonsnumre hentet`);
    } catch (e) {
      console.warn(`Enhetsregisteret: bruker lagret versjon (${e instanceof Error ? e.message : e})`);
    }
  }

  if (tving || eldreEnn(osm.hentet, OPPFRISK_DAGER, naa)) {
    try {
      const steder = await hentOsm();
      if (steder.length < Math.max(5000, osm.steder.length * 0.8)) {
        throw new Error(`mistenkelig få steder (${steder.length})`);
      }
      osm.steder = steder;
      osm.hentet = naa.toISOString();
      skrivOsm(osm);
      console.log(`OpenStreetMap: ${steder.length} steder hentet`);
    } catch (e) {
      console.warn(`OpenStreetMap: bruker lagret versjon (${e instanceof Error ? e.message : e})`);
    }
  }

  return { brreg, osm };
}

// ---------------------------------------------------------------------------
// Kobling sted → kilder
// ---------------------------------------------------------------------------

/** Ord som ikke skiller steder fra hverandre. Stedsnavn (poststed, kommune) fjernes i tillegg per sted. */
const FYLLORD = new Set(
  (
    "restaurant restaurang resturant restaurante cafe kafe kafeen kaffebar bar pub as da ans sa avd avdeling og and the " +
    "of i pa på hotel hotell kro gatekjokken take away takeaway mat spiseri spisested servering kitchen kjokken grill " +
    "bistro la le el il di de du der den det en et house hus huset nye new ny gamle senter storsenter amfi"
  ).split(" "),
);

/** Ord på minst tre bokstaver uten fyllord og stedsnavn. Korte ord («to», «st») gir for mange tilfeldige treff. */
const ord = (navn: string, bort: ReadonlySet<string>) =>
  asciiFold(navn)
    .split(" ")
    .filter((w) => w.length > 2 && !FYLLORD.has(w) && !bort.has(w));

/**
 * Hvor like to navn er, etter at fyllord og stedsnavn er fjernet. `delvis` er andelen av ordene i det korteste
 * navnet som finnes i det andre («Egon» og «Egon Porsgrunn» gir 1), `helt` andelen av alle ordene (0,5).
 *
 * Det første ordet i ett av navnene må være med blant de felles ordene. Ellers kobles to butikker i samme
 * senter på senternavnet: «Juniper Storo» og «McDonald's Storo» deler bare «storo». Begge tallene er 0 da,
 * og når ett av navnene bare har fyllord.
 */
export function navnLikhet(a: string, b: string, bort: ReadonlySet<string> = new Set()): { delvis: number; helt: number } {
  const A = ord(a, bort);
  const B = ord(b, bort);
  const sa = new Set(A);
  const sb = new Set(B);
  if (sa.size === 0 || sb.size === 0 || (!sb.has(A[0]) && !sa.has(B[0]))) return { delvis: 0, helt: 0 };
  const felles = [...sa].filter((w) => sb.has(w)).length;
  return { delvis: felles / Math.min(sa.size, sb.size), helt: felles / (sa.size + sb.size - felles) };
}

const meter = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)) * 111_320;
  const y = (lat2 - lat1) * 111_320;
  return Math.hypot(x, y);
};

/** Største avstand for et OSM-treff. Helt likt navn tåler mer, fordi adressepunktet ofte ligger et stykke unna. */
const MAKS_METER = 120;
const MAKS_METER_SAMME_NAVN = 300;

export type StedForKilder = {
  navn: string;
  orgnr: string | null;
  lat: number | null;
  lng: number | null;
  poststed?: string | null;
  kommune?: string | null;
};

export function lagKildeoppslag(brreg: BrregFil, osm: OsmFil): (s: StedForKilder) => Kilder {
  // Rutenett på ~1 km, så hvert sted bare sammenlignes med OSM-steder i nærheten.
  const celle = (lat: number, lon: number) => `${Math.floor(lat * 100)}:${Math.floor(lon * 50)}`;
  const rutenett = new Map<string, OsmPost[]>();
  for (const p of osm.steder) {
    const k = celle(p[0], p[1]);
    let liste = rutenett.get(k);
    if (!liste) rutenett.set(k, (liste = []));
    liste.push(p);
  }

  const finnOsm = (s: StedForKilder): OsmPost | null => {
    if (s.lat === null || s.lng === null) return null;
    const bort = new Set([...ord(s.poststed ?? "", new Set()), ...ord(s.kommune ?? "", new Set())]);
    const by = Math.floor(s.lat * 100);
    const bx = Math.floor(s.lng * 50);
    let best: OsmPost | null = null;
    let bestPoeng = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const p of rutenett.get(`${by + dy}:${bx + dx}`) ?? []) {
          const avstand = meter(s.lat, s.lng, p[0], p[1]);
          if (avstand > MAKS_METER_SAMME_NAVN) continue;
          const { delvis, helt } = navnLikhet(s.navn, p[2], bort);
          if (delvis < 0.5 || (helt < 1 && avstand > MAKS_METER)) continue;
          // Flest felles ord vinner foran nærmest: «Bryggen Sushi» skal treffe sushistedet, ikke puben «Bryggen».
          const poeng = delvis + 0.3 * helt - avstand / 1000;
          if (poeng > bestPoeng) {
            bestPoeng = poeng;
            best = p;
          }
        }
      }
    }
    return best;
  };

  return (s) => {
    const b = s.orgnr ? brreg.enheter[s.orgnr] : undefined;
    const o = finnOsm(s);
    return {
      naeringskode: b?.kode ?? null,
      registernavn: b?.navn ?? null,
      aktivitet: b?.aktivitet ?? null,
      osm: o ? { type: o[3], kjokken: o[4] } : null,
    };
  };
}
