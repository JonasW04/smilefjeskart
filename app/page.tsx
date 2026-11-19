import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import KartLaster from "@/components/kart/KartLaster";

const title = "Smilefjes på kart – oversikt over Mattilsynets tilsyn | Smilefjeskartet";
const description =
  "Se smilefjeset til alle restauranter, kafeer og spisesteder i Norge på ett kart. Alle Mattilsynets smilefjestilsyn siden 2016, med historikk for hvert sted. Oppdateres hver morgen.";
const url = "https://smilefjeskartet.no";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: "website", locale: "nb_NO", siteName: "Smilefjeskartet" },
  twitter: { card: "summary_large_image", title, description },
};

// Gjelder nettstedet som helhet, så det hører hjemme på forsiden og ikke på hver av de over 9 000 sidene.
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Smilefjeskartet",
    url,
    description:
      "Alle Mattilsynets smilefjestilsyn siden 2016 på ett kart. Se hvordan restauranter, kafeer og spisesteder i Norge har gjort det over tid – smil, strekmunn eller sur munn. Oppdateres hver morgen.",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "All",
    inLanguage: "nb",
    offers: { "@type": "Offer", price: "0", priceCurrency: "NOK" },
    provider: { "@type": "Organization", name: "Smilefjeskartet", url },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Smilefjeskartet",
    url,
    description: "Interaktivt kart over Mattilsynets smilefjeskontroller for restauranter og spisesteder i Norge.",
    inLanguage: "nb",
  },
];

export default function Forside() {
  return (
    <div className="site h-dvh overflow-hidden">
      {jsonLd.map((ld) => (
        <script key={ld["@type"]} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ))}
      <SiteHeader />
      <main id="innhold" className="relative min-h-0 flex-1">
        <h1 className="sr-only">Smilefjeskartet – Mattilsynets smilefjestilsyn på kart</h1>
        <noscript>
          <div className="mx-auto max-w-xl space-y-3 p-6">
            <p className="font-display text-2xl font-extrabold">Kartet trenger JavaScript 🙈</p>
            <p>
              Smilefjeskartet viser alle Mattilsynets smilefjestilsyn for serveringssteder i Norge. Slå på JavaScript for
              å bruke kartet, eller les mer på <a className="link" href="/om">om-siden</a> og i{" "}
              <a className="link" href="/analyse">analysen</a>.
            </p>
          </div>
        </noscript>
        <KartLaster />
      </main>
    </div>
  );
}
