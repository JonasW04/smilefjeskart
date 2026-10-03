import { NextResponse } from "next/server";
import { KATEGORI_EMOJI, KATEGORI_NAVN } from "@/lib/classify";
import { getSted, landFordeling } from "@/lib/server/data";
import { andel, fordeling, ordinaereKarakterer } from "@/lib/stats";

export type StedApi = {
  slug: string;
  navn: string;
  adresse: string;
  kommune: string | null;
  kategori: string;
  kjede: string | null;
  tilsyn: Array<{ dato: string; karakter: number; oppfolging: boolean }>;
  ordinaer: { smil: number; strek: number; sur: number; total: number };
  landAndelSmil: number;
};

/** Kompakt stedsinfo til kartets sidepanel. Data endres bare ved deploy, så svaret caches hardt. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getSted(slug);
  if (!s) return NextResponse.json({ feil: "Fant ikke stedet" }, { status: 404 });

  const body: StedApi = {
    slug: s.slug,
    navn: s.navn,
    adresse: [s.adresse, s.poststed].filter(Boolean).join(", "),
    kommune: s.kommune,
    kategori: `${KATEGORI_EMOJI[s.kategori]} ${KATEGORI_NAVN[s.kategori]}`,
    kjede: s.kjede,
    tilsyn: s.tilsyn.map(({ dato, karakter, oppfolging }) => ({ dato, karakter, oppfolging })),
    ordinaer: fordeling(ordinaereKarakterer(s)),
    landAndelSmil: andel(landFordeling(), "smil"),
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" },
  });
}
