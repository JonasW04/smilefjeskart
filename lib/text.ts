/** Tekst-hjelpere for slugs og søk. */

const CHAR_MAP: Record<string, string> = {
  æ: "ae",
  ø: "o",
  å: "a",
  ä: "a",
  ö: "o",
  ü: "u",
  é: "e",
  è: "e",
  ß: "ss",
};

/** Lager en URL-vennlig slug: "Bølgen & Moi, Bærum" → "bolgen-moi-baerum". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[æøåäöüéèß]/g, (c) => CHAR_MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normaliserer for søk: små bokstaver, fjerner aksenter (men beholder æøå),
 * og slår sammen mellomrom og tegnsetting. "Café Bølgen’s" → "cafe bølgens".
 */
export function foldForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .normalize("NFD")
    // Fjern kombinerende tegn unntatt ring over (U+030A), så "å" overlever.
    .replace(/[̀-̉̋-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Ren ASCII-variant for søk uten norske tegn: "Bølgen & Moi" → "bolgen moi". */
export function asciiFold(s: string): string {
  return slugify(s).replace(/-/g, " ");
}

const SMAAORD = new Set(["i", "og", "på", "ved", "under", "over"]);

/**
 * Gjør STORE BOKSTAVER om til vanlig navneform: "NORD-FRON" → "Nord-Fron", "MO I RANA" → "Mo i Rana".
 * Tekst som allerede har små bokstaver beholdes som den er.
 */
export function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L}+)/gu, (m, sep: string, ord: string, offset: number) =>
      offset > 0 && sep === " " && SMAAORD.has(ord) ? m : sep + ord[0].toUpperCase() + ord.slice(1),
    );
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escaper tekst før den settes inn i HTML-strenger (f.eks. MapLibre-popups). */
export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
