/**
 * Felles for API-rutene: konfigurasjon, klienter og standardsvar.
 */
import { NextResponse } from "next/server";
import { getSteder } from "../server/data";
import { lesVarslingConfig, type VarslingConfig } from "./config";
import { upstashKv, type Kv } from "./kv";
import { resendMailer, type Mailer } from "./mailer";

export type Tjenester = { config: VarslingConfig; kv: Kv; mailer: Mailer };

export function hentTjenester(env: Record<string, string | undefined> = process.env): Tjenester | null {
  const cfg = lesVarslingConfig(env);
  if (!cfg.ok) return null;
  const { config } = cfg;
  return {
    config,
    kv: upstashKv(config.redisUrl, config.redisToken),
    mailer: resendMailer(config.resendKey, config.fra, { maksForsok: 2 }),
  };
}

export const INGEN_CACHE = { "Cache-Control": "no-store" } as const;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...INGEN_CACHE, ...headers } });
}

/** 503 når varsling ikke er satt opp ennå. */
export function ikkeKonfigurert(): NextResponse {
  return json(503, {
    ok: false,
    melding: "Varsling kommer snart! Tjenesten er ikke skrudd på ennå.",
    kode: "ikke_konfigurert",
  });
}

export function klientIp(req: Request): string {
  const h = req.headers;
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukjent";
}

let kommuner: Set<string> | null = null;
export function kommuneFinnes(nr: string): boolean {
  kommuner ??= new Set(getSteder().flatMap((s) => (s.kommunenr ? [s.kommunenr] : [])));
  return kommuner.has(nr);
}

/** Omdirigering til en fast intern side (aldri en adresse fra forespørselen → ingen åpen omdirigering). */
export function tilSide(req: Request, sti: `/varsling/${string}`, status: string): NextResponse {
  const url = new URL(sti, req.url);
  url.search = `?status=${encodeURIComponent(status)}`;
  return NextResponse.redirect(url, { status: 303, headers: { ...INGEN_CACHE, "Referrer-Policy": "no-referrer" } });
}
