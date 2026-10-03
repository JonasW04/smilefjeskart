import SiteHeader from "@/components/SiteHeader";
import KartLaster from "@/components/kart/KartLaster";

export default function Forside() {
  return (
    <div className="site h-dvh overflow-hidden">
      <SiteHeader />
      <main id="innhold" className="relative min-h-0 flex-1">
        <h1 className="sr-only">Smilefjeskartet – Mattilsynets smilefjestilsyn på kart</h1>
        <KartLaster />
      </main>
    </div>
  );
}
