import type { NextRequest } from "next/server";
import { slettAbonnement } from "@/lib/varsling/store";
import { hentTjenester, ikkeKonfigurert, json, tilSide } from "@/lib/varsling/server";
import { verifiserToken } from "@/lib/varsling/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ett-klikks avmelding.
 * - GET: lenken nederst i e-posten. Sletter og viser en bekreftelsesside.
 * - POST: RFC 8058 (List-Unsubscribe-Post), sendt direkte av e-postklienten.
 * Begge sletter alt vi har lagret om abonnementet, og er idempotente.
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
  const res = await avmeld(req);
  if (res === null) return ikkeKonfigurert();
  return tilSide(req, "/varsling/avmeldt", res);
}

export async function POST(req: NextRequest) {
  const res = await avmeld(req);
  if (res === null) return ikkeKonfigurert();
  if (res === "ok") return json(200, { ok: true, melding: "Du er meldt av. Alle data om abonnementet er slettet." });
  if (res === "ugyldig") return json(400, { ok: false, melding: "Ugyldig avmeldingslenke." });
  return json(503, { ok: false, melding: "Noe gikk galt. Prøv igjen senere." });
}
