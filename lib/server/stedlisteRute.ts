import { getOmrade, stedTupler, type OmradeType } from "./omrader";

/**
 * GET-handler for /kommune/[slug]/steder.json og /kjede/[slug]/steder.json: alle stedene i området
 * som StedTuppel[]. Lista på områdesiden henter den først når noen søker eller vil se flere.
 */
export function stedlisteGet(type: Extract<OmradeType, "kommune" | "kjede">) {
  return async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const o = getOmrade(type, slug);
    if (!o) return new Response("Fant ikke området", { status: 404 });
    return Response.json(stedTupler(o));
  };
}
