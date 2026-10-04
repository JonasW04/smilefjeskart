/**
 * «Ferskt fra Mattilsynet»: de nyeste tilsynene, sortert i historier – sur munn, strekmunn,
 * comebacks og nye steder. Brukes av /siste og RSS-strømmen /siste/rss.xml.
 */
import { sisteTilsynPeriode } from "./analyse";
import { smileFromKarakter, TEMAER, type Smile } from "./smile";
import { formatDato } from "./stats";
import { escapeHtml } from "./text";
import type { Sted, Tilsyn } from "./types";

/** Hvor mange dager bakover /siste og RSS-strømmen viser. */
export const FERSK_DAGER = 14;

export type FerskType = "sur" | "strek" | "comeback" | "ny" | "smil" | "ukjent";

export type FerskTilsyn = {
  sted: Sted;
  tilsyn: Tilsyn;
  type: FerskType;
  /** Tilsynet før dette hos samme sted, eller null for første tilsyn. */
  forrige: Tilsyn | null;
  /** Temaer med strekmunn eller sur munn (kortnavn). */
  anmerkninger: string[];
};

/** Temaene som trakk ned: karakter 2 (strek) eller 3 (sur). */
export function anmerkninger(t: Tilsyn): string[] {
  return TEMAER.filter((_, i) => t.temaer[i] === 2 || t.temaer[i] === 3).map((tema) => tema.kort);
}

export function ferskType(t: Tilsyn, forrige: Tilsyn | null): FerskType {
  const naa = smileFromKarakter(t.karakter);
  if (naa === "sur" || naa === "strek") return naa;
  if (naa === null) return "ukjent";
  const før = forrige ? smileFromKarakter(forrige.karakter) : null;
  if (før === "strek" || før === "sur") return "comeback";
  return forrige ? "smil" : "ny";
}

/** Alle tilsyn de siste `dager` dagene til og med sluttDato, nyeste først, med historietype. */
export function ferskeTilsyn(steder: Iterable<Sted>, sluttDato: string, dager = FERSK_DAGER): FerskTilsyn[] {
  return sisteTilsynPeriode(steder, sluttDato, dager).map(({ sted, tilsyn }) => {
    const i = sted.tilsyn.indexOf(tilsyn);
    const forrige = i > 0 ? sted.tilsyn[i - 1] : null;
    return { sted, tilsyn, forrige, type: ferskType(tilsyn, forrige), anmerkninger: anmerkninger(tilsyn) };
  });
}

/** Historiene som er verdt en egen overskrift (og et RSS-innslag). */
export const NYHET: readonly FerskType[] = ["sur", "strek", "comeback"];

const SMIL_TEKST: Record<Smile, string> = { smil: "smil", strek: "strekmunn", sur: "sur munn" };

/** Kort forklaring av hva som skjedde, f.eks. «Hadde smil sist» eller «Fra sur munn til smil». */
export function kontekst(f: FerskTilsyn): string | null {
  const før = f.forrige ? smileFromKarakter(f.forrige.karakter) : null;
  if (f.type === "comeback" && før) return `Fra ${SMIL_TEKST[før]} til smil`;
  if (f.type === "ny") return "Første tilsyn";
  if ((f.type === "sur" || f.type === "strek") && !f.forrige) return "Første tilsyn";
  if ((f.type === "sur" || f.type === "strek") && før === "smil") return "Hadde smil sist";
  if (f.type === "strek" && før === "sur") return "Opp fra sur munn";
  return null;
}

const RSS_TITTEL: Partial<Record<FerskType, string>> = {
  sur: "😠 Sur munn",
  strek: "😐 Strekmunn",
  comeback: "🔄 Comeback",
};

/** RSS 2.0 med nyhetene (sur munn, strekmunn, comebacks), nyeste først. */
export function rssXml(liste: readonly FerskTilsyn[], site: string, oppdatert: string): string {
  const x = (s: string) => escapeHtml(s);
  const items = liste
    .filter((f) => NYHET.includes(f.type))
    .map((f) => {
      const sted = f.sted.kommune ?? f.sted.poststed;
      const url = `${site}/sted/${f.sted.slug}`;
      const deler = [
        `Tilsyn ${formatDato(f.tilsyn.dato)}${f.tilsyn.oppfolging ? " (oppfølging)" : ""}.`,
        kontekst(f) ? `${kontekst(f)}.` : null,
        f.anmerkninger.length ? `Anmerkninger: ${f.anmerkninger.join(", ")}.` : null,
        [f.sted.adresse, `${f.sted.postnr} ${f.sted.poststed}`].filter(Boolean).join(", "),
      ];
      return `    <item>
      <title>${x(`${RSS_TITTEL[f.type]}: ${f.sted.navn}, ${sted}`)}</title>
      <link>${x(url)}</link>
      <guid isPermaLink="false">${x(`${f.sted.id}-${f.tilsyn.dato}`)}</guid>
      <pubDate>${new Date(`${f.tilsyn.dato}T12:00:00Z`).toUTCString()}</pubDate>
      <category>${x(f.type)}</category>
      <description>${x(deler.filter(Boolean).join(" "))}</description>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Ferskt fra Mattilsynet – Smilefjeskartet</title>
    <link>${site}/siste</link>
    <atom:link href="${site}/siste/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Nye sure munner, strekmunner og comebacks fra Mattilsynets smilefjestilsyn.</description>
    <language>nb</language>
    <lastBuildDate>${new Date(oppdatert).toUTCString()}</lastBuildDate>
    <ttl>720</ttl>
${items}
  </channel>
</rss>
`;
}
