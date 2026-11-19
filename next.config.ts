import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serversider leser generated/steder.json fra disk; sørg for at fila følger med i deployen.
  outputFileTracingIncludes: {
    "/**": ["./generated/steder.json", "./assets/fonts/*.ttf", "./generated/prediksjon.json"],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.smilefjeskartet.no" }],
        destination: "https://smilefjeskartet.no/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      // Google kjenner /sitemap.xml. Next.js reserverer den adressen for app/sitemap.ts, men med generateSitemaps
      // ligger delene på /sitemap/<id>.xml og ingenting svarer på /sitemap.xml. Indeksen svarer i stedet.
      beforeFiles: [{ source: "/sitemap.xml", destination: "/sitemap-index.xml" }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https://tiles.openfreemap.org data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://tiles.openfreemap.org https://vitals.vercel-insights.com https://va.vercel-scripts.com",
              "worker-src 'self' blob:",
              "child-src 'self' blob:",
              "frame-ancestors 'self'",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
