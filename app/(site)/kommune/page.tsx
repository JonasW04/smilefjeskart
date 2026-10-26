import type { Metadata } from "next";
import Link from "next/link";
import { fylker, kommuner } from "@/lib/server/omrader";
import { tall } from "@/lib/chart";
import { andel, prosent } from "@/lib/stats";

const title = "Smilefjes i alle kommuner – kommuneoversikt | Smilefjeskartet";
const description = "Finn smilefjesene i din kommune. Alle norske kommuner og fylker med serveringssteder, antall tilsyn og andel smil fra Mattilsynet.";
const url = "https://smilefjeskartet.no/kommune";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: "website", locale: "nb_NO", siteName: "Smilefjeskartet" },
  twitter: { card: "summary_large_image", title, description },
};

export default function KommuneOversikt() {
  const alleKommuner = kommuner();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">Smilefjes i alle kommuner</h1>
      <p className="text-ink-soft">
        Velg kommune for å se alle serveringsstedene, utviklingen over tid og hvordan kommunen gjør det sammenlignet med resten av landet.
      </p>

      {[...fylker()]
        .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))
        .map((f) => (
          <section key={f.id} className="card p-5">
            <h2 className="font-display text-xl font-extrabold"><Link className="link" href={`/fylke/${f.slug}`}>{f.navn}</Link></h2>
            <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {alleKommuner
                .filter((k) => k.fylkeSlug === f.slug)
                .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))
                .map((k) => (
                  <li key={k.id}>
                    <Link className="link" href={`/kommune/${k.slug}`}>{k.navn}</Link>
                    <span className="text-xs tabular-nums text-ink-soft"> {tall(k.steder.length)} steder · {k.ordinaer.total ? prosent(andel(k.ordinaer, "smil")) + " smil" : "–"}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
