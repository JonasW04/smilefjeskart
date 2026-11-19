/** Innebygging av kommune-widgeten (/embed/kommune/[slug]) på andres nettsider. */
import { escapeHtml } from "./text";

const SITE = "https://smilefjeskartet.no";

/** Høyden widgeten er laget for, i piksler. */
export const EMBED_HOYDE = 470;
/** Bredeste widgeten blir i snutten. */
export const EMBED_MAKS_BREDDE = 480;

export function embedUrl(slug: string): string {
  return `${SITE}/embed/kommune/${encodeURIComponent(slug)}`;
}

/**
 * HTML-snutt for lokalaviser og blogger. Lenken under iframen er en vanlig lenke på
 * siden som bygger inn widgeten, slik at kilden står synlig også der iframes blokkeres.
 */
export function embedSnippet(k: { slug: string; navn: string }): string {
  const navn = escapeHtml(k.navn);
  const side = `${SITE}/kommune/${encodeURIComponent(k.slug)}`;
  return [
    `<iframe src="${embedUrl(k.slug)}" title="Smilefjes i ${navn} – Smilefjeskartet" width="100%" height="${EMBED_HOYDE}" style="border:0;max-width:${EMBED_MAKS_BREDDE}px" loading="lazy"></iframe>`,
    `<p style="font-size:13px"><a href="${side}">Smilefjes i ${navn}</a> – data fra Smilefjeskartet.no</p>`,
  ].join("\n");
}
