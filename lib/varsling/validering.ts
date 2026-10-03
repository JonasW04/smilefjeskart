/**
 * Streng validering av påmeldinger. Ren logikk uten Node-avhengigheter, så skjemaet kan bruke
 * de samme reglene i nettleseren.
 */
import { SMILES, type Smile } from "../smile";
import { MAKS_KOMMUNER, RADIUSER, type AbonnementInput, type Omrade, type Radius } from "./typer";

/** Grov boks rundt Norge inkludert Svalbard. */
export const NORGE_BOKS = { minLat: 57.5, maxLat: 81.5, minLng: 3.5, maxLng: 34 } as const;

export const MAKS_EPOST_LENGDE = 254;

// Pragmatisk: én @, ingen mellomrom/kontrolltegn/vinkelparenteser, domene med minst ett punktum og TLD på 2+ bokstaver.
const EPOST_MONSTER = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/;

export function normaliserEpost(epost: string): string {
  return epost.trim().toLowerCase();
}

export function gyldigEpost(epost: unknown): epost is string {
  if (typeof epost !== "string") return false;
  const e = normaliserEpost(epost);
  if (e.length < 6 || e.length > MAKS_EPOST_LENGDE) return false;
  const [lokal] = e.split("@");
  if (!lokal || lokal.length > 64 || lokal.startsWith(".") || lokal.endsWith(".") || lokal.includes("..")) return false;
  return EPOST_MONSTER.test(e);
}

export function iNorge(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= NORGE_BOKS.minLat &&
    lat <= NORGE_BOKS.maxLat &&
    lng >= NORGE_BOKS.minLng &&
    lng <= NORGE_BOKS.maxLng
  );
}

export function gyldigRadius(km: unknown): km is Radius {
  return typeof km === "number" && (RADIUSER as readonly number[]).includes(km);
}

export type Felt = "epost" | "omrade" | "filtre" | "skjema";
export type Valideringsfeil = Partial<Record<Felt, string>>;

export type ValideringsResultat = { ok: true; input: AbonnementInput } | { ok: false; feil: Valideringsfeil };

/** Avrunder til ~100 m. Minste radius er 2 km, så mer presisjon trengs ikke – og vi lagrer ikke mer enn nødvendig. */
function rund(x: number): number {
  return Math.round(x * 1_000) / 1_000;
}

/**
 * Validerer et ukjent JSON-objekt.
 * @param kommuneFinnes slår opp om et kommunenummer finnes i datasettet.
 */
export function validerAbonnement(body: unknown, kommuneFinnes: (nr: string) => boolean): ValideringsResultat {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, feil: { skjema: "Ugyldig forespørsel." } };
  const b = body as Record<string, unknown>;
  const feil: Valideringsfeil = {};

  // E-post
  if (!gyldigEpost(b.epost)) feil.epost = "Skriv inn en gyldig e-postadresse, f.eks. navn@eksempel.no.";

  // Område
  let omrade: Omrade | null = null;
  const o = b.omrade as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    feil.omrade = "Velg et område.";
  } else if (o.type === "radius") {
    if (!iNorge(o.lat, o.lng)) feil.omrade = "Posisjonen må være i Norge.";
    else if (!gyldigRadius(o.km)) feil.omrade = `Velg en radius på ${RADIUSER.join(", ")} km.`;
    else omrade = { type: "radius", lat: rund(o.lat as number), lng: rund(o.lng as number), km: o.km };
  } else if (o.type === "kommuner") {
    const k = o.kommuner;
    if (!Array.isArray(k) || k.length === 0) feil.omrade = "Velg minst én kommune.";
    else if (k.length > MAKS_KOMMUNER) feil.omrade = `Du kan velge opptil ${MAKS_KOMMUNER} kommuner.`;
    else if (!k.every((nr) => typeof nr === "string" && /^\d{4}$/.test(nr) && kommuneFinnes(nr))) feil.omrade = "Ukjent kommune.";
    else omrade = { type: "kommuner", kommuner: [...new Set(k as string[])].sort() };
  } else {
    feil.omrade = "Velg et område.";
  }

  // Filtre
  let filtre: Smile[] = [];
  if (!Array.isArray(b.filtre) || b.filtre.length === 0 || b.filtre.length > SMILES.length) {
    feil.filtre = "Velg minst ett smilefjes.";
  } else if (!b.filtre.every((f) => typeof f === "string" && (SMILES as readonly string[]).includes(f))) {
    feil.filtre = "Ukjent smilefjes.";
  } else {
    filtre = SMILES.filter((s) => (b.filtre as string[]).includes(s));
  }

  if (Object.keys(feil).length > 0 || !omrade) return { ok: false, feil };
  return { ok: true, input: { epost: normaliserEpost(b.epost as string), omrade, filtre } };
}

/** Maskerer e-postadresser i fritekst (for logger): "ola.nordmann@gmail.com" → "ol***@g***.com". */
export function maskerEpost(tekst: string): string {
  return String(tekst).replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*\.([A-Za-z]{2,})/g, "$1***@$2***.$3");
}
