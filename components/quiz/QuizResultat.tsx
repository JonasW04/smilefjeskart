"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Smiley from "@/components/Smiley";
import { delingstekst, poengsum, treffEmoji, type QuizModus, type QuizSted } from "@/lib/quiz";
import { SMILE_LABEL, type Smile } from "@/lib/smile";
import type { SmileyKind } from "@/lib/smiley";

const KOMMENTAR: Array<{ min: number; kind: SmileyKind; tekst: string }> = [
  { min: 5, kind: "smil", tekst: "Fullt hus! Mattilsynet burde ansette deg. 🕵️" },
  { min: 4, kind: "smil", tekst: "Sterkt! Nesten feilfritt." },
  { min: 3, kind: "smil", tekst: "Godkjent, med smil." },
  { min: 2, kind: "strek", tekst: "Strekmunn. Dette må følges opp." },
  { min: 0, kind: "sur", tekst: "Sur munn! Men smilefjes kan forbedres." },
];

type Props = {
  steder: QuizSted[];
  gjett: Smile[];
  modus: QuizModus;
  /** Flytt fokus til poengsummen ved visning (når spilleren nettopp ble ferdig). */
  fokuser: boolean;
  /** Ekstra innhold under poengsummen, f.eks. rekke og nedtelling. */
  children?: React.ReactNode;
};

/** Sluttskjermen: poeng, delbar emoji-oppsummering uten fasit, og fasiten sted for sted. */
export default function QuizResultat({ steder, gjett, modus, fokuser, children }: Props) {
  const runder = steder.map((s, i) => ({ fasit: s.fasit, gjett: gjett[i] }));
  const poeng = poengsum(runder);
  const tekst = delingstekst(runder, modus);
  const kommentar = KOMMENTAR.find((k) => poeng >= k.min)!;
  const [status, setStatus] = useState<"" | "kopiert" | "feil">("");
  const poengRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (fokuser) poengRef.current?.focus();
  }, [fokuser]);
  const kanDele = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const kopier = async () => {
    try {
      await navigator.clipboard.writeText(tekst);
      setStatus("kopiert");
    } catch {
      setStatus("feil");
    }
  };

  const del = async () => {
    try {
      await navigator.share({ text: tekst });
    } catch (e) {
      // Avbrutt av brukeren: ingenting å gjøre. Andre feil: prøv utklippstavla.
      if ((e as Error).name !== "AbortError") await kopier();
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="quiz-resultat" className="card bg-accent-soft p-5 text-center sm:p-8">
        <span className="pop-in inline-block rotate-6">
          <Smiley kind={kommentar.kind} size={88} />
        </span>
        <h2 id="quiz-resultat" ref={poengRef} tabIndex={-1} className="mt-2 font-display text-6xl font-extrabold leading-none tracking-tight">
          {poeng}/{runder.length}
        </h2>
        <p className="mt-2 text-xl font-bold">{kommentar.tekst}</p>

        <p className="mt-5 text-4xl tracking-[0.2em]" role="img" aria-label={`Treff per sted: ${runder.map(treffEmoji).join(" ")}`}>
          {runder.map(treffEmoji).join("")}
        </p>
        <p className="mt-1 text-xs font-semibold text-ink-soft">😀 riktig · 😐 ett hakk unna · 😠 bom</p>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {kanDele && (
            <button type="button" className="btn btn-primary text-lg" onClick={del}>
              <span aria-hidden>📤</span> Del resultatet
            </button>
          )}
          <button type="button" className={`btn text-lg ${kanDele ? "" : "btn-primary"}`} onClick={kopier}>
            <span aria-hidden>📋</span> {status === "kopiert" ? "Kopiert!" : "Kopier resultatet"}
          </button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm font-semibold text-ink-soft">
          {status === "kopiert" && "Lim det inn i gruppechatten 👀"}
          {status === "feil" && "Fikk ikke kopiert. Merk teksten under og kopier den selv."}
        </p>
        {status === "feil" && (
          <textarea readOnly value={tekst} rows={2} className="mt-2 w-full max-w-md rounded-xl border-2 border-line bg-card p-2 text-center" onFocus={(e) => e.currentTarget.select()} />
        )}

        {children}
      </section>

      <section aria-labelledby="quiz-fasit" className="card p-5 sm:p-6">
        <h2 id="quiz-fasit" className="font-display text-2xl font-extrabold">
          <span aria-hidden className="mr-1.5">📋</span>Fasit
        </h2>
        <ol className="mt-3 divide-y-2 divide-line/10">
          {steder.map((s, i) => (
            <li key={s.slug} className="flex items-center gap-3 py-2.5">
              <Smiley kind={s.fasit} size={36} label={SMILE_LABEL[s.fasit]} />
              <div className="min-w-0 flex-1">
                <Link href={`/sted/${s.slug}`} className="block truncate font-bold hover:underline">
                  {s.navn}
                </Link>
                <span className="block truncate text-sm text-ink-soft">
                  {s.kommune} · Du gjettet {SMILE_LABEL[gjett[i]].toLowerCase()}
                </span>
              </div>
              <span className="text-2xl" role="img" aria-label={gjett[i] === s.fasit ? "Riktig" : "Feil"}>
                {treffEmoji(runder[i])}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
