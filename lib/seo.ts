/** Tekster for søkemotorer og innebygging: sidetitler og delbare merker. */
import { SMILE_LABEL, smileFromKarakter } from "./smile";
import { sisteTilsyn } from "./stats";
import type { Sted } from "./types";

/** Sidetittel for et sted, med smilefjes og sted først. */
export function stedTittel(s: Sted): string {
  const place = s.poststed || s.kommune;
  const grade = smileFromKarakter(sisteTilsyn(s).karakter);
  let tittel = `Smilefjes for ${s.navn}`;
  if (place) tittel += `, ${place}`;
  if (grade) tittel += `: ${SMILE_LABEL[grade].toLowerCase()}`;
  return `${tittel} | Smilefjeskartet`;
}

const SITE = "https://smilefjeskartet.no";

/** Brødsmuler for søkemotorer, likt de synlige på stedsiden: kartet, fylket, kommunen og stedet. */
export function stedBrodsmulerLd(s: Sted, fylkeSlug: string | null, kommuneSlug: string | null) {
  const smuler = [{ name: "Kart", item: `${SITE}/` }];
  if (s.fylke && fylkeSlug) smuler.push({ name: s.fylke, item: `${SITE}/fylke/${fylkeSlug}` });
  if (s.kommune && s.kommune !== s.fylke && kommuneSlug) smuler.push({ name: s.kommune, item: `${SITE}/kommune/${kommuneSlug}` });
  smuler.push({ name: s.navn, item: `${SITE}/sted/${s.slug}` });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: smuler.map((smule, i) => ({ "@type": "ListItem", position: i + 1, ...smule })),
  };
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
