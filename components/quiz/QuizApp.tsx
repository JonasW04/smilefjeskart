"use client";

import { useState } from "react";
import { poengsum, QUIZ_LENGDE, quizRekke, trimHistorikk, type QuizLagret, type QuizSted } from "@/lib/quiz";
import type { Smile } from "@/lib/smile";
import { formatNedtelling, lesQuizLagring, skrivQuizLagring, useNedtelling, useOsloDato } from "./klient";
import QuizOvelse from "./QuizOvelse";
import QuizResultat from "./QuizResultat";
import QuizRunde, { Fremdrift } from "./QuizRunde";

type Props = {
  /** Dagens fem steder for noen dager rundt byggetidspunktet, nøkkel = dato i Norge. */
  dagens: Record<string, QuizSted[]>;
};

type Modus = "dag" | "ovelse";

/** «Gjett smilefjeset»: dagens quiz og øvingsrunder. Rendres bare i nettleseren (dato og lagring). */
export default function QuizApp({ dagens }: Props) {
  const iDag = useOsloDato();
  const [modus, setModus] = useState<Modus>("dag");
  const steder = iDag ? dagens[iDag] : undefined;

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Velg quiz" className="flex flex-wrap gap-2">
        <ModusKnapp aktiv={modus === "dag"} onClick={() => setModus("dag")} emoji="📅" tekst="Dagens quiz" />
        <ModusKnapp aktiv={modus === "ovelse"} onClick={() => setModus("ovelse")} emoji="🎯" tekst="Øvingsrunde" />
      </div>

      {iDag === null ? (
        <div className="card h-80 animate-pulse bg-paper-2" aria-busy="true" aria-label="Laster quizen" />
      ) : modus === "ovelse" ? (
        <QuizOvelse />
      ) : steder && steder.length === QUIZ_LENGDE ? (
        <DagensQuiz key={iDag} dato={iDag} steder={steder} onOvelse={() => setModus("ovelse")} />
      ) : (
        <section className="card p-5 sm:p-8">
          <h2 className="font-display text-2xl font-extrabold">Dagens quiz er ikke klar ennå</h2>
          <p className="mt-2 text-ink-soft">Prøv igjen om litt, eller ta en øvingsrunde så lenge.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => setModus("ovelse")}>
            <span aria-hidden>🎯</span> Til øvingsrunden
          </button>
        </section>
      )}
    </div>
  );
}

function ModusKnapp({ aktiv, onClick, emoji, tekst }: { aktiv: boolean; onClick: () => void; emoji: string; tekst: string }) {
  return (
    <button
      type="button"
      aria-pressed={aktiv}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2 font-bold transition-colors ${
        aktiv ? "border-line bg-ink text-paper" : "border-line bg-card text-ink hover:bg-accent-soft"
      }`}
    >
      <span aria-hidden>{emoji}</span>
      {tekst}
    </button>
  );
}

function DagensQuiz({ dato, steder, onOvelse }: { dato: string; steder: QuizSted[]; onOvelse: () => void }) {
  // Lagrede steder for dagen brukes framfor ferske, så svarene stemmer selv om dataene er oppdatert siden.
  const [lagret, setLagret] = useState<QuizLagret>(() => {
    const l = lesQuizLagring();
    return l.dag?.dato === dato ? l : { ...l, dag: { dato, steder, gjett: [] } };
  });
  const dag = lagret.dag!;
  const [aktiv, setAktiv] = useState(dag.gjett.length);

  const gjett = (s: Smile) => {
    const g = [...dag.gjett, s];
    const ferdig = g.length === QUIZ_LENGDE;
    const poeng = poengsum(dag.steder.map((st, i) => ({ fasit: st.fasit, gjett: g[i] })));
    const ny: QuizLagret = {
      dag: { ...dag, gjett: g },
      historikk: ferdig ? trimHistorikk({ ...lagret.historikk, [dato]: poeng }, dato) : lagret.historikk,
    };
    setLagret(ny);
    skrivQuizLagring(ny);
  };

  if (aktiv >= QUIZ_LENGDE && dag.gjett.length === QUIZ_LENGDE) {
    const rekke = quizRekke(lagret.historikk, dato);
    const spilt = Object.values(lagret.historikk);
    const snitt = spilt.reduce((a, b) => a + b, 0) / spilt.length;
    return (
      <QuizResultat steder={dag.steder} gjett={dag.gjett} modus={{ type: "dag" }}>
        <dl className="mx-auto mt-6 grid max-w-xl grid-cols-3 gap-2 text-center sm:gap-3">
          <Stat etikett="Rekke" verdi={`${rekke} 🔥`} under={rekke === 1 ? "dag" : "dager på rad"} />
          <Stat etikett="Snitt" verdi={snitt.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} under={`av 5 over ${spilt.length} ${spilt.length === 1 ? "dag" : "dager"}`} />
          <Stat etikett="Neste quiz" verdi={<Nedtelling />} under="ved midnatt" />
        </dl>
        <button type="button" className="btn mt-6" onClick={onOvelse}>
          <span aria-hidden>🎯</span> Mer? Ta en øvingsrunde for din kommune
        </button>
      </QuizResultat>
    );
  }

  const i = Math.min(aktiv, QUIZ_LENGDE - 1);
  return (
    <div className="space-y-4">
      <Fremdrift steder={dag.steder} gjett={dag.gjett} aktiv={i} />
      <QuizRunde key={i} sted={dag.steder[i]} nr={i + 1} gjett={dag.gjett[i] ?? null} onGjett={gjett} onNeste={() => setAktiv(i + 1)} />
    </div>
  );
}

function Nedtelling() {
  return <span className="tabular-nums">{formatNedtelling(useNedtelling())}</span>;
}

function Stat({ etikett, verdi, under }: { etikett: string; verdi: React.ReactNode; under: string }) {
  return (
    <div className="rounded-2xl border-2 border-line bg-card p-2.5 sm:p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">{etikett}</dt>
      <dd className="mt-1">
        <span className="block font-display text-xl font-extrabold leading-none sm:text-2xl">{verdi}</span>
        <span className="mt-1 block text-xs font-semibold text-ink-soft">{under}</span>
      </dd>
    </div>
  );
}
