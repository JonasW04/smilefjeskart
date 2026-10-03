import SiteHeader from "@/components/SiteHeader";
import KartLaster from "@/components/kart/KartLaster";

export default function Forside() {
  return (
    <div className="site h-dvh overflow-hidden">
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
