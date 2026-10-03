"use client";

import { useId, useMemo, useState } from "react";
import Smiley from "@/components/Smiley";
import { sok, type SokIndeks, type SokTreff } from "@/lib/kart";
import { kindFromKarakter } from "@/lib/smiley";
import { KART } from "@/lib/types";

type Props = {
  indeks: SokIndeks | null;
  onVelg: (t: SokTreff) => void;
};

/** Søkefelt med forslag (ARIA combobox). */
export default function Sok({ indeks, onVelg }: Props) {
  const id = useId();
  const [q, setQ] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const [apen, setApen] = useState(false);

  const treff = useMemo(() => (indeks ? sok(indeks, q) : []), [indeks, q]);
  const visListe = apen && treff.length > 0;
  const ingenTreff = apen && q.trim().length >= 2 && indeks && treff.length === 0;

  const velg = (t: SokTreff) => {
    onVelg(t);
    setQ("");
    setApen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="sr-only">
        Søk etter spisested, adresse eller kommune
      </label>
      <div className="sticker flex items-center gap-2 rounded-full bg-card px-4 py-2.5">
        <span aria-hidden>🔎</span>
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={visListe}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={visListe ? `${id}-${aktiv}` : undefined}
          autoComplete="off"
          value={q}
          placeholder={indeks ? "Søk etter sted, adresse eller kommune…" : "Laster steder…"}
          disabled={!indeks}
          onChange={(e) => {
            setQ(e.target.value);
            setAktiv(0);
            setApen(true);
          }}
          onFocus={() => setApen(true)}
          onBlur={() => setTimeout(() => setApen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setApen(true);
              setAktiv((a) => Math.min(a + 1, treff.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAktiv((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && visListe) {
              e.preventDefault();
              velg(treff[aktiv]);
            } else if (e.key === "Escape") {
              if (q) setQ("");
              else setApen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-soft"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Tøm søk" className="text-ink-soft hover:text-ink">
            ✕
          </button>
        )}
      </div>

      <ul
        id={`${id}-liste`}
        role="listbox"
        aria-label="Søkeresultater"
        hidden={!visListe}
        className="card absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-[50vh] overflow-y-auto p-1.5"
      >
        {treff.map((t, i) => (
          <li
            key={t.type === "sted" ? t.rad[KART.SLUG] : `k-${t.nr}`}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === aktiv}
            onMouseDown={(e) => {
              e.preventDefault();
              velg(t);
            }}
            onMouseEnter={() => setAktiv(i)}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 ${i === aktiv ? "bg-accent-soft" : ""}`}
          >
            {t.type === "sted" ? (
              <>
                <Smiley kind={kindFromKarakter(t.rad[KART.VERSTE_3AAR])} size={26} />
                <span className="min-w-0">
                  <span className="block truncate font-bold">{t.rad[KART.NAVN]}</span>
                  <span className="block truncate text-xs text-ink-soft">{t.rad[KART.ADRESSE]}</span>
                </span>
              </>
            ) : (
              <>
                <span className="grid h-[26px] w-[26px] shrink-0 place-items-center text-lg" aria-hidden>
                  📍
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{t.navn} kommune</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {t.fylke} · {t.antall.toLocaleString("nb-NO")} steder
                  </span>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {ingenTreff && (
        <p role="status" className="card absolute inset-x-0 top-[calc(100%+8px)] z-30 p-3 text-sm">
          Ingen treff på «{q}». Prøv et annet navn eller en adresse. 🤔
        </p>
      )}
    </div>
  );
}
