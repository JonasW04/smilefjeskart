import type { NextConfig } from "next";

/** Felles innholdssikkerhet; bare frame-ancestors (hvem som kan ramme inn siden) varierer. */
function csp(frameAncestors: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://tiles.openfreemap.org data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://tiles.openfreemap.org https://vitals.vercel-insights.com https://va.vercel-scripts.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

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
  async headers() {
    return [
      {
        // Alt unntatt /embed/*: bare egne sider kan ramme inn nettstedet.
        source: "/((?!embed/).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp("'self'") },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Widgetene er laget for å bygges inn på andres nettsider (iframe).
        // Ingen X-Frame-Options her: den kan ikke uttrykke «alle», og frame-ancestors styrer innrammingen.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp("*") },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
