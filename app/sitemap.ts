import type { MetadataRoute } from "next";
import { getDatasett } from "@/lib/server/data";
import { sisteTilsyn } from "@/lib/stats";

const SITE = "https://smilefjeskartet.no";

export default function sitemap(): MetadataRoute.Sitemap {
  const d = getDatasett();
  const oppdatert = new Date(d.generert);
  return [
    { url: SITE, lastModified: oppdatert, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE}/analyse`, lastModified: oppdatert, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/om`, changeFrequency: "monthly", priority: 0.5 },
    ...d.steder.map((s) => ({
      url: `${SITE}/sted/${s.slug}`,
      lastModified: new Date(sisteTilsyn(s).dato),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
