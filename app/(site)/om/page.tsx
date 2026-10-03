import type { Metadata } from "next";
import Link from "next/link";
import Smiley from "@/components/Smiley";
import { getDatasett, landFordeling } from "@/lib/server/data";
import { andel, formatDato, prosent } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Om Smilefjeskartet – slik leser du smilefjesene",
  description:
    "Hva betyr smil, strekmunn og sur munn? Slik fungerer Mattilsynets smilefjesordning, hvor dataene kommer fra, og hvorfor vi ser på ordinære tilsyn.",
  alternates: { canonical: "https://smilefjeskartet.no/om" },
};

const FAQ = [
  {
    q: "Hva er smilefjesordningen?",
    a: "Mattilsynet kontrollerer serveringssteder og viser resultatet som et smilefjes. Fire områder vurderes: rutiner og ledelse, lokaler og utstyr, mathåndtering og tilberedning, og merking og sporbarhet. Det dårligste området bestemmer smilefjeset.",
  },
  {
    q: "Hva betyr smil, strekmunn og sur munn?",
    a: "Smil betyr ingen eller bare små brudd på regelverket. Strekmunn betyr brudd som må følges opp. Sur munn betyr alvorlige brudd. Etter strekmunn eller sur munn kommer Mattilsynet vanligvis tilbake innen kort tid.",
  },
  {
    q: "Hvorfor har nesten alle steder smil på kartet?",
    a: "Fordi steder som får strekmunn eller sur munn, nesten alltid får et oppfølgingstilsyn i løpet av dager eller uker, og da som regel smil. Derfor ser vi også på hvordan det gikk ved de ordinære tilsynene, som sier mer om hvordan stedet drives i hverdagen.",
  },
  {
    q: "Hvor kommer dataene fra?",
    a: "Tilsynsdataene er Mattilsynets åpne datasett (NLOD 2.0). Adresser plasseres på kartet med Kartverkets adresse-API, og kommune hentes fra postnummeret. Kjede og kategori gjettes ut fra stedsnavnet, så de kan ta feil for enkeltsteder.",
  },
  {
    q: "Er dette Mattilsynets nettside?",
    a: "Nei. Smilefjeskartet er et uavhengig prosjekt som bruker Mattilsynets åpne data. Ved spørsmål om et tilsyn må du kontakte Mattilsynet.",
  },
];

export default function OmSide() {
  const d = getDatasett();
  const land = landFordeling();
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <header className="space-y-3">
        <div className="flex gap-2" aria-hidden>
          <span className="pop-in -rotate-6"><Smiley kind="smil" size={56} /></span>
          <span className="pop-in rotate-3" style={{ animationDelay: "80ms" }}><Smiley kind="strek" size={56} /></span>
          <span className="pop-in -rotate-3" style={{ animationDelay: "160ms" }}><Smiley kind="sur" size={56} /></span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Om Smilefjeskartet</h1>
        <p className="text-lg text-ink-soft">
          Alle Mattilsynets {d.antallTilsyn.toLocaleString("nb-NO")} smilefjestilsyn hos{" "}
          {d.steder.length.toLocaleString("nb-NO")} serveringssteder, samlet på ett kart. Oppdatert {formatDato(d.generert.slice(0, 10))}.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Smilefjesene">
        {(
          [
            ["smil", "Smil", "Ingen eller små brudd på regelverket.", "bg-smil-soft"],
            ["strek", "Strekmunn", "Brudd som må følges opp.", "bg-strek-soft"],
            ["sur", "Sur munn", "Alvorlige brudd på regelverket.", "bg-sur-soft"],
          ] as const
        ).map(([k, tittel, tekst, bg]) => (
          <div key={k} className={`card ${bg} p-4`}>
            <Smiley kind={k} size={48} />
            <p className="mt-2 font-display text-xl font-extrabold">{tittel}</p>
            <p className="text-sm text-ink-soft">{tekst}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="font-display text-2xl font-extrabold">Det viktigste tallet: ordinære tilsyn</h2>
        <p>
          Nesten alle steder på kartet har smil akkurat nå. Det er ikke fordi alle er flinke, men fordi Mattilsynet
          kommer tilbake raskt etter et dårlig resultat: etter strekmunn går det typisk rundt <strong>10 dager</strong> til
          neste tilsyn, etter sur munn bare <strong>3 dager</strong>.
        </p>
        <p>
          Derfor viser vi også hvordan det gikk ved de <strong>ordinære tilsynene</strong>, altså de vanlige, uanmeldte
          besøkene. I hele Norge endte <strong>{prosent(andel(land, "smil"))}</strong> av dem med smil,{" "}
          <strong>{prosent(andel(land, "strek"))}</strong> med strekmunn og <strong>{prosent(andel(land, "sur"), 1)}</strong> med sur munn.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-extrabold">Spørsmål og svar</h2>
        {FAQ.map((f) => (
          <details key={f.q} className="card group p-4 open:bg-accent-soft/40">
            <summary className="cursor-pointer list-none font-bold marker:hidden">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
              {f.q}
            </summary>
            <p className="mt-2 text-ink-soft">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="card space-y-2 bg-paper-2 p-5">
        <h2 className="font-display text-xl font-extrabold">Fant du en feil?</h2>
        <p className="text-ink-soft">
          Står et sted på feil sted på kartet, eller har kjeden blitt feil? Meld fra på{" "}
          <a className="link" href="https://github.com/JonasW04/smilefjeskart/issues" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          . Spørsmål om selve tilsynet må rettes til{" "}
          <a className="link" href="https://www.mattilsynet.no/" target="_blank" rel="noopener noreferrer">
            Mattilsynet
          </a>
          .
        </p>
        <p>
          <Link href="/" className="btn mt-2">🗺️ Til kartet</Link>
        </p>
      </section>
    </div>
  );
}
