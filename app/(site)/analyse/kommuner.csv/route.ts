import { anmerkningAndel, tilCsv } from "@/lib/analyse";
import { kommuner, MIN_KOMMUNE } from "@/lib/server/omrader";
import { andel } from "@/lib/stats";

// Bygges ved deploy, som resten av dataene.
export const dynamic = "force-static";

const SITE = "https://smilefjeskartet.no";

/** Nøkkeltall per kommune (ordinære tilsyn siden 2016) som CSV for egne analyser. */
export function GET() {
  const rund = (x: number) => Math.round(x * 10000) / 10000;
  const rader = [...kommuner()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((k) => [
      k.id,
      k.navn,
      k.fylke,
      k.steder.length,
      k.tilsyn,
      k.ordinaer.total,
      k.ordinaer.smil,
      k.ordinaer.strek,
      k.ordinaer.sur,
      rund(andel(k.ordinaer, "smil")),
      rund(anmerkningAndel(k.ordinaer)),
      k.ordinaer.total >= MIN_KOMMUNE ? "ja" : "nei",
      `${SITE}/kommune/${k.slug}`,
    ]);
  const csv = tilCsv(
    [
      "kommunenr",
      "kommune",
      "fylke",
      "steder",
      "tilsyn_alle",
      "ordinaere_tilsyn",
      "smil",
      "strekmunn",
      "sur_munn",
      "andel_smil",
      "andel_strek_eller_sur",
      `rangert_min_${MIN_KOMMUNE}`,
      "url",
    ],
    rader,
  );
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="smilefjes-kommuner.csv"',
    },
  });
}
