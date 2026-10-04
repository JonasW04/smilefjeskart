import { getDatasett, getSteder } from "@/lib/server/data";
import { sluttDato } from "@/lib/server/omrader";
import { ferskeTilsyn, rssXml } from "@/lib/siste";

// Bygges ved deploy, som resten av dataene.
export const dynamic = "force-static";

const SITE = "https://smilefjeskartet.no";

/** RSS-strøm med nye sure munner, strekmunner og comebacks. */
export function GET() {
  const xml = rssXml(ferskeTilsyn(getSteder(), sluttDato()), SITE, getDatasett().generert);
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
