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

/** HTML-snutt steder kan lime inn for å vise smilefjeset sitt. */
export function merkeSnippet(s: Sted): string {
  const navn = s.navn
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<a href="https://smilefjeskartet.no/sted/${s.slug}"><img src="https://smilefjeskartet.no/sted/${s.slug}/merke.png" alt="Smilefjes fra Mattilsynet for ${navn}" width="220" height="56"></a>`;
}
