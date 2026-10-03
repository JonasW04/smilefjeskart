/**
 * HMAC-signerte tokens for bekreftelses- og avmeldingslenker.
 *
 * Format: base64url(JSON {f, id, exp?}) + "." + base64url(HMAC-SHA256(secret, "varsling.v1." + payload))
 * - f   = formål ("bekreft" | "avmeld"), så en token ikke kan brukes til noe annet enn den ble laget for.
 * - id  = tilfeldig abonnements-ID (ingen e-postadresse i lenken).
 * - exp = utløp i sekunder siden epoch. Påkrevd for «bekreft»; avmeldingslenker skal virke for alltid.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type TokenFormaal = "bekreft" | "avmeld";

export type TokenData = { f: TokenFormaal; id: string; exp?: number };

export type VerifiserResultat =
  | { ok: true; data: TokenData }
  | { ok: false; grunn: "ugyldig" | "utlopt" };

/** Hvor lenge en bekreftelseslenke (og et ubekreftet abonnement) lever. */
export const BEKREFT_LEVETID_SEK = 48 * 60 * 60;

const ID_MONSTER = /^[A-Za-z0-9_-]{16,64}$/;
const MAKS_TOKEN_LENGDE = 512;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function signatur(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(`varsling.v1.${payload}`).digest();
}

/** Ny tilfeldig abonnements-ID (128 bit). */
export function nyId(): string {
  return randomBytes(16).toString("base64url");
}

export function lagToken(secret: string, data: TokenData): string {
  if (!ID_MONSTER.test(data.id)) throw new Error("Ugyldig id i token");
  const payload = b64url(JSON.stringify(data.exp === undefined ? { f: data.f, id: data.id } : data));
  return `${payload}.${b64url(signatur(secret, payload))}`;
}

export function verifiserToken(
  secret: string,
  token: string | null | undefined,
  formaal: TokenFormaal,
  naaSek: number = Math.floor(Date.now() / 1000),
): VerifiserResultat {
  if (typeof token !== "string" || token.length === 0 || token.length > MAKS_TOKEN_LENGDE) return { ok: false, grunn: "ugyldig" };
  const deler = token.split(".");
  if (deler.length !== 2) return { ok: false, grunn: "ugyldig" };
  const [payload, sig] = deler;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(sig)) return { ok: false, grunn: "ugyldig" };

  const forventet = signatur(secret, payload);
  const faktisk = Buffer.from(sig, "base64url");
  if (faktisk.length !== forventet.length || !timingSafeEqual(faktisk, forventet)) return { ok: false, grunn: "ugyldig" };

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, grunn: "ugyldig" };
  }
  if (!data || typeof data !== "object") return { ok: false, grunn: "ugyldig" };
  const { f, id, exp } = data as Record<string, unknown>;
  if (f !== formaal || typeof id !== "string" || !ID_MONSTER.test(id)) return { ok: false, grunn: "ugyldig" };
  if (exp !== undefined && (typeof exp !== "number" || !Number.isFinite(exp))) return { ok: false, grunn: "ugyldig" };
  if (formaal === "bekreft" && exp === undefined) return { ok: false, grunn: "ugyldig" };
  if (typeof exp === "number" && naaSek > exp) return { ok: false, grunn: "utlopt" };
  return { ok: true, data: { f: formaal, id, ...(typeof exp === "number" ? { exp } : {}) } };
}

/** Hasher e-post/IP med hemmeligheten, så nøkler i Redis ikke avslører hvem som står bak. */
export function hmacHex(secret: string, kontekst: string, verdi: string): string {
  return createHmac("sha256", secret).update(`${kontekst}:${verdi}`).digest("hex");
}
