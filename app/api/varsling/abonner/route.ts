import { getSteder } from "@/lib/server/data";
import { behandleAbonnement } from "@/lib/varsling/abonner";
import { hentTjenester, ikkeKonfigurert, json, klientIp, kommuneFinnes } from "@/lib/varsling/server";
import { maskerEpost } from "@/lib/varsling/validering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_BODY = 4096;

export async function POST(req: Request) {
  const tjenester = hentTjenester();
  if (!tjenester) return ikkeKonfigurert();

  // Bare vårt eget skjema: JSON fra samme opphav (stopper skjemaer på andre nettsteder).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== tjenester.config.siteUrl) {
    return json(403, { ok: false, melding: "Forespørselen kom fra et annet nettsted." });
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json(415, { ok: false, melding: "Forventet JSON." });
  }

  const tekst = await req.text();
  if (tekst.length > MAKS_BODY) return json(413, { ok: false, melding: "Forespørselen er for stor." });
  let body: unknown;
  try {
    body = JSON.parse(tekst);
  } catch {
    return json(400, { ok: false, melding: "Ugyldig JSON." });
  }

  const svar = await behandleAbonnement(
    body,
    { ip: klientIp(req) },
    {
      ...tjenester,
      steder: getSteder(),
      kommuneFinnes,
      logg: (m) => console.warn(`[varsling] ${maskerEpost(m)}`),
    },
  );
  return json(svar.status, svar.body, svar.status === 429 ? { "Retry-After": "600" } : {});
}

export function GET() {
  return json(405, { ok: false, melding: "Bruk POST." }, { Allow: "POST" });
}
