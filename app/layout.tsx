import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff8ec" },
    { media: "(prefers-color-scheme: dark)", color: "#16111f" },
  ],
};

export const metadata: Metadata = {
  title: "Smilefjeskartet – Mattilsynets smilefjestilsyn på kart",
  description:
    "Alle Mattilsynets smilefjestilsyn siden 2016 på ett kart. Se hvordan restauranter, kafeer og spisesteder i Norge har gjort det over tid – smil, strekmunn eller sur munn. Oppdateres hver morgen.",
  metadataBase: new URL("https://smilefjeskartet.no"),
  openGraph: {
    title: "Smilefjeskartet – Mattilsynets smilefjestilsyn på kart",
    description:
      "Søk og utforsk Mattilsynets smilefjeskontroller på et interaktivt kart. Se hvilke restauranter, kafeer og spisesteder i Norge som har fått smil, strek eller sur munn.",
    url: "https://smilefjeskartet.no",
    siteName: "Smilefjeskartet",
    locale: "nb_NO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smilefjeskartet – Mattilsynets smilefjestilsyn på kart",
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
              "@type": "Organization",
              name: "Smilefjeskartet",
              url: "https://smilefjeskartet.no",
              description:
                "Interaktivt kart over Mattilsynets smilefjeskontroller for restauranter og spisesteder i Norge.",
              logo: "https://smilefjeskartet.no/apple-icon",
            }),
          }}
        />
        {children}
        <VercelAnalytics />
      </body>
    </html>
  );
}
