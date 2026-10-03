import type { Metadata } from "next";
import Link from "next/link";
import Smiley from "@/components/Smiley";
import VarslingSkjema from "@/components/varsling/VarslingSkjema";
import { getSteder } from "@/lib/server/data";
import { varslingAktiv } from "@/lib/varsling/config";
import { sokelister } from "@/lib/varsling/omrade";

export const metadata: Metadata = {
  title: "Varsling – få nye smilefjes rett i innboksen | Smilefjeskartet",
  description:
    "Få en e-post når Mattilsynet deler ut smil, strekmunn eller sur munn i nabolaget ditt eller kommunen din. Gratis, maks én e-post om dagen, og avmelding med ett klikk.",
  alternates: { canonical: "https://smilefjeskartet.no/varsling" },
};

const STEG = [
  { emoji: "📍", tittel: "Velg et område", tekst: "Rundt hjemme, jobben eller hytta – eller hele kommuner." },
  { emoji: "📬", tittel: "Bekreft e-posten", tekst: "Du får en lenke. Ingenting skjer før du har trykket på den." },
  { emoji: "🔔", tittel: "Få beskjed", tekst: "Når Mattilsynet har vært på besøk, får du ett sammendrag. Maks én e-post om dagen." },
];

const FAQ = [
  {
    q: "Hvor raskt får jeg vite om et nytt tilsyn?",
    a: "Vi sjekker Mattilsynets åpne data hver morgen. Mattilsynet publiserer ofte tilsyn noen dager etter at de skjedde, så varselet kommer gjerne en stund etter selve besøket.",
  },
  {
    q: "Kan jeg ha flere varsler?",
    a: "Én e-postadresse har ett varsel. Lager du et nytt og bekrefter det, erstatter det det gamle. Vil du følge flere steder, kan du velge opptil ti kommuner i samme varsel.",
  },
  {
    q: "Hvorfor kom det ingen e-post?",
    a: "Sjekk søppelposten. Kommer det fortsatt ingenting, kan du prøve igjen litt senere. Av hensyn til misbruk sender vi maks tre bekreftelses-e-poster til samme adresse per døgn.",
  },
  {
    q: "Er dette Mattilsynet?",
    a: "Nei. Smilefjeskartet er et uavhengig prosjekt som bruker Mattilsynets åpne data. Spørsmål om et tilsyn må rettes til Mattilsynet.",
  },
];

