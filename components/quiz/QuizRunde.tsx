"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import Smiley from "@/components/Smiley";
import { KATEGORI_EMOJI, KATEGORI_NAVN } from "@/lib/classify";
import { QUIZ_LENGDE, quizKontekst, treffEmoji, type QuizSted } from "@/lib/quiz";
import { SMILE_LABEL, SMILES, type Smile } from "@/lib/smile";
import { formatDato } from "@/lib/stats";

const BG: Record<Smile, string> = { smil: "bg-smil-soft", strek: "bg-strek-soft", sur: "bg-sur-soft" };

const TREFF_TEKST: Record<string, { tittel: string; under: string }> = {
  "😀": { tittel: "Riktig! 🎉", under: "Du har Mattilsynet-blikk." },
  "😐": { tittel: "Nesten!", under: "Ett hakk unna." },
  "😠": { tittel: "Bom! 🙈", under: "Helt motsatt ende av skalaen." },
};

type Props = {
  sted: QuizSted;
  nr: number;
  gjett: Smile | null;
  onGjett: (s: Smile) => void;
  onNeste: () => void;
  /** Flytt fokus til stedsnavnet ved visning. Av ved første lasting, så siden ikke hopper. */
  fokuser: boolean;
};

/** Ett sted i quizen: spørsmålet, og etter gjetningen fasiten med litt historikk. */
export default function QuizRunde({ sted, nr, gjett, onGjett, onNeste, fokuser }: Props) {
  const tittelId = useId();
  const nesteRef = useRef<HTMLButtonElement>(null);
  const tittelRef = useRef<HTMLHeadingElement>(null);
  const besvart = gjett !== null;

  // Flytt fokus til neste steg, så tastatur- og skjermleserbrukere følger med.
  useEffect(() => {
    if (besvart) nesteRef.current?.focus({ preventScroll: true });
  }, [besvart]);
  useEffect(() => {
    if (fokuser) tittelRef.current?.focus();
  }, [fokuser]);

  const sted2 = [sted.adresse, sted.kommune].filter(Boolean).join(", ");

  return (
    <section aria-labelledby={tittelId} className={`card overflow-hidden p-5 transition-colors sm:p-8 ${besvart ? BG[sted.fasit] : ""}`}>
      <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">
        Sted {nr} av {QUIZ_LENGDE}
      </p>
      <h2 id={tittelId} ref={tittelRef} tabIndex={-1} className="mt-1 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
        {sted.navn}
      </h2>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-ink-soft">
        <span className="chip">
          <span aria-hidden>{KATEGORI_EMOJI[sted.kategori]}</span> {KATEGORI_NAVN[sted.kategori]}
        </span>
        {sted.kjede && <span className="chip">Kjede: {sted.kjede}</span>}
        <span className="font-semibold">{sted2}</span>
      </p>

      {!besvart ? (
        <div className="mt-6">
          <p className="mb-3 text-lg font-bold">Hva fikk stedet på siste ordinære tilsyn?</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {SMILES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onGjett(s)}
                className="btn flex-col justify-center rounded-2xl px-1 py-3 text-sm sm:py-5 sm:text-base"
              >
                <Smiley kind={s} size={64} className="h-12 w-12 sm:h-16 sm:w-16" />
                {SMILE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Avsloring sted={sted} gjett={gjett} />
      )}

      <div aria-live="polite" className="sr-only">
        {besvart ? `Fasit: ${SMILE_LABEL[sted.fasit]}. Du gjettet ${SMILE_LABEL[gjett].toLowerCase()}.` : ""}
      </div>

      {besvart && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button ref={nesteRef} type="button" onClick={onNeste} className="btn btn-primary text-lg">
            {nr < QUIZ_LENGDE ? "Neste sted →" : "Se resultatet →"}
          </button>
          <Link className="link" href={`/sted/${sted.slug}`} target="_blank" rel="noopener">
            Alle tilsyn hos {sted.navn}
            <span className="sr-only"> (åpnes i ny fane)</span>
          </Link>
        </div>
      )}
    </section>
  );
}

function Avsloring({ sted, gjett }: { sted: QuizSted; gjett: Smile }) {
  const treff = TREFF_TEKST[treffEmoji({ fasit: sted.fasit, gjett })];
  return (
    <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
      <span className="pop-in shrink-0 self-start -rotate-6">
        <Smiley kind={sted.fasit} size={112} className="h-24 w-24 sm:h-28 sm:w-28" />
      </span>
      <div className="space-y-2">
        <p className="font-display text-3xl font-extrabold leading-none">{treff.tittel}</p>
        <p className="text-lg">
          <strong>{SMILE_LABEL[sted.fasit]}</strong> ved tilsynet {formatDato(sted.dato)}.{" "}
          <span className="text-ink-soft">
            {gjett === sted.fasit ? treff.under : `Du gjettet ${SMILE_LABEL[gjett].toLowerCase()}. ${treff.under}`}
          </span>
        </p>
        <ul className="space-y-1 text-ink-soft">
          {quizKontekst(sted).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Fem prikker øverst: treff-emoji for besvarte steder, ring rundt det aktive. */
export function Fremdrift({ steder, gjett, aktiv }: { steder: QuizSted[]; gjett: Smile[]; aktiv: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label={`Sted ${Math.min(aktiv + 1, steder.length)} av ${steder.length}`}>
      {steder.map((s, i) => (
        <li
          key={s.slug}
          aria-hidden
          className={`grid h-9 w-9 place-items-center rounded-full border-2 text-lg ${
            i === aktiv ? "border-line bg-card ring-4 ring-accent/40" : i < gjett.length ? "border-line bg-card" : "border-line/30 bg-paper-2"
          }`}
        >
          {i < gjett.length ? treffEmoji({ fasit: s.fasit, gjett: gjett[i] }) : ""}
        </li>
      ))}
    </ol>
  );
}
