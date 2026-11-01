import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Når Google gjengir en side, forhåndslaster Next.js lenkene som ?_rsc=-forespørsler. I oktober 2026 var
      // det over halvparten av Googles forespørsler. /?sted= er kartvisningen av en stedside og peker kanonisk
      // til forsiden, og /api/ er data til kartet. Ingen av delene trengs for å indeksere sidene.
      disallow: ["/*_rsc=", "/?sted=", "/api/"],
    },
    sitemap: "https://smilefjeskartet.no/sitemap.xml",
  };
}
