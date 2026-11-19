"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FordelingBar from "@/components/FordelingBar";
import Smiley from "@/components/Smiley";
import { KATEGORI_NAVN, type Kategori } from "@/lib/classify";
import { klyngeHumor, radGruppe, type Modus } from "@/lib/kart";
import { formatAvstand, NAER_RADIUSER, type NaerDom, type NaerRadius, type NaertSted, type Punkt } from "@/lib/naerhet";
import { SMILE_LABEL, SMILES, type Smile } from "@/lib/smile";
import type { SmileyKind } from "@/lib/smiley";
import { tidSiden } from "@/lib/stats";
import { KART, type KartRad } from "@/lib/types";
import { varslingLenke } from "@/lib/varsling/validering";

type Props = {
  dom: NaerDom;
  punkt: Punkt;
  /** Radiusen ble valgt automatisk (ikke av brukeren). */
  auto: boolean;
  modus: Modus;
  kategori: Kategori | "alle";
  /** Skjul kortet uten å miste fanen, f.eks. mens stedspanelet er åpent. */
  skjult: boolean;
  onRadius: (r: NaerRadius) => void;
  onVelg: (rad: KartRad) => void;
  onLukk: () => void;
};

type Fane = "verst" | "tryggest";

const FANER: Record<Fane, { navn: string; tom: string }> = {
  verst: { navn: "Verst", tom: "Ingen strekmunn eller sur munn her. Godt nabolag!" },
  tryggest: { navn: "Tryggest", tom: "Ingen med smil her ennå." },
};

const FLERTALL: Record<Smile, [string, string]> = {
  smil: ["smil", "smil"],
  strek: ["strekmunn", "strekmunner"],
  sur: ["sur munn", "sure munner"],
};

const MODUS_KORT: Record<Modus, string> = { "tre-aar": "verste resultat siste 3 år", siste: "siste tilsyn" };

function radiusTekst(r: number): string {
  return r < 1000 ? `${r} m` : `${r / 1000} km`;
}

function humor(dom: NaerDom): { kind: SmileyKind; tittel: string } {
  const h = klyngeHumor(dom.telling.smil, dom.telling.strek, dom.telling.sur);
  if (h === null) return { kind: "ukjent", tittel: "Stille her" };
  if (h >= 0.33) return { kind: "smil", tittel: "Nabolaget smiler" };
  if (h > -0.33) return { kind: "strek", tittel: "Litt blandet her" };
  return { kind: "sur", tittel: "Velg med omhu her" };
}

function oppsummering(dom: NaerDom): string {
  const r = radiusTekst(dom.radius);
  if (dom.antall === 0) return `Ingen steder innen ${r} fra deg.`;
  const deler = SMILES.filter((s) => dom.telling[s] > 0).map((s) => `${dom.telling[s]} ${FLERTALL[s][dom.telling[s] === 1 ? 0 : 1]}`);
  if (dom.telling.ukjent > 0) deler.push(`${dom.telling.ukjent} uten resultat`);
  return `Innen ${r} fra deg: ${dom.antall} ${dom.antall === 1 ? "sted" : "steder"} – ${deler.join(", ")}`;
}

