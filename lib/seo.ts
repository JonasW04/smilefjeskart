/** Tekster for søkemotorer og innebygging: sidetitler, beskrivelser, strukturerte data og delbare merker. */
import type { Kategori } from "./classify";
import { SMILE_LABEL, TEMAER, isGraded, smileFromKarakter, type Smile } from "./smile";
import { dagerMellom, fordeling, formatDato, ordinaereKarakterer, sisteTilsyn } from "./stats";
import type { Sted } from "./types";

const SITE = "https://smilefjeskartet.no";

/** Hvor langt tilbake en strekmunn eller sur munn regnes som fersk nok til å stå i tittelen. */
const NYLIG_DAGER = 3 * 365;

const RANG: Record<Smile, number> = { smil: 0, strek: 1, sur: 2 };

/** Det verste smilefjeset i tilsynene, og året det sist ble gitt. */
function verste(tilsyn: Sted["tilsyn"]): { smil: Smile; aar: string } | null {
  let funnet: { smil: Smile; aar: string } | null = null;
  for (const t of tilsyn) {
    const smil = smileFromKarakter(t.karakter);
    if (smil && (!funnet || RANG[smil] >= RANG[funnet.smil])) funnet = { smil, aar: t.dato.slice(0, 4) };
  }
  return funnet;
}

/** Antall smil på rad fra siste tilsyn og bakover. Tilsyn uten karakter hoppes over. */
export function smilPaaRad(s: Sted): number {
  let n = 0;
  for (let i = s.tilsyn.length - 1; i >= 0; i--) {
    const smil = smileFromKarakter(s.tilsyn[i].karakter);
    if (!smil) continue;
    if (smil !== "smil") break;
    n++;
  }
  return n;
}

function antallTilsyn(n: number): string {
  return `${n} tilsyn`;
}

/**
 * Sidetittel for et sted. Navn og sted kommer først, siden folk søker på navnet. Resten skal gi en grunn til å
 * klikke uten å røpe hele svaret: en fersk strekmunn eller sur munn, en rekke med smil, eller antall tilsyn.
 * `iDag` er datoen dataene gjelder for (yyyy-mm-dd).
 */
export function stedTittel(s: Sted, iDag: string): string {
  const place = s.poststed || s.kommune;
  const hode = place ? `${s.navn}, ${place}` : s.navn;
  const siste = smileFromKarakter(sisteTilsyn(s).karakter);
  const nylig = verste(s.tilsyn.filter((t) => dagerMellom(t.dato, iDag) <= NYLIG_DAGER));
  const antall = antallTilsyn(s.tilsyn.length);
  let hale: string;
  if (nylig && nylig.smil !== "smil") {
    const label = SMILE_LABEL[nylig.smil].toLowerCase();
    if (siste === "smil") hale = `Hadde ${label} i ${nylig.aar} (nå smil) · ${antall}`;
    // En ny strekmunn skal ikke skjules bak en eldre sur munn.
    else if (siste && siste !== nylig.smil) hale = `Fikk ${SMILE_LABEL[siste].toLowerCase()} i ${sisteTilsyn(s).dato.slice(0, 4)}, ${label} i ${nylig.aar} · ${antall}`;
    else hale = `Fikk ${label} i ${nylig.aar} · ${antall}`;
  } else {
    const rad = smilPaaRad(s);
    hale = rad >= 2 ? `${rad} smil på rad hos Mattilsynet` : s.tilsyn.length > 1 ? `${antall} hos Mattilsynet` : "Smilefjes fra Mattilsynet";
  }
  return `${hode} – ${hale} | Smilefjeskartet`;
}

/** «a», «a og b», «a, b og c». */
function liste(ord: string[]): string {
  return ord.length < 2 ? ord.join("") : `${ord.slice(0, -1).join(", ")} og ${ord[ord.length - 1]}`;
}

/**
 * Metabeskrivelse for et sted: siste smilefjes og temaene med brudd, de ordinære tilsynene og det verste smilefjeset.
 * Det viktigste står først, siden Google kutter beskrivelser rundt 160 tegn.
 */
