import { penSkala } from "@/lib/chart";
import Tips from "./Tips";

export type Serie = { navn: string; verdier: number[] };

type Props = {
  /** X-etiketter (f.eks. år). */
  etiketter: string[];
  serier: Serie[];
  format: (v: number) => string;
  /** Indeks for punkter som er usikre (f.eks. et år som ikke er ferdig). Tegnes som hul ring. */
  dempet?: number[];
  /** Ekstra tooltip-linje per x, f.eks. antall tilsyn. */
  tipsEkstra?: (i: number, serie: number) => string;
};

const BREDDER = { smal: 300, bred: 360 } as const;

/**
 * Små multipler: én liten linjegraf per serie, samme y-skala i alle. Serien i panelet er uthevet
 * i aksentfarge, de andre ligger svakt i bakgrunnen for sammenligning.
 */
export default function SmaaLinjer({ etiketter, serier, format, dempet = [], tipsEkstra }: Props) {
  const maks = Math.max(...serier.flatMap((s) => s.verdier));
  const skala = penSkala(maks, 2);
  return (
    <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      {serier.map((s, si) => (
        <li key={s.navn}>
          <p className="text-sm font-bold">{s.navn}</p>
          <Tips>
            <div className="sm:hidden">
              <Panel
                {...{ etiketter, serier, format, dempet, tipsEkstra, si, skalaMaks: skala.maks, ticks: skala.ticks }}
                bredde={BREDDER.smal}
              />
            </div>
            <div className="hidden sm:block">
              <Panel
                {...{ etiketter, serier, format, dempet, tipsEkstra, si, skalaMaks: skala.maks, ticks: skala.ticks }}
                bredde={BREDDER.bred}
              />
            </div>
          </Tips>
        </li>
      ))}
    </ul>
  );
}

function Panel({
  etiketter,
  serier,
  format,
  dempet,
  tipsEkstra,
  si,
  skalaMaks,
  ticks,
  bredde,
}: Required<Omit<Props, "tipsEkstra">> & {
  tipsEkstra?: Props["tipsEkstra"];
  si: number;
  skalaMaks: number;
  ticks: number[];
  bredde: number;
}) {
  const H = 130;
  const venstre = 34;
  const hoyre = 40;
  const topp = 10;
  const bunn = 20;
  const plotB = bredde - venstre - hoyre;
  const plotH = H - topp - bunn;
  const n = etiketter.length;
  const x = (i: number) => venstre + (n === 1 ? plotB / 2 : (i / (n - 1)) * plotB);
  const y = (v: number) => topp + plotH - (v / skalaMaks) * plotH;
  const serie = serier[si];
  const sti = (v: number[]) => v.map((val, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join("");
  const sist = serie.verdier.length - 1;
  const forste = 0;
  const band = plotB / Math.max(1, n - 1);
  const label = `${serie.navn}: fra ${format(serie.verdier[forste])} i ${etiketter[forste]} til ${format(serie.verdier[sist])} i ${etiketter[sist]}`;

  return (
    <svg viewBox={`0 0 ${bredde} ${H}`} width="100%" role="img" aria-label={label} className="block h-auto overflow-visible">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={venstre}
            x2={bredde - hoyre}
            y1={y(t)}
            y2={y(t)}
            className={t === 0 ? "stroke-ink-soft/60" : "stroke-ink-soft/20"}
            strokeWidth={1}
          />
          <text x={venstre - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-soft text-[10px] tabular-nums">
            {format(t)}
          </text>
        </g>
      ))}
      {/* De andre seriene, dempet */}
      {serier.map((s, i) =>
        i === si ? null : (
          <path
            key={s.navn}
            d={sti(s.verdier)}
            className="fill-none stroke-ukjent"
            strokeWidth={1.5}
            strokeLinejoin="round"
            opacity={0.7}
          />
        ),
      )}
      <path d={sti(serie.verdier)} className="fill-none stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {[forste, sist].map((i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(serie.verdier[i])}
          r={4}
          className={dempet.includes(i) ? "fill-card stroke-accent" : "fill-accent stroke-card"}
          strokeWidth={2}
        />
      ))}
      <text x={x(sist) + 8} y={y(serie.verdier[sist])} dy="0.32em" className="fill-ink text-[11px] font-bold tabular-nums">
        {format(serie.verdier[sist])}
      </text>
      <text x={x(forste)} y={H - 4} textAnchor="start" className="fill-ink-soft text-[10px] tabular-nums">
        {etiketter[forste]}
      </text>
      <text x={x(sist)} y={H - 4} textAnchor="end" className="fill-ink-soft text-[10px] tabular-nums">
        {etiketter[sist]}
        {dempet.includes(sist) ? " (hittil)" : ""}
      </text>
      {etiketter.map((e, i) => (
        <rect
          key={e}
          x={x(i) - band / 2}
          y={topp}
          width={band}
          height={plotH}
          fill="transparent"
          data-tip={`${format(serie.verdier[i])}|${serie.navn}, ${e}${dempet.includes(i) ? " (hittil)" : ""}${tipsEkstra ? `|${tipsEkstra(i, si)}` : ""}`}
        />
      ))}
    </svg>
  );
}
