/**
 * Konfigurasjon for e-postvarsling. Alt er av («inert») til alle påkrevde miljøvariabler finnes,
 * slik at siden, API-et og utsendingsjobben oppfører seg pent før eieren har satt opp kontoene.
 */

export const PAAKREVDE_ENV = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RESEND_API_KEY",
  "VARSLING_SECRET",
  "VARSLING_FRA",
] as const;

export const STANDARD_SITE_URL = "https://smilefjeskartet.no";

/** HMAC-hemmeligheten må være lang nok til å ikke kunne gjettes. */
export const MIN_SECRET_LENGDE = 32;

export type VarslingConfig = {
  redisUrl: string;
  redisToken: string;
  resendKey: string;
  secret: string;
  fra: string;
  siteUrl: string;
};

export type ConfigResultat = { ok: true; config: VarslingConfig } | { ok: false; mangler: string[] };

type Env = Record<string, string | undefined>;

function siteUrl(env: Env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return STANDARD_SITE_URL;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return STANDARD_SITE_URL;
    return u.origin;
  } catch {
    return STANDARD_SITE_URL;
  }
}

/** Leser konfigurasjonen. Tomme strenger regnes som manglende (GitHub gir "" for ukjente secrets). */
export function lesVarslingConfig(env: Env = process.env): ConfigResultat {
  const mangler: string[] = PAAKREVDE_ENV.filter((k) => !env[k]?.trim());
  const secret = env.VARSLING_SECRET?.trim() ?? "";
  if (secret && secret.length < MIN_SECRET_LENGDE) mangler.push(`VARSLING_SECRET (minst ${MIN_SECRET_LENGDE} tegn)`);
  const redisUrl = env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  if (redisUrl && !/^https:\/\//.test(redisUrl)) mangler.push("UPSTASH_REDIS_REST_URL (må starte med https://)");
  if (mangler.length > 0) return { ok: false, mangler };
  return {
    ok: true,
    config: {
      redisUrl: redisUrl.replace(/\/+$/, ""),
      redisToken: env.UPSTASH_REDIS_REST_TOKEN!.trim(),
      resendKey: env.RESEND_API_KEY!.trim(),
      secret,
      fra: env.VARSLING_FRA!.trim(),
      siteUrl: siteUrl(env),
    },
  };
}

export function varslingAktiv(env: Env = process.env): boolean {
  return lesVarslingConfig(env).ok;
}
