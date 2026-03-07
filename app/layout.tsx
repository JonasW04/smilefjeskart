import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import VercelAnalytics from "./analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smilefjeskartet – Kart for Restaurantkontroller fra Mattilsynet",
  description:
    "Se Mattilsynets smilefjeskontroller på restaurantene i Norge. Kart med smil, strek og sur munn – basert på offentlig data.",
  keywords: [
    "smilefjes",
    "mattilsynet",
    "restaurantkontroll",
    "smilefjeskart",
    "smilefjeskartet",
    "restaurant hygiene",
    "matkontroll norge",
    "mattilsynet kart",
    "mattilsynet smilefjes",
    "hygienekontroll",
    "restauranttilsyn",
  ],
  metadataBase: new URL("https://smilefjeskartet.no"),
  openGraph: {
    title: "Smilefjeskartet – Restaurantkontroller fra Mattilsynet",
    description:
      "Se Mattilsynets smilefjeskontroller på restaurantene i Norge. Kart med smil, strek og sur munn – basert på offentlig data.",
    url: "https://smilefjeskartet.no",
    siteName: "Smilefjeskartet",
    locale: "nb_NO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smilefjeskartet – Restaurantkontroller fra Mattilsynet",
    description:
      "Se Mattilsynets smilefjeskontroller på restaurantene i Norge. Kart med smil, strek og sur munn – basert på offentlig data.",
  },
  alternates: {
    canonical: "https://smilefjeskartet.no",
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
    <html lang="no">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
                "Se Mattilsynets smilefjeskontroller på restaurantene i Norge. Kart med smil, strek og sur munn – basert på offentlig data.",
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "All",
              inLanguage: "nb",
              provider: {
                "@type": "Organization",
                name: "Smilefjeskartet",
                url: "https://smilefjeskartet.no",
              },
            }),
          }}
        />
        {children}
        <VercelAnalytics />
      </body>
    </html>
  );
}
