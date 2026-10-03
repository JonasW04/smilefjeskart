import type { NextRequest } from "next/server";
import { bekreftAbonnement } from "@/lib/varsling/store";
import { hentTjenester, ikkeKonfigurert, tilSide } from "@/lib/varsling/server";
import { verifiserToken } from "@/lib/varsling/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lenken i bekreftelses-e-posten. Aktiverer abonnementet og sender brukeren til en vennlig side. */
export async function GET(req: NextRequest) {
  const tjenester = hentTjenester();
  if (!tjenester) return ikkeKonfigurert();

  const v = verifiserToken(tjenester.config.secret, req.nextUrl.searchParams.get("token"), "bekreft");
  if (!v.ok) return tilSide(req, "/varsling/bekreftet", v.grunn);

  try {
    const res = await bekreftAbonnement(tjenester.kv, tjenester.config.secret, v.data.id);
    // «ukjent» = ventetiden er ute (abonnementet er slettet) – vis det som utløpt.
    return tilSide(req, "/varsling/bekreftet", res === "ok" ? "ok" : "utlopt");
  } catch (err) {
    console.error(`[varsling] Bekreftelse feilet: ${(err as Error).message}`);
    return tilSide(req, "/varsling/bekreftet", "feil");
  }
}
