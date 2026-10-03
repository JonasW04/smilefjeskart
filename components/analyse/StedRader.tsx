import type { SmileyKind } from "@/lib/smiley";

export type StedRad = {
  key: string;
  slug: string;
  navn: string;
  kind: SmileyKind;
  /** Skjermlesertekst for fjeset. */
  label?: string;
  /** Linje under navnet (adresse, kommune …). */
  under?: string;
  /** Kort tall/dato til høyre. */
  meta?: string;
  metaTittel?: string;
};

const KOLONNER = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
} as const;

/**
 * Kompakt liste med steder, hvert med smilefjes og lenke til /sted/[slug].
 * Stilene ligger på <ul> (Tailwind-varianter for etterkommere), så hver rad er minimal markup –
 * viktig når Oslo har over tusen steder. Krever <SmileySprite /> på siden (fjesene er <use>-referanser).
 */
export default function StedRader({ rader, kolonner = 1 }: { rader: StedRad[]; kolonner?: keyof typeof KOLONNER }) {
  return (
    <ul
      className={`grid gap-x-6 ${KOLONNER[kolonner]} [&_svg]:shrink-0 [&>li]:min-w-0 [&>li]:border-b [&>li]:border-line/10 [&_a]:-mx-2 [&_a]:flex [&_a]:items-center [&_a]:gap-2.5 [&_a]:rounded-xl [&_a]:px-2 [&_a]:py-1.5 [&_a:hover]:bg-accent-soft [&_a>span]:min-w-0 [&_a>span]:flex-1 [&_strong]:block [&_strong]:truncate [&_strong]:text-sm [&_strong]:font-semibold [&_a>span>span]:block [&_a>span>span]:truncate [&_a>span>span]:text-xs [&_a>span>span]:text-ink-soft [&_small]:shrink-0 [&_small]:text-xs [&_small]:font-semibold [&_small]:tabular-nums [&_small]:text-ink-soft`}
    >
      {rader.map((r) => (
        <li key={r.key}>
          {/* Vanlig <a>: lange lister skal ikke forhåndslaste hundrevis av sider, og gir mindre RSC-payload. */}
          <a href={`/sted/${r.slug}`}>
            <svg width={24} height={24} role={r.label ? "img" : undefined} aria-label={r.label} aria-hidden={r.label ? undefined : true}>
              <use href={`#sf-${r.kind}`} />
            </svg>
            <span>
              <strong>{r.navn}</strong>
              {r.under && <span>{r.under}</span>}
            </span>
            {r.meta && <small title={r.metaTittel}>{r.meta}</small>}
          </a>
        </li>
      ))}
    </ul>
  );
}
