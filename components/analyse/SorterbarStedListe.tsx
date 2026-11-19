"use client";

import { useMemo, useState } from "react";
import { SORTERING, sorterSteder, type Sortering, type SorterbarRad } from "@/lib/lokal";
import { formatDato } from "@/lib/stats";
import StedRader from "./StedRader";

/**
 * Stedsliste med valg av sortering. Første visning (sist inspisert) er også det serveren rendrer,
 * så listen fungerer uten JavaScript.
 */
export default function SorterbarStedListe({ rader }: { rader: SorterbarRad[] }) {
  const [etter, setEtter] = useState<Sortering>("siste");
  const sortert = useMemo(() => sorterSteder(rader, etter), [rader, etter]);
  return (
    <>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">Sorter etter</legend>
        <div className="flex flex-wrap gap-1 rounded-3xl border-2 border-line bg-paper p-1 sm:inline-flex sm:rounded-full">
          {(Object.keys(SORTERING) as Sortering[]).map((s) => (
            <label
              key={s}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-center text-sm font-bold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent ${
                etter === s ? "bg-ink text-paper" : "hover:bg-card"
              }`}
            >
              <input type="radio" name="sortering" value={s} checked={etter === s} onChange={() => setEtter(s)} className="sr-only" />
              {SORTERING[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <StedRader
        kolonner={3}
        rader={sortert.map((r) => ({
          key: r.slug,
          slug: r.slug,
          navn: r.navn,
          kind: r.kind,
          label: r.label,
          under: r.under,
          meta: etter === "siste" || etter === "navn" ? formatDato(r.siste) : r.total ? `${r.smil}/${r.total}` : "–",
          metaTittel: etter === "siste" || etter === "navn" ? "Siste tilsyn" : "Ordinære tilsyn med smil",
        }))}
      />
    </>
  );
}
