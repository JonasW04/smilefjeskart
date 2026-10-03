import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Smiley from "@/components/Smiley";

export default function IkkeFunnet() {
  return (
    <div className="site">
      <SiteHeader />
      <main id="innhold" className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
        <div className="pop-in inline-block -rotate-6">
          <Smiley kind="strek" size={120} />
        </div>
        <h1 className="mt-4 font-display text-4xl font-extrabold">404 – her var det tomt</h1>
        <p className="mt-2 text-ink-soft">
          Siden finnes ikke. Kanskje den ble ryddet bort ved forrige tilsyn? 🧽
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary">🗺️ Til kartet</Link>
          <Link href="/analyse" className="btn">📊 Analyse</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
