import { prosent } from "@/lib/stats";

export type RisikoRad = { navn: string; spadd: number; observert: number; nObservert: number; steder: number };

/**
 * Liggende stolper: spådd andel strek/sur ved neste ordinære tilsyn (stolpe) og faktisk
 * andel de siste tre årene (strek). To serier med ulik form, så fargen aldri er alene om identiteten.
 */
export default function RisikoStolper({ rader, id, tittel }: { rader: RisikoRad[]; id: string; tittel: string }) {
  const maks = Math.ceil((Math.max(...rader.flatMap((r) => [r.spadd, r.observert])) * 1.08) / 0.05) * 0.05;
  const pst = (v: number) => `${(v / maks) * 100}%`;
  return (
    <figure className="space-y-3">
      <figcaption id={`${id}-tittel`} className="font-bold">
        {tittel}
      </figcaption>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-soft" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-accent" /> Spådd neste runde
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-[3px] rounded-full bg-ink" /> Faktisk siste 3 år
        </span>
      </div>
      <ul className="space-y-2" aria-labelledby={`${id}-tittel`}>
        {rader.map((r) => (
          <li key={r.navn} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,10rem)_1fr_3.5rem]">
            <span className="truncate font-semibold" title={r.navn}>{r.navn}</span>
            <span
              className="relative block h-4"
              title={`${r.navn}: spådd ${prosent(r.spadd, 1)}, faktisk siste 3 år ${prosent(r.observert, 1)} av ${r.nObservert.toLocaleString("nb-NO")} tilsyn (${r.steder} steder i dag)`}
            >
              <span className="absolute inset-y-0.5 left-0 rounded-r-[4px] bg-accent" style={{ width: pst(r.spadd) }} />
              <span className="absolute -inset-y-0.5 w-[3px] -translate-x-1/2 rounded-full bg-ink ring-2 ring-card" style={{ left: pst(r.observert) }} />
              <span className="sr-only">
                Spådd {prosent(r.spadd)}, faktisk siste tre år {prosent(r.observert)} av {r.nObservert} tilsyn.
              </span>
            </span>
            <span className="text-right font-bold tabular-nums" aria-hidden>{prosent(r.spadd)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