export function stedBeskrivelse(s: Sted): string {
  const place = s.poststed || s.kommune;
  const t = sisteTilsyn(s);
  const sisteSmil = smileFromKarakter(t.karakter);
  const ord = fordeling(ordinaereKarakterer(s));
  const hvem = place ? `${s.navn} i ${place}` : s.navn;
  const deler: string[] = [];

  const brudd = TEMAER.filter((_, i) => isGraded(t.temaer[i]) && t.temaer[i] >= 2).map((tema) => tema.kort.toLowerCase());
  const tema = brudd.length > 0 ? `, brudd på ${liste(brudd)}` : t.temaer.some(isGraded) ? ", alle temaer i orden" : "";
  deler.push(
    sisteSmil
      ? `${hvem} fikk ${SMILE_LABEL[sisteSmil].toLowerCase()} fra Mattilsynet ${formatDato(t.dato)}${tema}.`
      : `${hvem} hadde tilsyn fra Mattilsynet ${formatDato(t.dato)}, uten karakter.`,
  );

  const fra = s.tilsyn[0].dato.slice(0, 4);
  if (ord.total > 0) {
    const fjes = (["smil", "strek", "sur"] as const).filter((k) => ord[k] > 0).map((k) => `${ord[k]} ${SMILE_LABEL[k].toLowerCase()}`);
    deler.push(`${ord.total} ${ord.total === 1 ? "ordinært" : "ordinære"} tilsyn siden ${fra}: ${fjes.join(", ")}.`);
  } else {
    deler.push(`${s.tilsyn.length} tilsyn siden ${fra}.`);
  }

  const v = verste(s.tilsyn);
  if (v && v.smil !== "smil" && v.smil !== sisteSmil) deler.push(`Verste: ${SMILE_LABEL[v.smil].toLowerCase()} i ${v.aar}.`);
  return deler.join(" ");
}

/** Kategorier som er en matrett eller et kjøkken. De andre sier hva slags sted det er, ikke hva de serverer. */
const KJOKKEN: Partial<Record<Kategori, string>> = {
  pizza: "Pizza",
  sushi: "Sushi",
  burger: "Burger",
  kebab: "Kebab",
  asiatisk: "Asiatisk",
  indisk: "Indisk",
  meksikansk: "Meksikansk",
  italiensk: "Italiensk",
  midtosten: "Midtøsten",
  sjomat: "Sjømat",
};

/**
 * Navnet Next.js gir app/(site)/sted/[slug]/opengraph-image.tsx. Fordi mappen ligger i en rutegruppe, får den et
 * suffiks som er en hash av stien til mappen, og /sted/<slug>/opengraph-image uten suffiks gir 404. Testen i
 * __tests__/seo.test.ts regner suffikset ut med Next.js' egen funksjon, så den feiler hvis fila flyttes.
 */
export const STED_OG_BILDE = "opengraph-image-1r1rzi";

/** FoodEstablishment-data for stedsiden. */
export function stedLd(s: Sted) {
  const url = `${SITE}/sted/${s.slug}`;
  const kjokken = KJOKKEN[s.kategori];
  return {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    name: s.navn,
    url,
    image: `${url}/${STED_OG_BILDE}`,
    ...(kjokken ? { servesCuisine: kjokken } : {}),
    ...(s.orgnr ? { sameAs: [`https://virksomhet.brreg.no/oppslag/enheter/${s.orgnr}`] } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: s.adresse,
      postalCode: s.postnr || undefined,
      addressLocality: s.poststed || undefined,
      addressCountry: "NO",
    },
    ...(s.lat !== null && s.lng !== null ? { geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng } } : {}),
  };
}

/**
 * Stedsider som bygges ved deploy, så de mest besøkte ikke starter kalde hver morgen: de som har hatt tilsyn sist.
 * Det er dem folk søker opp etter at Mattilsynet har vært på besøk.
 */
export function forhandsbygdeSteder(steder: readonly Sted[], antall: number): string[] {
  return [...steder]
    .sort((a, b) => sisteTilsyn(b).dato.localeCompare(sisteTilsyn(a).dato) || a.slug.localeCompare(b.slug))
    .slice(0, antall)
    .map((s) => s.slug);
}

type Smule = { name: string; item: string };

function brodsmulerLd(smuler: Smule[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: smuler.map((smule, i) => ({ "@type": "ListItem", position: i + 1, ...smule })),
  };
}

