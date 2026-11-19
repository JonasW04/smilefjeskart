"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { lesQuizData, QUIZ_LENGDE, velgQuiz, type QuizData, type QuizSted } from "@/lib/quiz";
import type { Smile } from "@/lib/smile";
import { lesOmrade, skrivOmrade } from "./klient";
import QuizResultat from "./QuizResultat";
import QuizRunde, { Fremdrift } from "./QuizRunde";

type Data = { dato: string; steder: QuizSted[] };
type Spill = { steder: QuizSted[]; gjett: Smile[]; aktiv: number; omrade: string | null };

const sorter = (a: string, b: string) => a.localeCompare(b, "nb");

/** Øvingsrunde: fem tilfeldige steder fra hele landet, et fylke eller en kommune. */
export default function QuizOvelse() {
  const id = useId();
  const [data, setData] = useState<Data | null>(null);
  const [feil, setFeil] = useState(false);
  const [[fylke, kommunenr], setOmrade] = useState(lesOmrade);
  const [spill, setSpill] = useState<Spill | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/quiz/steder.json", { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<QuizData>;
      })
      .then((d) => setData({ dato: d.dato, steder: lesQuizData(d) }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setFeil(true);
      });
    return () => ctrl.abort();
  }, []);

  const { fylker, kommuner } = useMemo(() => {
    const f = new Set<string>();
    const k = new Map<string, string>();
    for (const s of data?.steder ?? []) {
      if (s.fylke) f.add(s.fylke);
      if (s.fylke === fylke) k.set(s.kommunenr, s.kommune);
    }
    return { fylker: [...f].sort(sorter), kommuner: [...k].sort((a, b) => sorter(a[1], b[1])) };
  }, [data, fylke]);

  // Et lagret område som ikke finnes lenger, betyr hele landet.
  const aktivFylke = fylker.includes(fylke) ? fylke : "";
  const aktivKommune = aktivFylke && kommuner.some(([nr]) => nr === kommunenr) ? kommunenr : "";
  const utvalg = useMemo(
    () => (data?.steder ?? []).filter((s) => (!aktivFylke || s.fylke === aktivFylke) && (!aktivKommune || s.kommunenr === aktivKommune)),
    [data, aktivFylke, aktivKommune],
  );
  const omradeNavn = aktivKommune ? (kommuner.find(([nr]) => nr === aktivKommune)?.[1] ?? null) : aktivFylke || null;

  const velgOmrade = (f: string, k: string) => {
    setOmrade([f, k]);
    skrivOmrade(f, k);
  };

  const start = () => {
    if (!data || utvalg.length < QUIZ_LENGDE) return;
    const fro = `ovelse:${Date.now()}:${Math.random()}`;
    setSpill({ steder: velgQuiz(utvalg, fro, data.dato), gjett: [], aktiv: 0, omrade: omradeNavn });
  };

  if (feil) {
    return (
      <section className="card p-5 sm:p-8">
        <p className="font-semibold">Oi, klarte ikke å hente stedene. Prøv igjen litt senere.</p>
      </section>
    );
  }
  if (!data) return <div className="card h-80 animate-pulse bg-paper-2" aria-busy="true" aria-label="Laster steder" />;

  if (spill && spill.aktiv >= QUIZ_LENGDE) {
    return (
      <QuizResultat steder={spill.steder} gjett={spill.gjett} modus={{ type: "ovelse", omrade: spill.omrade }} fokuser>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={start}>
            <span aria-hidden>🔁</span> Ny runde{omradeNavn ? ` i ${omradeNavn}` : ""}
          </button>
          <button type="button" className="btn" onClick={() => setSpill(null)}>
            <span aria-hidden>📍</span> Bytt område
          </button>
        </div>
      </QuizResultat>
    );
  }

  if (spill) {
    const i = spill.aktiv;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Fremdrift steder={spill.steder} gjett={spill.gjett} aktiv={i} />
          <span className="chip">
            <span aria-hidden>🎯</span> Øvingsrunde{spill.omrade ? `: ${spill.omrade}` : ""}
          </span>
        </div>
        <QuizRunde
          key={`${spill.steder[0].slug}-${i}`}
          sted={spill.steder[i]}
          nr={i + 1}
          gjett={spill.gjett[i] ?? null}
          onGjett={(s) => setSpill({ ...spill, gjett: [...spill.gjett, s] })}
          onNeste={() => setSpill({ ...spill, aktiv: i + 1 })}
          fokuser
        />
      </div>
    );
  }

  const velgKlasse = "mt-1 w-full rounded-xl border-2 border-line bg-card px-3 py-2 font-semibold text-ink";
  return (
    <section aria-labelledby="ovelse-tittel" className="card p-5 sm:p-8">
      <h2 id="ovelse-tittel" className="font-display text-2xl font-extrabold sm:text-3xl">
        <span aria-hidden className="mr-1.5">🎯</span>Øvingsrunde
      </h2>
      <p className="mt-1 text-ink-soft">
        Spill så mange runder du vil. Velg fylke eller kommune for å teste deg på stedene der du bor. Øvingsrundene teller ikke i
        rekka di.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-fylke`} className="block text-sm font-bold">
            Fylke
          </label>
          <select id={`${id}-fylke`} className={velgKlasse} value={aktivFylke} onChange={(e) => velgOmrade(e.target.value, "")}>
            <option value="">Hele landet</option>
            {fylker.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-kommune`} className="block text-sm font-bold">
            Kommune
          </label>
          <select
            id={`${id}-kommune`}
            className={`${velgKlasse} disabled:opacity-50`}
            value={aktivKommune}
            disabled={!aktivFylke}
            onChange={(e) => velgOmrade(aktivFylke, e.target.value)}
          >
            <option value="">{aktivFylke ? "Hele fylket" : "Velg fylke først"}</option>
            {kommuner.map(([nr, navn]) => (
              <option key={nr} value={nr}>
                {navn}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary text-lg disabled:opacity-50" onClick={start} disabled={utvalg.length < QUIZ_LENGDE}>
          <span aria-hidden>▶️</span> Start runde
        </button>
        <span className="text-sm font-semibold text-ink-soft" role="status">
          {utvalg.length < QUIZ_LENGDE
            ? "For få steder med ordinært tilsyn her de siste tre årene. Prøv hele fylket."
            : `${utvalg.length.toLocaleString("nb-NO")} steder å trekke fra`}
        </span>
      </div>
    </section>
  );
}
