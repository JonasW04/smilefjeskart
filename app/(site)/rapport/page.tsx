import type { Metadata } from "next";
import Link from "next/link";
import Smiley from "@/components/Smiley";
import { Flis } from "@/components/analyse/Deler";
import { pp, tall } from "@/lib/chart";
import { maanedNavn, smilEndringPp } from "@/lib/rapport";
import { maanedSum, maaneder, rapport, SITE, sisteRapport } from "@/lib/server/rapport";
import { andel, prosent } from "@/lib/stats";

const title = "Smilefjes-rapporten – månedlig statistikk over Mattilsynets smilefjes | Smilefjeskartet";
const description =
  "Hver måned: andel smil i Mattilsynets ordinære tilsyn, månedens sure munner og comebacks, og kommunene og kjedene som gjorde det best og svakest. Klar til sitering.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE}/rapport` },
  openGraph: { title, description, url: `${SITE}/rapport`, type: "website", locale: "nb_NO", siteName: "Smilefjeskartet" },
  twitter: { card: "summary_large_image", title, description },
};

const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RapportArkiv() {
  const siste = rapport(sisteRapport())!;
  const smil = andel(siste.ordinaer, "smil");

  const perAar = new Map<string, string[]>();
  for (const ym of [...maaneder()].reverse()) {
    const aar = ym.slice(0, 4);
    perAar.set(aar, [...(perAar.get(aar) ?? []), ym]);
  }

  return (
    <article className="space-y-8">
      <header className="card relative overflow-hidden bg-accent-soft p-5 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">📰 Hver måned</p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Smilefjes-rapporten</h1>
            <p className="text-lg text-ink-soft">
              Månedens smilefjes fra Mattilsynet, oppsummert: hvor mange som fikk smil, hvem som fikk sur munn, hvem som snudde det hele, og hvilke
              kommuner og kjeder som trekker opp og ned. Laget for lokalaviser, journalister og alle som vil sitere tallene.
            </p>
          </div>
          <div className="order-first flex shrink-0 items-end gap-1 self-start lg:order-none lg:self-center" aria-hidden>
            <span className="pop-in -rotate-6 text-6xl max-lg:text-5xl">📰</span>
            <span className="pop-in rotate-12" style={{ animationDelay: "90ms" }}>
              <Smiley kind="smil" size={80} className="max-lg:h-14 max-lg:w-14" />
            </span>
          </div>
        </div>
      </header>

      <section aria-labelledby="siste-tittel" className="card space-y-4 p-5 sm:p-6">
        <h2 id="siste-tittel" className="font-display text-2xl font-extrabold">
          Siste rapport: {stor(siste.navn)}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Flis etikett="Ordinære tilsyn" verdi={tall(siste.ordinaer.total)} />
          <Flis etikett="Med smil" verdi={prosent(smil)} under={`${pp(smilEndringPp(siste.snitt12, siste.ordinaer))} mot snittet siste 12 mnd`} />
          <Flis etikett="Sur munn" verdi={tall(siste.sur.length)} under={`og ${tall(siste.strek.length)} strekmunn`} />
          <Flis etikett="Comebacks" verdi={tall(siste.comebacks.length)} under="fra strek eller sur til smil" />
        </dl>
        <Link className="btn btn-primary" href={`/rapport/${siste.ym}`}>
          Les rapporten for {siste.navn} →
        </Link>
      </section>

      <section aria-labelledby="arkiv-tittel" className="card p-5 sm:p-6">
        <h2 id="arkiv-tittel" className="font-display text-2xl font-extrabold">
          Alle månedene
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-soft">Andel smil i ordinære tilsyn, og antall tilsyn, per måned siden 2016.</p>
        <div className="space-y-5">
          {[...perAar.entries()].map(([aar, liste]) => (
            <div key={aar}>
              <h3 className="mb-2 font-display text-lg font-extrabold">{aar}</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {liste.map((ym) => {
                  const m = maanedSum(ym)!;
                  return (
                    <li key={ym}>
                      <Link href={`/rapport/${ym}`} className="block rounded-xl border-2 border-line/20 px-3 py-2 hover:border-line hover:bg-accent-soft">
                        <span className="block text-sm font-bold">{stor(maanedNavn(ym).split(" ")[0])}</span>
                        <span className="block text-xs font-semibold text-ink-soft tabular-nums">
                          {prosent(andel(m.ordinaer, "smil"))} · {tall(m.ordinaer.total)} tilsyn
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <p className="text-sm text-ink-soft">
        Tall fra Mattilsynets åpne tilsynsdata. En måned får rapport når Mattilsynet har publisert tilsynene for hele måneden. Vil du vise tallene
        for kommunen din på egen nettside? Hver{" "}
        <Link className="link" href="/kommune">
          kommuneside
        </Link>{" "}
        har en widget du kan bygge inn.
      </p>
    </article>
  );
}
