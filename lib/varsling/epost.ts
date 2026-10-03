/**
 * E-postmaler: bekreftelse og daglig sammendrag. Inline-stilet HTML med tabeller (for e-postklienter)
 * og en ren tekstdel. ALL data fra datasettet escapes med escapeHtml.
 *
 * Smilefjesene er PNG-er på nettstedet (public/epost/*.png) fordi mange klienter blokkerer
 * SVG og data-URI-er.
 */
import { formatDato } from "../stats";
import { SMILE_LABEL, smileFromKarakter, type Smile } from "../smile";
import { escapeHtml } from "../text";
import type { Abonnement, VarselTilsyn } from "./typer";

export const MAKS_TREFF_I_EPOST = 25;

const F = {
  paper: "#fff8ec",
  card: "#ffffff",
  ink: "#1e1631",
  soft: "#5d5472",
  accent: "#6b4eff",
  smil: "#d4f6e3",
  strek: "#fff0c4",
  sur: "#ffdde0",
} as const;

const FONT = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;";

const EMOJI: Record<Smile, string> = { smil: "😊", strek: "😐", sur: "😠" };

export type EpostInnhold = { emne: string; html: string; tekst: string; preheader: string };

function e(s: string): string {
  return escapeHtml(s);
}

/** Ingen linjeskift i emnefeltet. */
function enLinje(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function filterTekst(filtre: readonly Smile[]): string {
  const navn = filtre.map((f) => SMILE_LABEL[f].toLowerCase());
  return navn.length <= 1 ? (navn[0] ?? "") : `${navn.slice(0, -1).join(", ")} og ${navn[navn.length - 1]}`;
}

export function omradeSetning(abo: Pick<Abonnement, "omrade" | "omradeTekst">): string {
  return abo.omrade.type === "radius" ? `innen ${abo.omradeTekst}` : `i ${abo.omradeTekst}`;
}

function smileyImg(siteUrl: string, kind: Smile | "ukjent", size: number, alt: string): string {
  return `<img src="${e(`${siteUrl}/epost/${kind}.png`)}" width="${size}" height="${size}" alt="${e(alt)}" style="display:block;border:0;outline:none;width:${size}px;height:${size}px;">`;
}

function knapp(href: string, tekst: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;"><tr><td style="background:${F.accent};border:2px solid ${F.ink};border-radius:999px;">
<a href="${e(href)}" style="${FONT}display:inline-block;padding:12px 22px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">${e(tekst)}</a>
</td></tr></table>`;
}

function ramme(o: { siteUrl: string; preheader: string; innhold: string; bunn: string }): string {
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Smilefjeskartet</title>
</head>
<body style="margin:0;padding:0;background:${F.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${F.paper};">${e(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${F.paper};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 14px;">
<a href="${e(o.siteUrl)}/" style="text-decoration:none;color:${F.ink};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:8px;">${smileyImg(o.siteUrl, "smil", 32, "")}</td>
<td style="${FONT}font-size:20px;font-weight:800;color:${F.ink};">Smilefjes<span style="color:${F.accent};">kartet</span></td>
</tr></table>
</a>
</td></tr>
<tr><td style="background:${F.card};border:2px solid ${F.ink};border-radius:20px;padding:22px 20px;${FONT}color:${F.ink};font-size:16px;line-height:1.5;">
${o.innhold}
</td></tr>
<tr><td style="padding:16px 8px 0;${FONT}font-size:12px;line-height:1.5;color:${F.soft};">
${o.bunn}
<p style="margin:8px 0 0;">Smilefjeskartet er et uavhengig prosjekt og er ikke tilknyttet Mattilsynet. Data: Mattilsynet (NLOD 2.0).</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Bekreftelse                                                         */
/* ------------------------------------------------------------------ */

export function bekreftelsesEpost(o: {
  abo: Pick<Abonnement, "omrade" | "omradeTekst" | "filtre">;
  bekreftUrl: string;
  siteUrl: string;
}): EpostInnhold {
  const hva = filterTekst(o.abo.filtre);
  const hvor = omradeSetning(o.abo);
  const emne = "Bekreft smilefjesvarselet ditt 📬";
  const preheader = `Ett klikk til, så får du beskjed om ${hva} ${hvor}.`;
  const innhold = `
<h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;font-weight:800;">Nesten ferdig! 🎉</h1>
<p style="margin:0 0 8px;">Noen (forhåpentligvis du) vil ha beskjed når Mattilsynet deler ut <strong>${e(hva)}</strong> ${e(hvor)}.</p>
<p style="margin:0;">Trykk på knappen for å skru på varselet:</p>
${knapp(o.bekreftUrl, "Ja, send meg varsler")}
<p style="margin:16px 0 0;font-size:13px;color:${F.soft};">Lenken virker i 48 timer. Funker ikke knappen? Lim inn denne adressen i nettleseren:<br><a href="${e(o.bekreftUrl)}" style="color:${F.accent};word-break:break-all;">${e(o.bekreftUrl)}</a></p>`;
  const bunn = `<p style="margin:0;">Har du ikke bedt om dette? Da kan du trygt overse e-posten. Uten bekreftelse skjer ingenting, og forespørselen slettes automatisk etter 48 timer.</p>`;
  const tekst = [
    "Nesten ferdig!",
    "",
    `Noen (forhåpentligvis du) vil ha beskjed når Mattilsynet deler ut ${hva} ${hvor}.`,
    "",
    "Bekreft varselet her (lenken virker i 48 timer):",
    o.bekreftUrl,
    "",
    "Har du ikke bedt om dette? Da kan du trygt overse e-posten. Forespørselen slettes automatisk etter 48 timer.",
    "",
    "Smilefjeskartet er ikke tilknyttet Mattilsynet.",
  ].join("\n");
  return { emne, preheader, tekst, html: ramme({ siteUrl: o.siteUrl, preheader, innhold, bunn }) };
}

/* ------------------------------------------------------------------ */
/* Sammendrag                                                          */
/* ------------------------------------------------------------------ */

const FLERTALL: Record<Smile, [string, string]> = {
  smil: ["smil", "smil"],
  strek: ["strekmunn", "strekmunner"],
  sur: ["sur munn", "sure munner"],
};

function antallTekst(n: number, s: Smile): string {
  return `${n} ${FLERTALL[s][n === 1 ? 0 : 1]}`;
}

export function sammendragEmne(treff: readonly VarselTilsyn[], abo: Pick<Abonnement, "omrade" | "omradeTekst">): string {
  if (treff.length === 1) {
    const t = treff[0];
    const sm = smileFromKarakter(t.karakter)!;
    return enLinje(`${EMOJI[sm]} ${SMILE_LABEL[sm]} for ${t.navn}`).slice(0, 140);
  }
  const deler = (["sur", "strek", "smil"] as const)
    .map((s) => [s, treff.filter((t) => smileFromKarakter(t.karakter) === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => antallTekst(n, s));
  const hvor = abo.omrade.type === "kommuner" ? ` i ${abo.omradeTekst}` : " i nabolaget";
  return enLinje(`${treff.length} nye smilefjes${hvor}: ${deler.join(", ")}`).slice(0, 140);
}

const RAD_BG: Record<Smile, string> = { smil: F.smil, strek: F.strek, sur: F.sur };

function rad(t: VarselTilsyn, siteUrl: string): string {
  const sm = smileFromKarakter(t.karakter)!;
  const url = `${siteUrl}/sted/${encodeURIComponent(t.slug)}`;
  const sted = [t.adresse, t.poststed].filter(Boolean).join(", ");
  const meta = `${SMILE_LABEL[sm]} · ${formatDato(t.dato)}${t.oppfolging ? " · oppfølgingstilsyn" : ""}`;
  return `<tr><td style="padding:0 0 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${RAD_BG[sm]};border:2px solid ${F.ink};border-radius:14px;">
<tr>
<td width="56" valign="top" style="padding:12px 0 12px 12px;width:44px;">${smileyImg(siteUrl, sm, 44, SMILE_LABEL[sm])}</td>
<td valign="top" style="padding:12px 12px 12px 12px;${FONT}color:${F.ink};">
<a href="${e(url)}" style="color:${F.ink};font-size:17px;font-weight:800;text-decoration:underline;">${e(t.navn)}</a>
${sted ? `<div style="font-size:14px;color:${F.soft};">${e(sted)}</div>` : ""}
<div style="font-size:14px;font-weight:700;margin-top:2px;">${e(meta)}</div>
</td>
</tr>
</table>
</td></tr>`;
}

const INTRO: Record<Smile, string> = {
  sur: "Au da. Mattilsynet har vært på besøk, og ikke alle slapp like lett unna.",
  strek: "Mattilsynet har vært på runden igjen. Her er det nye:",
  smil: "Gode nyheter fra kjøkkenfronten! Mattilsynet har vært på besøk:",
};

export function sammendragEpost(o: {
  abo: Pick<Abonnement, "omrade" | "omradeTekst" | "filtre">;
  treff: readonly VarselTilsyn[];
  siteUrl: string;
  avmeldUrl: string;
}): EpostInnhold {
  const treff = o.treff;
  const verst = smileFromKarakter(treff[0]?.karakter ?? 0) ?? "smil";
  const vis = treff.slice(0, MAKS_TREFF_I_EPOST);
  const resten = treff.length - vis.length;
  const hvor = omradeSetning(o.abo);
  const emne = sammendragEmne(treff, o.abo);
  const preheader = `${treff.length === 1 ? "Ett nytt tilsyn" : `${treff.length} nye tilsyn`} ${hvor}.`;
  const tittel = treff.length === 1 ? "Nytt smilefjes! 👀" : `${treff.length} nye smilefjes! 👀`;

  const innhold = `
<h1 style="margin:0 0 6px;font-size:24px;line-height:1.25;font-weight:800;">${e(tittel)}</h1>
<p style="margin:0 0 16px;">${e(INTRO[verst])} <span style="color:${F.soft};">(${e(hvor)})</span></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${vis.map((t) => rad(t, o.siteUrl)).join("\n")}
</table>
${resten > 0 ? `<p style="margin:4px 0 0;font-weight:700;">…og ${resten} til. Se alle på kartet.</p>` : ""}
${knapp(`${o.siteUrl}/`, "🗺️ Åpne kartet")}`;

  const bunn = `<p style="margin:0;">Du får denne e-posten fordi du har bedt om varsler om ${e(filterTekst(o.abo.filtre))} ${e(hvor)}. Vi sender maks én e-post om dagen.</p>
<p style="margin:8px 0 0;"><a href="${e(o.avmeldUrl)}" style="color:${F.accent};font-weight:700;">Meld meg av</a> – ett klikk, og vi sletter e-postadressen din.</p>`;

  const tekst = [
    tittel,
    "",
    `${INTRO[verst]} (${hvor})`,
    "",
    ...vis.flatMap((t) => {
      const sm = smileFromKarakter(t.karakter)!;
      return [
        `${EMOJI[sm]} ${t.navn} – ${SMILE_LABEL[sm]}, ${formatDato(t.dato)}${t.oppfolging ? " (oppfølgingstilsyn)" : ""}`,
        `   ${[t.adresse, t.poststed].filter(Boolean).join(", ")}`,
        `   ${o.siteUrl}/sted/${encodeURIComponent(t.slug)}`,
        "",
      ];
    }),
    ...(resten > 0 ? [`…og ${resten} til: ${o.siteUrl}/`, ""] : []),
    "—",
    `Du får denne e-posten fordi du har bedt om varsler om ${filterTekst(o.abo.filtre)} ${hvor}.`,
    `Meld deg av (ett klikk): ${o.avmeldUrl}`,
    "Smilefjeskartet er ikke tilknyttet Mattilsynet. Data: Mattilsynet (NLOD 2.0).",
  ].join("\n");

  return { emne, preheader, tekst, html: ramme({ siteUrl: o.siteUrl, preheader, innhold, bunn }) };
}

/** RFC 8058: ett-klikks avmelding direkte fra e-postklienten. */
export function avmeldHeaders(avmeldUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${avmeldUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
