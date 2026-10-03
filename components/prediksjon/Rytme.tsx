import { prosent } from "@/lib/stats";

type Boette = { fra: number; til: number; andel: number; n: number };

const B = 360;
const H = 210;
const M = { t: 26, r: 8, b: 34, l: 36 };

function mnd(dager: number): string {
  const m = Math.round(dager / 30.44);
  return m === 1 ? "1 mnd" : `${m} mnd`;
}

/** Søyler: andel steder som fikk ordinært tilsyn innen horisonten, etter dager siden forrige. */
export default function Rytme({ boetter, horisont }: { boetter: Boette[]; horisont: number }) {
  const maks = Math.ceil((Math.max(...boetter.map((b) => b.andel)) * 1.1) / 0.1) * 0.1;
  const pw = B - M.l - M.r;
  const ph = H - M.t - M.b;
  const slot = pw / boetter.length;
  const bredde = Math.min(24, slot - 2);
  const y = (v: number) => M.t + ph - (v / maks) * ph;
  // Rytmen har typisk to topper: årlige tilsyn og tilsyn annethvert år. Vi merker den høyeste før og etter 18 måneder.
  const toppIndeks = (fra: number, til: number) =>
    boetter.reduce((best, b, i) => (b.fra >= fra && b.fra < til && (best < 0 || b.andel > boetter[best].andel) ? i : best), -1);
  const topper = [toppIndeks(0, 540), toppIndeks(540, Infinity)].filter((i) => i >= 0);
  const ticks = Array.from({ length: Math.round(maks / 0.1) + 1 }, (_, i) => i * 0.1);
  const sluttDag = boetter[boetter.length - 1].til;
  const xDag = (d: number) => M.l + (d / sluttDag) * pw;

  return (
    <figure className="space-y-2">
      <figcaption id="rytme-tittel" className="font-bold">
        Andel som fikk ordinært tilsyn innen {horisont} dager
      </figcaption>
      <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full" role="img" aria-labelledby="rytme-tittel" aria-describedby="rytme-besk">
        <desc id="rytme-besk">
          {`Søylediagram. Sjansen for ordinært tilsyn de neste ${horisont} dagene er ${prosent(boetter[0].andel, 1)} rett etter et tilsyn. ${topper
            .map((i) => `Den topper med ${prosent(boetter[i].andel)} når det har gått ${boetter[i].fra}–${boetter[i].til} dager`)
            .join(". ")}. Tabell under figuren.`}
        </desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={B - M.r} y1={y(t)} y2={y(t)} className="stroke-line/20" strokeWidth={1} />
            <text x={M.l - 5} y={y(t) + 3.5} textAnchor="end" className="fill-ink-soft text-[10px] tabular-nums">
              {Math.round(t * 100)} %
            </text>
          </g>
        ))}
        {boetter.map((b, i) => {
          const h = Math.max(0, y(0) - y(b.andel));
          const x0 = M.l + i * slot + (slot - bredde) / 2;
          const r = Math.min(4, h, bredde / 2);
          const yt = y(0) - h;
          // Avrundet topp, rett bunn mot grunnlinjen.
          const d = `M${x0} ${y(0)} V${yt + r} Q${x0} ${yt} ${x0 + r} ${yt} H${x0 + bredde - r} Q${x0 + bredde} ${yt} ${x0 + bredde} ${yt + r} V${y(0)} Z`;
          return (
            <g key={b.fra}>
              <title>{`${b.fra}–${b.til} dager siden sist: ${prosent(b.andel, 1)} fikk tilsyn innen ${horisont} dager (${b.n.toLocaleString("nb-NO")} tilfeller)`}</title>
              <rect x={M.l + i * slot} y={M.t} width={slot} height={ph} fill="transparent" />
              <path d={d} className={topper.includes(i) ? "fill-accent" : "fill-accent/45"} />
            </g>
          );
        })}
        <line x1={M.l} x2={B - M.r} y1={y(0)} y2={y(0)} className="stroke-line/60" strokeWidth={1} />
        {topper.map((i) => (
          <text key={i} x={M.l + i * slot + slot / 2} y={y(boetter[i].andel) - 7} textAnchor="middle" className="fill-ink text-[11px] font-bold">
            {prosent(boetter[i].andel)}
          </text>
        ))}
        {[0, 182, 365, 548, 730, 913, 1095].filter((d) => d <= sluttDag).map((d) => (
          <text key={d} x={xDag(d)} y={H - M.b + 15} textAnchor="middle" className="fill-ink-soft text-[10px]">
            {d === 0 ? "0" : d === 365 ? "1 år" : d === 730 ? "2 år" : d === 1095 ? "3 år" : mnd(d)}
          </text>
        ))}
        <text x={M.l + pw / 2} y={H - 4} textAnchor="middle" className="fill-ink-soft text-[11px] font-semibold">
          Tid siden forrige ordinære tilsyn
        </text>
      </svg>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-soft">Vis som tabell</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr className="border-b-2 border-line">
                <th scope="col" className="py-1 pr-2">Dager siden sist</th>
                <th scope="col" className="py-1 pr-2">Fikk tilsyn innen {horisont} dager</th>
                <th scope="col" className="py-1">Tilfeller</th>
              </tr>
            </thead>
            <tbody>
              {boetter.map((b) => (
                <tr key={b.fra} className="border-b border-line/15">
                  <td className="py-1 pr-2">{b.fra}–{b.til}</td>
                  <td className="py-1 pr-2">{prosent(b.andel, 1)}</td>
                  <td className="py-1">{b.n.toLocaleString("nb-NO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