export default function NaerMegKort({ dom, punkt, auto, modus, kategori, skjult, onRadius, onVelg, onLukk }: Props) {
  const [fane, setFane] = useState<Fane>("verst");
  const lukkRef = useRef<HTMLButtonElement>(null);
  const faneRefs = useRef<Record<Fane, HTMLButtonElement | null>>({ verst: null, tryggest: null });
  const { kind, tittel } = humor(dom);
  const kjent = dom.telling.smil + dom.telling.strek + dom.telling.sur;
  const liste = fane === "verst" ? dom.verst : dom.tryggest;

  useEffect(() => {
    lukkRef.current?.focus({ preventScroll: true });
  }, []);

  const byttFane = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const neste: Fane = fane === "verst" ? "tryggest" : "verst";
    setFane(neste);
    faneRefs.current[neste]?.focus();
  };

  return (
    <aside
      aria-label="Rundt deg"
      hidden={skjult}
      className="card absolute inset-x-2 bottom-2 z-20 max-h-[58%] overflow-y-auto p-4 sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-9.5rem)] sm:w-[380px] sm:p-5"
    >
      <button
        ref={lukkRef}
        type="button"
        onClick={onLukk}
        aria-label="Lukk nabolagskortet"
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border-2 border-line bg-card text-lg font-bold hover:bg-accent-soft"
      >
        ✕
      </button>

      <div className="space-y-4">
        <div className="flex items-center gap-3 pr-10">
          <span className="pop-in shrink-0 -rotate-6" key={`${dom.radius}-${kind}`}>
            <Smiley kind={kind} size={52} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">📍 Sjekk rundt meg</p>
            <h2 className="font-display text-xl font-extrabold leading-tight">{tittel}</h2>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-semibold" aria-live="polite">
            {oppsummering(dom)}
            {dom.sistKontrollert && (
              <span className="font-normal text-ink-soft"> (sist kontrollert {tidSiden(dom.sistKontrollert)})</span>
            )}
          </p>
          {kjent > 0 && <FordelingBar fordeling={{ ...dom.telling, total: kjent }} label={`Farget etter ${MODUS_KORT[modus]}`} compact />}
          {(auto && dom.radius > NAER_RADIUSER[0]) || kategori !== "alle" ? (
            <p className="text-xs text-ink-soft">
              {auto && dom.radius > NAER_RADIUSER[0] && `Få steder helt i nærheten, så vi så litt lenger unna. `}
              {kategori !== "alle" && `Bare ${KATEGORI_NAVN[kategori].toLowerCase()}, som i filteret.`}
            </p>
          ) : null}
        </div>

        <div role="radiogroup" aria-label="Avstand" className="grid grid-cols-4 gap-1 rounded-full border-2 border-line bg-paper p-1">
          {NAER_RADIUSER.map((r) => (
            <label
              key={r}
              className={`cursor-pointer rounded-full px-2 py-1 text-center text-sm font-bold tabular-nums transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent ${
                dom.radius === r ? "bg-ink text-paper" : "hover:bg-card"
              }`}
            >
              <input type="radio" name="naer-radius" value={r} checked={dom.radius === r} onChange={() => onRadius(r)} className="sr-only" />
              {radiusTekst(r)}
            </label>
          ))}
        </div>

        <div>
          <div role="tablist" aria-label="Steder i nærheten" className="flex gap-1.5" onKeyDown={byttFane}>
            {(Object.keys(FANER) as Fane[]).map((f) => (
              <button
                key={f}
                ref={(el) => {
                  faneRefs.current[f] = el;
                }}
                type="button"
                role="tab"
                id={`naer-fane-${f}`}
                aria-selected={fane === f}
                aria-controls="naer-liste"
                tabIndex={fane === f ? 0 : -1}
                onClick={() => setFane(f)}
                className={`inline-flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1 text-sm font-bold transition ${
                  fane === f ? "bg-card shadow-[2px_2px_0_var(--shadow-ink)]" : "bg-paper text-ink-soft hover:text-ink"
                }`}
              >
                <Smiley kind={f === "verst" ? "sur" : "smil"} size={18} />
                {FANER[f].navn}
                <span className="sr-only"> i nærheten</span>
              </button>
            ))}
          </div>

          <div id="naer-liste" role="tabpanel" aria-labelledby={`naer-fane-${fane}`} className="mt-2">
            {liste.length === 0 ? (
              <p className="rounded-2xl bg-paper p-3 text-sm text-ink-soft">{dom.antall === 0 ? "Prøv en større radius." : FANER[fane].tom}</p>
            ) : (
              <ol className="space-y-1.5">
                {liste.map((s) => (
                  <StedRad key={s.rad[KART.SLUG]} sted={s} modus={modus} onVelg={onVelg} />
                ))}
              </ol>
            )}
          </div>
        </div>

        <Link href={varslingLenke(punkt.lat, punkt.lng, dom.radius)} className="btn w-full justify-center text-sm">
          🔔 Varsle meg om nye smilefjes her
        </Link>
      </div>
    </aside>
  );
}

function StedRad({ sted, modus, onVelg }: { sted: NaertSted; modus: Modus; onVelg: (rad: KartRad) => void }) {
  const g = radGruppe(sted.rad, modus);
  const smil = g < 3 ? SMILES[g] : null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onVelg(sted.rad)}
        className="flex w-full items-center gap-2.5 rounded-2xl border-2 border-transparent bg-paper px-2.5 py-2 text-left transition-colors hover:border-line"
      >
        <Smiley kind={smil ?? "ukjent"} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{sted.rad[KART.NAVN]}</span>
          <span className="block truncate text-xs text-ink-soft">
            {smil ? SMILE_LABEL[smil] : "Ukjent"} · {sted.rad[KART.ADRESSE]}
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums">{formatAvstand(sted.meter)}</span>
      </button>
    </li>
  );
}
