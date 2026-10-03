import type { KalibreringsPunkt } from "@/lib/prediksjon/metrikker";
import { prosent } from "@/lib/stats";

type Props = { punkter: KalibreringsPunkt[]; tittel: string; id: string };

const B = 300;
const H = 280;
const M = { t: 12, r: 14, b: 44, l: 46 };

function rundOpp(x: number): number {
  const steg = x > 0.3 ? 0.1 : 0.05;
  return Math.ceil(x / steg) * steg;
}

/**
 * Kalibreringsplott (desiler): spådd sannsynlighet mot faktisk andel i tilbaketesten.
 * Punkter på diagonalen = modellen mener det den sier.
 */
export default function Kalibrering({ punkter, tittel, id }: Props) {
  const maks = rundOpp(Math.max(...punkter.flatMap((p) => [p.predikert, p.faktisk])) * 1.05);
  const pw = B - M.l - M.r;
  const ph = H - M.t - M.b;
  const x = (v: number) => M.l + (v / maks) * pw;
  const y = (v: number) => M.t + ph - (v / maks) * ph;
  const steg = maks > 0.3 ? 0.1 : 0.05;
  const ticks = Array.from({ length: Math.round(maks / steg) + 1 }, (_, i) => i * steg);
  const linje = punkter.map((p, i) => `${i ? "L" : "M"}${x(p.predikert).toFixed(1)} ${y(p.faktisk).toFixed(1)}`).join(" ");
  const beskrivelse = `${tittel}. Ti grupper sortert etter spådd sannsynlighet. Spådd fra ${prosent(punkter[0].predikert, 1)} til ${prosent(punkter[punkter.length - 1].predikert, 1)}, faktisk fra ${prosent(punkter[0].faktisk, 1)} til ${prosent(punkter[punkter.length - 1].faktisk, 1)}. Tabell under figuren.`;

  return (
    <figure className="space-y-2">
      <figcaption id={`${id}-tittel`} className="font-bold">
        {tittel}
      </figcaption>
      <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full max-w-sm" role="img" aria-labelledby={`${id}-tittel`} aria-describedby={`${id}-besk`}>
        <desc id={`${id}-besk`}>{beskrivelse}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(maks)} y1={y(t)} y2={y(t)} className="stroke-line/20" strokeWidth={1} />
            <text x={M.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-ink-soft text-[10px] tabular-nums">
              {Math.round(t * 100)} %
            </text>
            <text x={x(t)} y={M.t + ph + 15} textAnchor="middle" className="fill-ink-soft text-[10px] tabular-nums">
              {Math.round(t * 100)} %
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={y(0)} y2={y(maks)} className="stroke-line/40" strokeWidth={1} />
        <line x1={x(0)} x2={x(maks)} y1={y(0)} y2={y(0)} className="stroke-line/40" strokeWidth={1} />
        {/* Perfekt kalibrering */}
        <line x1={x(0)} y1={y(0)} x2={x(maks)} y2={y(maks)} className="stroke-ink-soft" strokeWidth={1} />
        <text x={x(maks * 0.97)} y={y(maks * 0.97) + 14} textAnchor="end" className="fill-ink-soft text-[10px] italic">
          perfekt treff
        </text>
        <path d={linje} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {punkter.map((p, i) => (
          <g key={i}>
            <title>{`Gruppe ${i + 1}: spådd ${prosent(p.predikert, 1)}, faktisk ${prosent(p.faktisk, 1)} (${p.n.toLocaleString("nb-NO")} eksempler)`}</title>
            <circle cx={x(p.predikert)} cy={y(p.faktisk)} r={12} fill="transparent" />
            <circle cx={x(p.predikert)} cy={y(p.faktisk)} r={4.5} className="fill-accent stroke-card" strokeWidth={2} />
          </g>
        ))}
        <text x={M.l + pw / 2} y={H - 6} textAnchor="middle" className="fill-ink-soft text-[11px] font-semibold">
          Spådd sannsynlighet
        </text>
        <text transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-soft text-[11px] font-semibold">
          Faktisk andel
        </text>
      </svg>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-soft">Vis som tabell</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="border-b-2 border-line">
              <th scope="col" className="py-1 pr-2">Gruppe</th>
              <th scope="col" className="py-1 pr-2">Spådd</th>
              <th scope="col" className="py-1 pr-2">Faktisk</th>
              <th scope="col" className="py-1">Antall</th>
            </tr>
          </thead>
          <tbody>
            {punkter.map((p, i) => (
              <tr key={i} className="border-b border-line/15">
                <td className="py-1 pr-2">{i + 1}</td>
                <td className="py-1 pr-2">{prosent(p.predikert, 1)}</td>
                <td className="py-1 pr-2">{prosent(p.faktisk, 1)}</td>
                <td className="py-1">{p.n.toLocaleString("nb-NO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
