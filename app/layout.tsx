import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import VercelAnalytics from "./analytics";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Smilefjeskartet – Se Mattilsynets Smilefjeskontroller på Kart",
  description:
    "Søk og utforsk Mattilsynets smilefjeskontroller på et interaktivt kart. Se hvilke restauranter, kafeer og spisesteder i Norge som har fått smil, strek eller sur munn – oppdatert med offentlige data fra Mattilsynet.",
  keywords: [
    "smilefjes",
    "mattilsynet",
    "mattilsynet smilefjes",
    "smilefjesordningen",
    "smilefjeskartet",
    "smilefjeskart",
    "restaurantkontroll",
    "restaurant hygiene norge",
    "matkontroll norge",
    "mattilsynet kart",
    "mattilsynet restaurantkontroll",
    "hygienekontroll",
    "restauranttilsyn",
    "mattilsynet tilsyn",
    "smilefjes restaurant",
    "smilefjes kart norge",
    "spisested kontroll",
    "næringsmiddeltilsyn",
    "mathygiene",
    "trygg mat",
  ],
  metadataBase: new URL("https://smilefjeskartet.no"),
  openGraph: {
    title: "Smilefjeskartet – Se Mattilsynets Smilefjeskontroller på Kart",
    description:
      "Søk og utforsk Mattilsynets smilefjeskontroller på et interaktivt kart. Se hvilke restauranter, kafeer og spisesteder i Norge som har fått smil, strek eller sur munn.",
    url: "https://smilefjeskartet.no",
    siteName: "Smilefjeskartet",
    locale: "nb_NO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smilefjeskartet – Se Mattilsynets Smilefjeskontroller på Kart",
    description:
      "Søk og utforsk Mattilsynets smilefjeskontroller på et interaktivt kart. Se hvilke restauranter, kafeer og spisesteder i Norge som har fått smil, strek eller sur munn.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb">
      <body
        className={`${figtree.variable} ${bricolage.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Smilefjeskartet",
              url: "https://smilefjeskartet.no",
              description:
                "Søk og utforsk Mattilsynets smilefjeskontroller på et interaktivt kart. Se hvilke restauranter, kafeer og spisesteder i Norge som har fått smil, strek eller sur munn – oppdatert med offentlige data fra Mattilsynet.",
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "All",
              inLanguage: "nb",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "NOK",
              },
              provider: {
                "@type": "Organization",
                name: "Smilefjeskartet",
                url: "https://smilefjeskartet.no",
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Smilefjeskartet",
              url: "https://smilefjeskartet.no",
              description:
                "Interaktivt kart over Mattilsynets smilefjeskontroller for restauranter og spisesteder i Norge.",
              inLanguage: "nb",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Smilefjeskartet",
              url: "https://smilefjeskartet.no",
              description:
                "Interaktivt kart over Mattilsynets smilefjeskontroller for restauranter og spisesteder i Norge.",
              logo: "https://smilefjeskartet.no/opengraph-image.png",
            }),
          }}
        />
        <noscript>
          <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "800px", margin: "0 auto" }}>
            <h1>Smilefjeskartet – Mattilsynets Smilefjeskontroller på Kart</h1>
            <p>
              Smilefjeskartet viser resultatene fra Mattilsynets restaurantkontroller i Norge på et
              interaktivt kart. Søk blant tusenvis av restauranter, kafeer og spisesteder for å se om
              de har fått smil, strekmunn eller sur munn etter hygienekontroll.
            </p>
            <h2>Hva er smilefjesordningen?</h2>
            <p>
              Smilefjesordningen er Mattilsynets system for å vise resultater fra tilsyn hos
              serveringssteder. Etter hvert tilsyn gis det en karakter som vises som et smilefjes:
            </p>
            <ul>
              <li><strong>Smil (grønt)</strong> – Ingen eller mindre brudd på regelverket.</li>
              <li><strong>Strekmunn (gult)</strong> – Brudd som krever oppfølging.</li>
              <li><strong>Sur munn (rødt)</strong> – Alvorlige brudd på regelverket.</li>
            </ul>
            <h2>Om dataene</h2>
            <p>
              Dataene på dette kartet hentes fra Mattilsynets offisielle smilefjesdatasett, som er
              offentlig tilgjengelig under NLOD 2.0-lisensen. Denne nettsiden er ikke tilknyttet
              Mattilsynet.
            </p>
            <p>
              Aktiver JavaScript for å bruke det interaktive kartet med søk og filtrering.
            </p>
          </div>
        </noscript>
        {children}
        <VercelAnalytics />
      </body>
    </html>
  );
}
