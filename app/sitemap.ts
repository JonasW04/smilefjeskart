import type { MetadataRoute } from "next";
import { getDatasett } from "@/lib/server/data";
import { lokaleSider, lokalUrlSti } from "@/lib/server/lokal";
import { fylker, kjeder, kommuner, type Omrade } from "@/lib/server/omrader";
import { SITEMAP_IDER, type SitemapId } from "@/lib/seo";
import { sisteTilsyn } from "@/lib/stats";
import type { Sted } from "@/lib/types";

const SITE = "https://smilefjeskartet.no";

// Delt etter sidetype, så Search Console viser indekseringen for hver type for seg. Delene ligger på
// /sitemap/<id>.xml, og /sitemap.xml er indeksen som lister dem (app/sitemap-index.xml).
export function generateSitemaps() {
  return SITEMAP_IDER.map((id) => ({ id }));
}

function sistEndret(o: { steder: readonly Sted[] }): Date {
  let maks = "";
  for (const s of o.steder) {
    const d = sisteTilsyn(s).dato;
    if (d > maks) maks = d;
  }
  return new Date(maks);
}

function core(): MetadataRoute.Sitemap {
  const oppdatert = new Date(getDatasett().generert);
  return [
    { url: SITE, lastModified: oppdatert, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE}/siste`, lastModified: oppdatert, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/kommune`, lastModified: oppdatert, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/analyse`, lastModified: oppdatert, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/prediksjon`, lastModified: oppdatert, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/varsling`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/om`, changeFrequency: "monthly", priority: 0.5 },
  ];
}

function omrader(): MetadataRoute.Sitemap {
  const liste = (sti: string, o: Omrade[], priority: number) =>
    o.map((o) => ({
      url: `${SITE}/${sti}/${o.slug}`,
      lastModified: sistEndret(o),
      changeFrequency: "weekly" as const,
      priority,
    }));
  return [
    ...liste("fylke", fylker(), 0.7),
    ...liste("kommune", kommuner(), 0.7),
    ...liste("kjede", kjeder(), 0.6),
    ...lokaleSider().map((l) => ({
      url: `${SITE}${lokalUrlSti(l)}`,
      lastModified: sistEndret(l),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

function steder(): MetadataRoute.Sitemap {
  return getDatasett().steder.map((s) => ({
    url: `${SITE}/sted/${s.slug}`,
    lastModified: new Date(sisteTilsyn(s).dato),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
}

const DELER: Record<SitemapId, () => MetadataRoute.Sitemap> = { core, omrader, steder };

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const del = DELER[(await id) as SitemapId];
  return del ? del() : [];
}