export default function VarslingSide() {
  const aktiv = varslingAktiv();
  const { kommuner, poststeder } = aktiv ? sokelister(getSteder()) : { kommuner: [], poststeder: [] };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <div className="flex items-end gap-1" aria-hidden>
          <span className="pop-in -rotate-6">
            <Smiley kind="sur" size={52} />
          </span>
          <span className="pop-in rotate-3" style={{ animationDelay: "80ms" }}>
            <Smiley kind="strek" size={44} />
          </span>
          <span className="pop-in -rotate-3 text-5xl" style={{ animationDelay: "160ms" }}>
            📬
          </span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Nye smilefjes, rett i innboksen
        </h1>
        <p className="max-w-2xl text-lg text-ink-soft">
          Fikk pizzastedet på hjørnet sur munn? Velg et område, så sier vi fra når Mattilsynet har vært på besøk. Gratis,
          uten reklame, og du melder deg av med ett klikk.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {aktiv ? <VarslingSkjema kommuner={kommuner} poststeder={poststeder} /> : <KommerSnart />}

        <aside className="space-y-6">
          <section className="card p-5" aria-labelledby="steg-tittel">
            <h2 id="steg-tittel" className="font-display text-xl font-extrabold">
              Slik funker det
            </h2>
            <ol className="mt-3 space-y-3">
              {STEG.map((s, i) => (
                <li key={s.tittel} className="flex gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-line bg-accent-soft text-xl" aria-hidden>
                    {s.emoji}
                  </span>
                  <div>
                    <p className="font-bold">
                      <span className="sr-only">Steg {i + 1}: </span>
                      {s.tittel}
                    </p>
                    <p className="text-sm text-ink-soft">{s.tekst}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card bg-smil-soft p-5" aria-labelledby="kort-personvern">
            <h2 id="kort-personvern" className="font-display text-xl font-extrabold">
              🔒 Kort om personvern
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>✓ Vi lagrer bare e-post, område og valg.</li>
              <li>✓ Ingen sporing i e-postene, ingen reklame, ingen deling.</li>
              <li>✓ Avmelding med ett klikk sletter alt.</li>
            </ul>
            <a className="link mt-2 inline-block text-sm" href="#personvern">
              Hele forklaringen ↓
            </a>
          </section>
        </aside>
      </div>

      <section id="personvern" className="card scroll-mt-24 space-y-4 p-5 sm:p-7" aria-labelledby="personvern-tittel">
        <h2 id="personvern-tittel" className="font-display text-2xl font-extrabold">
          Personvern: dette lagrer vi, og hvorfor
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Punkt tittel="Hva vi lagrer">
            E-postadressen din, området du har valgt (et punkt avrundet til ca. 100 meter og en radius, eller kommuner), hvilke
            smilefjes du vil høre om, og når du meldte deg på og bekreftet. Ikke navn, ikke IP-adresse, ikke noe annet.
          </Punkt>
          <Punkt tittel="Hvorfor">
            Bare for å sende deg varslene du har bedt om. Behandlingsgrunnlaget er samtykket ditt, som du gir ved å bekrefte
            e-posten. Vi bruker ikke adressen til noe annet, og deler den ikke med noen.
          </Punkt>
          <Punkt tittel="Hvor lenge">
            Til du melder deg av. Ubekreftede påmeldinger slettes automatisk etter 48 timer. For å stoppe misbruk teller vi
            forsøk per IP-adresse og e-postadresse i opptil ett døgn, men da bare som en uleselig kode (hash), aldri selve
            adressen.
          </Punkt>
          <Punkt tittel="Hvem som behandler dataene">
            Abonnementet lagres hos{" "}
            <a className="link" href="https://upstash.com/trust/privacy.pdf" target="_blank" rel="noopener noreferrer">
              Upstash
            </a>{" "}
            (database i EU), og e-postene sendes via{" "}
            <a className="link" href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
              Resend
            </a>
            , som fører en logg over utsendte e-poster en kort periode. E-postene har ingen sporingspiksler eller sporede lenker.
          </Punkt>
          <Punkt tittel="Slik sletter du alt">
            Trykk «Meld meg av» nederst i en hvilken som helst e-post fra oss. Da slettes abonnementet og e-postadressen din med
            én gang. Mange e-postprogrammer har også en egen «Avslutt abonnement»-knapp som gjør det samme.
          </Punkt>
          <Punkt tittel="Dobbel bekreftelse">
            Ingen kan melde deg på uten tilgang til innboksen din: vi sender ingen varsler før lenken i bekreftelses-e-posten
            er trykket på. Spørsmål om personvern? Ta kontakt via{" "}
            <a className="link" href="https://github.com/JonasW04/smilefjeskart/issues" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </Punkt>
        </dl>
      </section>

      <section className="space-y-3" aria-labelledby="faq-tittel">
        <h2 id="faq-tittel" className="font-display text-2xl font-extrabold">
          Spørsmål og svar
        </h2>
        {FAQ.map((f) => (
          <details key={f.q} className="card group p-4 open:bg-accent-soft/40">
            <summary className="cursor-pointer list-none font-bold marker:hidden">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
                ▸
              </span>
              {f.q}
            </summary>
            <p className="mt-2 text-ink-soft">{f.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}

function Punkt({ tittel, children }: { tittel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-paper p-4">
      <dt className="font-bold">{tittel}</dt>
      <dd className="mt-1 text-sm text-ink-soft">{children}</dd>
    </div>
  );
}

function KommerSnart() {
  return (
    <section className="card bg-strek-soft p-6 sm:p-8" aria-labelledby="snart-tittel">
      <div className="pop-in mb-3 w-fit rotate-6 text-5xl" aria-hidden>
        🛠️
      </div>
      <h2 id="snart-tittel" className="font-display text-3xl font-extrabold">
        Varsling kommer snart!
      </h2>
      <p className="mt-2 text-ink-soft">
        Vi skrur på de siste skruene. Snart kan du velge et område og få en e-post når noen der får smil, strekmunn eller sur
        munn. Ta en titt innom igjen om litt.
      </p>
      <p className="mt-5">
        <Link href="/" className="btn">
          🗺️ Utforsk kartet så lenge
        </Link>
      </p>
    </section>
  );
}
