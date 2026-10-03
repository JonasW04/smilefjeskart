import type { ReactNode } from "react";
import Smiley from "@/components/Smiley";
import type { SmileyKind } from "@/lib/smiley";

export type ForklaringPunkt = { navn: string; smiley: SmileyKind } | { navn: string; strek: string } | { navn: string; fyll: string };

/** Forklaring over en graf. Smilefjes brukes som nøkkel for smil/strek/sur, så fargen aldri står alene. */
export function Forklaring({ punkter }: { punkter: ForklaringPunkt[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-soft">
      {punkter.map((p) => (
        <li key={p.navn} className="inline-flex items-center gap-1.5">
          {"smiley" in p ? (
            <Smiley kind={p.smiley} size={16} />
          ) : "strek" in p ? (
            <svg width="18" height="10" aria-hidden>
              <line x1="1" x2="17" y1="5" y2="5" className={p.strek} strokeWidth="2" strokeLinecap="round" />
              <circle cx="9" cy="5" r="3.5" className={`${p.strek.replace("stroke-", "fill-")} stroke-card`} strokeWidth="1.5" />
            </svg>
          ) : (
            <span className={`inline-block h-2.5 w-2.5 rounded-[3px] ${p.fyll}`} aria-hidden />
          )}
          {p.navn}
        </li>
      ))}
    </ul>
  );
}

/** «Vis tallene»: tabellversjonen av en graf, for skjermlesere og de som vil ha tallene. */
export function TallTabell({ tittel, kolonner, rader }: { tittel: string; kolonner: string[]; rader: Array<Array<ReactNode>> }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold text-ink-soft hover:bg-paper-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        Vis tallene
      </summary>
      <div className="mt-2 max-h-96 overflow-auto rounded-xl border-2 border-line/20">
        <table className="w-full text-left text-xs [&_td]:px-2.5 [&_td]:py-1 [&_td]:text-right [&_td]:tabular-nums [&_tbody_th]:px-2.5 [&_tbody_th]:py-1 [&_tbody_th]:font-semibold [&_tbody_tr]:border-t [&_tbody_tr]:border-line/10">
          <caption className="sr-only">{tittel}</caption>
          <thead className="sticky top-0 bg-paper-2">
            <tr>
              {kolonner.map((k, i) => (
                <th key={k} scope="col" className={`px-2.5 py-1.5 font-bold ${i > 0 ? "text-right" : ""}`}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {c}
                    </th>
                  ) : (
                    <td key={j}>{c}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Seksjonskort med overskrift, ingress og innhold – samme stil som stedssidene. */
export function Seksjon({
  id,
  emoji,
  tittel,
  ingress,
  children,
  className = "",
}: {
  id: string;
  emoji?: string;
  tittel: string;
  ingress?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-tittel`} className={`card scroll-mt-24 p-5 sm:p-6 ${className}`}>
      <h2 id={`${id}-tittel`} className="font-display text-2xl font-extrabold leading-tight">
        {emoji && (
          <span aria-hidden className="mr-1.5">
            {emoji}
          </span>
        )}
        {tittel}
      </h2>
      {ingress && <div className="mt-1 mb-4 text-sm text-ink-soft">{ingress}</div>}
      {!ingress && <div className="mb-3" />}
      {children}
    </section>
  );
}

/** Nøkkeltall-flis: etikett, verdi og valgfri endring/forklaring. */
export function Flis({
  etikett,
  verdi,
  under,
  className = "",
}: {
  etikett: string;
  verdi: ReactNode;
  under?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-4 ${className}`}>
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">{etikett}</dt>
      <dd className="mt-1">
        <span className="block font-display text-3xl font-extrabold leading-none sm:text-4xl">{verdi}</span>
        {under && <span className="mt-1.5 block text-xs font-semibold text-ink-soft">{under}</span>}
      </dd>
    </div>
  );
}
