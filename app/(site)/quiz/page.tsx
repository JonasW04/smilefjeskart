import type { Metadata } from "next";
import Link from "next/link";
import Smiley from "@/components/Smiley";
import QuizApp from "@/components/quiz/QuizApp";
import { leggTilDager, osloDato, quizerForDatoer } from "@/lib/quiz";
import { getSteder } from "@/lib/server/data";
import { lesFrosneQuizer } from "@/lib/server/quiz";

const SITE = "https://smilefjeskartet.no";
const TITTEL = "Gjett smilefjeset – dagens Smilefjes-quiz";
const BESKRIVELSE =
  "Fem ekte norske spisesteder hver dag. Fikk de smil, strekmunn eller sur munn på siste tilsyn fra Mattilsynet? Gjett, se fasiten og del resultatet.";

export const metadata: Metadata = {
  title: `${TITTEL} | Smilefjeskartet`,
  description: BESKRIVELSE,
  alternates: { canonical: `${SITE}/quiz` },
  openGraph: {
    title: TITTEL,
    description: BESKRIVELSE,
    url: `${SITE}/quiz`,
    type: "website",
    locale: "nb_NO",
    siteName: "Smilefjeskartet",
  },
  twitter: { card: "summary_large_image", title: TITTEL, description: BESKRIVELSE },
};

// Siden bygges ved hver deploy (daglig). Den lages også på nytt innimellom, så dagsquizene
// holder seg ferske selv om en datajobb skulle feile.
export const revalidate = 21600;

/**
 * Dager rundt byggetidspunktet som får ferdig utregnet quiz: i går og en uke framover.
 * Dagene datajobben har frosset, kommer fra generated/quiz.json. Resten regnes ut her, som
 * reserve hvis datajobben står stille noen dager.
 */
const DAGER_FRA = -1;
const DAGER_TIL = 7;

export default function QuizSide() {
  const iDag = osloDato(new Date());
  const datoer = Array.from({ length: DAGER_TIL - DAGER_FRA + 1 }, (_, i) => leggTilDager(iDag, DAGER_FRA + i));
  const dagens = quizerForDatoer(lesFrosneQuizer(), getSteder(), datoer);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header className="card relative overflow-hidden bg-strek-soft p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">Ny quiz hver dag ved midnatt</p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Gjett smilefjeset</h1>
            <p className="text-lg text-ink-soft">
              Fem ekte spisesteder. Fikk de smil, strekmunn eller sur munn på siste ordinære tilsyn fra Mattilsynet? Alle i Norge får de
              samme stedene i dag.
            </p>
          </div>
          <div className="order-first flex shrink-0 gap-1 sm:order-none" aria-hidden>
            <span className="pop-in -rotate-12"><Smiley kind="smil" size={56} /></span>
            <span className="pop-in rotate-6" style={{ animationDelay: "80ms" }}><Smiley kind="strek" size={56} /></span>
            <span className="pop-in -rotate-6" style={{ animationDelay: "160ms" }}><Smiley kind="sur" size={56} /></span>
          </div>
        </div>
      </header>

      <QuizApp dagens={dagens} />

      <section aria-labelledby="quiz-regler" className="card p-5 text-sm sm:p-6">
        <h2 id="quiz-regler" className="font-display text-xl font-extrabold">
          <span aria-hidden className="mr-1.5">💡</span>Slik virker quizen
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-soft">
          <li>
            Stedene er ekte, og svaret er smilefjeset fra stedets siste ordinære tilsyn de siste tre årene. Oppfølgingstilsyn teller ikke,
            for de ender nesten alltid med smil.
          </li>
          <li>
            I virkeligheten har ni av ti steder smil fra siste ordinære tilsyn. I quizen er det flere strekmunner og sure munner, og blandingen varierer fra dag til
            dag.
          </li>
          <li>Delingsteksten viser bare hvor nær du var, ikke svarene: 😀 riktig, 😐 ett hakk unna, 😠 bom.</li>
          <li>Resultatet og rekka di lagres bare i nettleseren din.</li>
        </ul>
        <p className="mt-3 text-ink-soft">
          Vil du se mer? <Link className="link" href="/siste">Ferskt fra Mattilsynet</Link> viser de nyeste tilsynene, og{" "}
          <Link className="link" href="/">kartet</Link> har alle stedene.
        </p>
      </section>
    </article>
  );
}
