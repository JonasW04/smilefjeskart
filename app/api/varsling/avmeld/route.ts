import { NextResponse, type NextRequest } from "next/server";
import { slettAbonnement } from "@/lib/varsling/store";
import { hentTjenester, ikkeKonfigurert, INGEN_CACHE, json, tilSide } from "@/lib/varsling/server";
import { verifiserToken } from "@/lib/varsling/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ett-klikks avmelding.
 * - GET: lenken nederst i e-posten. Viser en knapp som bekrefter avmeldingen.
 * - POST: RFC 8058 (List-Unsubscribe-Post), sendt direkte av e-postklienten.
 * GET endrer ingenting: e-postprogrammer og sikkerhetsskannere kan hente lenken automatisk.
 * POST sletter abonnementet og er idempotent.
 */
async function avmeld(req: NextRequest): Promise<"ok" | "ugyldig" | "feil" | null> {
  const tjenester = hentTjenester();
  if (!tjenester) return null;
  const v = verifiserToken(tjenester.config.secret, req.nextUrl.searchParams.get("token"), "avmeld");
  if (!v.ok) return "ugyldig";
  try {
    await slettAbonnement(tjenester.kv, tjenester.config.secret, v.data.id);
    return "ok";
  } catch (err) {
    console.error(`[varsling] Avmelding feilet: ${(err as Error).message}`);
    return "feil";
  }
}

export async function GET(req: NextRequest) {
  const tjenester = hentTjenester();
  if (!tjenester) return ikkeKonfigurert();
  const token = req.nextUrl.searchParams.get("token");
  if (!verifiserToken(tjenester.config.secret, token, "avmeld").ok) return tilSide(req, "/varsling/avmeldt", "ugyldig");
  const url = new URL("/varsling/avmeldt", req.url);
  url.searchParams.set("status", "bekreft");
  url.searchParams.set("token", token!);
  return NextResponse.redirect(url, { status: 303, headers: { ...INGEN_CACHE, "Referrer-Policy": "no-referrer" } });
}

export async function POST(req: NextRequest) {
  const res = await avmeld(req);
  if (res === null) return ikkeKonfigurert();
  // Bare skjemaet på vår nettside ber om en HTML-side. RFC 8058 får et direkte svar uten redirect.
  if (req.nextUrl.searchParams.get("manuell") === "1") return tilSide(req, "/varsling/avmeldt", res);
  if (res === "ok") return json(200, { ok: true, melding: "Du er meldt av. Alle data om abonnementet er slettet." });
  if (res === "ugyldig") return json(400, { ok: false, melding: "Ugyldig avmeldingslenke." });
  return json(503, { ok: false, melding: "Noe gikk galt. Prøv igjen senere." });
}
