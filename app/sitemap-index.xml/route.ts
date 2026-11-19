import { sitemapIndeks } from "@/lib/seo";

// Next.js lager ingen sitemap-indeks selv og reserverer /sitemap.xml for app/sitemap.ts, så indeksen ligger her og
// next.config.ts skriver /sitemap.xml om hit.
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(sitemapIndeks(), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
