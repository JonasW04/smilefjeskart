import type { MetadataRoute } from "next";
import { getDatasett } from "@/lib/server/data";
import { lokaleSider, lokalUrlSti } from "@/lib/server/lokal";
import { fylker, kjeder, kommuner } from "@/lib/server/omrader";
import type { Sted } from "@/lib/types";
import { sisteTilsyn } from "@/lib/stats";

const SITE = "https://smilefjeskartet.no";

function sistEndret(o: { steder: readonly Sted[] }): Date {
  let maks = "";
  for (const s of o.steder) {
    const d = sisteTilsyn(s).dato;
    if (d > maks) maks = d;
  }
  return new Date(maks);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const d = getDatasett();
  const oppdatert = new Date(d.generert);
  const omrader = (sti: string, liste: Array<{ slug: string; steder: readonly Sted[] }>, priority: number) =>
    liste.map((o) => ({
      url: `${SITE}/${sti}/${o.slug}`,
      lastModified: sistEndret(o),
      changeFrequency: "weekly" as const,
      priority,
    }));
  return [
    { url: SITE, lastModified: oppdatert, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE}/siste`, lastModified: oppdatert, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/kommune`, lastModified: oppdatert, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/analyse`, lastModified: oppdatert, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/prediksjon`, lastModified: oppdatert, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/varsling`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/om`, changeFrequency: "monthly", priority: 0.5 },
    ...omrader("fylke", fylker(), 0.7),
    ...omrader("kommune", kommuner(), 0.7),
    ...omrader("kjede", kjeder(), 0.6),
    ...lokaleSider().map((l) => ({
      url: `${SITE}${lokalUrlSti(l)}`,
      lastModified: sistEndret(l),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...d.steder.map((s) => ({
      url: `${SITE}/sted/${s.slug}`,
      lastModified: new Date(sisteTilsyn(s).dato),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
