import Link from "next/link";
import type { ReactNode } from "react";
import Smiley from "@/components/Smiley";
import { tall } from "@/lib/chart";
import { andel, prosent, type Fordeling } from "@/lib/stats";

export type StabelRad = {
  key: string;
  navn: ReactNode;
  /** Ren tekst til skjermlesere og tooltip. */
  tekst: string;
  href?: string;
  fordeling: Fordeling;
  /** Liten tekst under navnet, f.eks. «312 steder». */
  meta?: string;
  /** Uthev raden (f.eks. kommunen man ser på). */
  uthevet?: boolean;
};

/**
 * Liggende 100 %-stolper (smil / strek / sur) for ordinære tilsyn, én per rad, med en loddrett
 * markør for landssnittet. Skalaen er alltid 0–100 %, så stolpene kan sammenlignes ærlig.
 */
export default function StabelRader({
  rader,
  referanse,
  referanseNavn = "Norge",
  nummerert = false,
  start = 1,
  desimaler = 0,
  kompakt = false,
}: {
  rader: StabelRad[];
  /** Andel smil å markere (f.eks. landssnittet). */
  referanse?: number;
  referanseNavn?: string;
  nummerert?: boolean;
  start?: number;
  /** Desimaler i prosenttallet til høyre. */
  desimaler?: number;
  /** Navn og tall over stolpen også på store skjermer (for smale kolonner). */
  kompakt?: boolean;
}) {
  const Liste = nummerert ? "ol" : "ul";
  return (
    <Liste className="space-y-2.5" start={nummerert ? start : undefined}>
      {rader.map((r, i) => {
        const smil = andel(r.fordeling, "smil");
        const strek = andel(r.fordeling, "strek");
        const sur = andel(r.fordeling, "sur");
        const beskrivelse = `${r.tekst}: ${prosent(smil, 1)} smil, ${prosent(strek, 1)} strekmunn, ${prosent(sur, 1)} sur munn av ${tall(r.fordeling.total)} ordinære tilsyn`;
        const navn = r.href ? (
          <Link href={r.href} className="font-semibold decoration-2 underline-offset-2 hover:text-accent hover:underline">
            {r.navn}
          </Link>
        ) : (
          <span className="font-semibold">{r.navn}</span>
        );
        return (
          <li
            key={r.key}
            className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 ${kompakt ? "" : "sm:grid-cols-[minmax(0,14rem)_1fr_4.5rem]"} ${r.uthevet ? "-mx-2 rounded-xl bg-accent-soft px-2 py-1" : ""}`}
          >
            <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
              {nummerert && <span className="min-w-5 shrink-0 text-right text-xs font-bold tabular-nums text-ink-soft">{start + i}.</span>}
              <span className="min-w-0">
                <span className="block truncate">{navn}</span>
                {r.meta && <span className="block truncate text-xs text-ink-soft">{r.meta}</span>}
              </span>
            </div>
            <div className={`text-right text-sm font-bold tabular-nums ${kompakt ? "" : "sm:order-last"}`}>{prosent(smil, desimaler)}</div>
            <div className={`relative col-span-2 ${kompakt ? "" : "sm:col-span-1"}`} role="img" aria-label={beskrivelse}>
              <div
                className={`flex h-3.5 gap-[2px] overflow-hidden rounded-full ${r.fordeling.total === 0 ? "bg-ukjent-soft" : ""}`}
                title={beskrivelse}
              >
                {smil > 0 && <div className="bg-smil" style={{ width: `${smil * 100}%` }} />}
                {strek > 0 && <div className="bg-strek" style={{ width: `${strek * 100}%` }} />}
                {sur > 0 && <div className="bg-sur" style={{ width: `${sur * 100}%` }} />}
              </div>
              {referanse !== undefined && (
                <div
                  aria-hidden
                  title={`${referanseNavn}: ${prosent(referanse)} smil`}
                  className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-ink ring-2 ring-card"
                  style={{ left: `${referanse * 100}%` }}
                />
              )}
            </div>
          </li>
        );
      })}
    </Liste>
  );
}

/** Forklaring for StabelRader. */
export function StabelForklaring({ referanseNavn = "Norge", referanse }: { referanseNavn?: string; referanse?: number }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-soft">
      <li className="inline-flex items-center gap-1.5">
        <Smiley kind="smil" size={16} />
        Smil
      </li>
      <li className="inline-flex items-center gap-1.5">
        <Smiley kind="strek" size={16} />
        Strekmunn
      </li>
      <li className="inline-flex items-center gap-1.5">
        <Smiley kind="sur" size={16} />
        Sur munn
      </li>
      {referanse !== undefined && (
        <li className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full bg-ink" aria-hidden />
          {referanseNavn} ({prosent(referanse)} smil)
        </li>
      )}
      <li>Tallet til høyre er andel smil.</li>
    </ul>
  );
}
