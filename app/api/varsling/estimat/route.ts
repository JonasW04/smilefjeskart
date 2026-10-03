import type { NextRequest } from "next/server";
import { getDatasett } from "@/lib/server/data";
import { SMILES, type Smile } from "@/lib/smile";
import { estimat } from "@/lib/varsling/omrade";
import { json, kommuneFinnes } from "@/lib/varsling/server";
import { MAKS_KOMMUNER, type Omrade } from "@/lib/varsling/typer";
import { gyldigRadius, iNorge } from "@/lib/varsling/validering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hvor mye post kan man vente seg? Teller steder og tilsyn siste 12 måneder i et område.
 * Bare åpne data, ingen lagring – virker også før varsling er skrudd på.
 */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  let omrade: Omrade | null = null;
  if (q.has("kommuner")) {
    const k = (q.get("kommuner") ?? "").split(",").filter(Boolean);
    if (k.length > 0 && k.length <= MAKS_KOMMUNER && k.every((nr) => /^\d{4}$/.test(nr) && kommuneFinnes(nr))) {
      omrade = { type: "kommuner", kommuner: k };
    }
  } else {
    const lat = Number(q.get("lat"));
    const lng = Number(q.get("lng"));
    const km = Number(q.get("km"));
    if (iNorge(lat, lng) && gyldigRadius(km)) omrade = { type: "radius", lat, lng, km };
  }
  const filtre = (q.get("filtre") ?? "").split(",").filter((f): f is Smile => (SMILES as readonly string[]).includes(f));
  if (!omrade || filtre.length === 0) return json(400, { ok: false, melding: "Ugyldig område eller filtre." });

  const d = getDatasett();
  const e = estimat(omrade, filtre, d.steder, d.generert.slice(0, 10));
  return json(200, { ok: true, ...e }, { "Cache-Control": "public, max-age=3600, s-maxage=3600" });
}
