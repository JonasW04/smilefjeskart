"use client";

import { useId, useMemo, useState } from "react";
import { foldForSearch } from "@/lib/text";

export type SokValg = { id: string; tittel: string; under: string; sok: string };

type Props = {
  label: string;
  hjelp?: string;
  valg: SokValg[];
  onVelg: (v: SokValg) => void;
  placeholder?: string;
  feilId?: string;
  ugyldig?: boolean;
};

const MAKS = 8;

/** Tilgjengelig kombinasjonsboks (WAI-ARIA combobox med listbox) for kommuner og steder. */
export default function StedSok({ label, hjelp, valg, onVelg, placeholder, feilId, ugyldig }: Props) {
  const id = useId();
  const listeId = `${id}-liste`;
  const hjelpId = `${id}-hjelp`;
  const [tekst, setTekst] = useState("");
  const [apen, setApen] = useState(false);
  const [aktiv, setAktiv] = useState(0);

  const treff = useMemo(() => {
    const q = foldForSearch(tekst);
    if (!q) return [];
    const starter: SokValg[] = [];
    const inneholder: SokValg[] = [];
    for (const v of valg) {
      if (v.sok.startsWith(q)) starter.push(v);
      else if (v.sok.includes(` ${q}`)) inneholder.push(v);
      if (starter.length >= MAKS) break;
    }
    return [...starter, ...inneholder].slice(0, MAKS);
  }, [tekst, valg]);

  const vis = apen && treff.length > 0;
  const aktivIndeks = Math.min(aktiv, Math.max(0, treff.length - 1));

  function velg(v: SokValg) {
    onVelg(v);
    setTekst("");
    setApen(false);
    setAktiv(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setApen(true);
      setAktiv((a) => (treff.length ? (Math.min(a, treff.length - 1) + 1) % treff.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setApen(true);
      setAktiv((a) => (treff.length ? (Math.min(a, treff.length - 1) - 1 + treff.length) % treff.length : 0));
    } else if (e.key === "Enter") {
      if (vis) {
        e.preventDefault();
        velg(treff[aktivIndeks]);
      }
    } else if (e.key === "Escape") {
      if (vis) e.preventDefault();
      setApen(false);
    }
  }

  const beskrivelse = [hjelp ? hjelpId : null, feilId && ugyldig ? feilId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block font-bold">
        {label}
      </label>
      {hjelp && (
        <p id={hjelpId} className="mb-2 text-sm text-ink-soft">
          {hjelp}
        </p>
      )}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={vis}
        aria-controls={listeId}
        aria-activedescendant={vis ? `${listeId}-${aktivIndeks}` : undefined}
        aria-describedby={beskrivelse}
        aria-invalid={ugyldig || undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={tekst}
        onChange={(e) => {
          setTekst(e.target.value);
          setApen(true);
          setAktiv(0);
        }}
        onFocus={() => setApen(true)}
        onBlur={() => setApen(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-2xl border-2 border-line bg-card px-4 py-3 text-base text-ink placeholder:text-ink-soft/70"
      />
      <ul
        id={listeId}
        role="listbox"
        aria-label={label}
        hidden={!vis}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-2xl border-2 border-line bg-card p-1 shadow-[4px_4px_0_var(--shadow-ink)]"
      >
        {treff.map((v, i) => (
          <li
            key={v.id}
            id={`${listeId}-${i}`}
            role="option"
            aria-selected={i === aktivIndeks}
            // mousedown i stedet for click, så valget skjer før input mister fokus
            onMouseDown={(e) => {
              e.preventDefault();
              velg(v);
            }}
            onMouseMove={() => setAktiv(i)}
            className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-xl px-3 py-2 ${i === aktivIndeks ? "bg-accent-soft" : ""}`}
          >
            <span className="font-semibold">{v.tittel}</span>
            <span className="shrink-0 text-xs text-ink-soft">{v.under}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {apen && tekst ? (treff.length === 0 ? "Ingen treff." : `${treff.length} treff. Bruk piltastene for å velge.`) : ""}
      </p>
    </div>
  );
}