/** Brødsmuler for søkemotorer, likt de synlige på stedsiden: kartet, fylket, kommunen og stedet. */
export function stedBrodsmulerLd(s: Sted, fylkeSlug: string | null, kommuneSlug: string | null) {
  const smuler: Smule[] = [{ name: "Kart", item: `${SITE}/` }];
  if (s.fylke && fylkeSlug) smuler.push({ name: s.fylke, item: `${SITE}/fylke/${fylkeSlug}` });
  if (s.kommune && s.kommune !== s.fylke && kommuneSlug) smuler.push({ name: s.kommune, item: `${SITE}/kommune/${kommuneSlug}` });
  smuler.push({ name: s.navn, item: `${SITE}/sted/${s.slug}` });
  return brodsmulerLd(smuler);
}

export type SynligSmule = { navn: string; href?: string };

/** Synlige brødsmuler på kommune-, fylke- og kjedesider. Fylket hoppes over når kommunen heter det samme (Oslo). */
export function omradeSmuler(type: "kommune" | "fylke" | "kjede", navn: string, fylke: { navn: string; slug: string } | null): SynligSmule[] {
  const smuler: SynligSmule[] = [{ navn: "Analyse", href: "/analyse" }];
  if (type === "kommune" && fylke && fylke.navn !== navn) smuler.push({ navn: fylke.navn, href: `/fylke/${fylke.slug}` });
  if (type === "fylke") smuler.push({ navn: "Fylker", href: "/analyse#fylker" });
  if (type === "kjede") smuler.push({ navn: "Kjeder", href: "/analyse#kjeder" });
  smuler.push({ navn });
  return smuler;
}

/**
 * Brødsmuler for søkemotorer fra de synlige. Lenker til et anker på en side som alt er med (/analyse#fylker)
 * blir samme URL to ganger når ankeret fjernes, så de hoppes over.
 */
export function omradeBrodsmulerLd(smuler: SynligSmule[], url: string) {
  const sett = new Set<string>();
  const ld: Smule[] = [];
  for (const s of smuler) {
    const item = s.href ? `${SITE}${s.href.split("#")[0]}` : url;
    if (sett.has(item)) continue;
    sett.add(item);
    ld.push({ name: s.navn, item });
  }
  return brodsmulerLd(ld);
}

/** Delene av sitemapen, én per sidetype. Next.js serverer dem på /sitemap/<id>.xml. */
export const SITEMAP_IDER = ["core", "omrader", "steder"] as const;
export type SitemapId = (typeof SITEMAP_IDER)[number];

/** Sitemap-indeksen som /sitemap.xml svarer med. */
export function sitemapIndeks(): string {
  const deler = SITEMAP_IDER.map((id) => `  <sitemap><loc>${SITE}/sitemap/${id}.xml</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${deler}\n</sitemapindex>\n`;
}

/** HTML-snutt steder kan lime inn for å vise smilefjeset sitt. */
export function merkeSnippet(s: Sted): string {
  const navn = s.navn
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<a href="https://smilefjeskartet.no/sted/${s.slug}"><img src="https://smilefjeskartet.no/sted/${s.slug}/merke.png" alt="Se smilefjeset til ${navn} på smilefjeskartet.no" width="220" height="56"></a>`;
}

/** Samme merke som Markdown, for README-er, Notion og nettsidebyggere som tar Markdown. */
export function merkeMarkdown(s: Sted): string {
  const alt = `Se smilefjeset til ${s.navn} på smilefjeskartet.no`.replace(/[\\[\]]/g, "\\$&");
  return `[![${alt}](${SITE}/sted/${s.slug}/merke.png)](${SITE}/sted/${s.slug})`;
}

/** Lenke til merke-delen av stedsiden, til å sende til den som driver stedet. */
export function merkeEierLenke(s: Sted): string {
  return `${SITE}/sted/${s.slug}#merke`;
}

/**
 * Ferdig melding til eieren. Med `siden` (fra renRekke) skryter den av rekka. Lenken (merkeEierLenke)
 * legges bak av delingsknappen.
 */
export function merkeEierTekst(s: Sted, siden: string | null): string {
  const skryt = siden ? `Hei! ${s.navn} har fått smil på alle tilsyn fra Mattilsynet siden ${siden}. ` : "Hei! ";
  return `${skryt}Smilefjeskartet.no har et gratis merke ${siden ? "dere" : s.navn} kan vise på nettsiden. Det oppdaterer seg selv etter hvert tilsyn fra Mattilsynet:`;
}
