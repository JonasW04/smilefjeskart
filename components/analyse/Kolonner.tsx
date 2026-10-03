import { penSkala } from "@/lib/chart";
import Tips from "./Tips";

export type Del = {
  verdi: number;
  /** Tailwind fill-klasse, f.eks. "fill-strek". */
  fyll: string;
};

export type Kolonne = {
  etikett: string;
  /** Kortere etikett for smale skjermer. */
  kort?: string;
  /** Stablede deler, nederst først. */
  deler: Del[];
  /** Tooltip-linjer, skilt med «|». Første linje er verdien. */
  tips: string;
  /** Tegnes blekere (f.eks. et år som ikke er ferdig). */
  dempet?: boolean;
  /** Liten merknad over kolonnen, f.eks. «korona». */
  merke?: string;
};

type Props = {
  kolonner: Kolonne[];
  /** Formatterer akseverdier. */
  format: (v: number) => string;
  /** Beskrivelse for skjermlesere. Tallene finnes i tabellen under grafen. */
  label: string;
  /** Sammenligningslinje (samme enhet og akse), f.eks. hele Norge. */
  referanse?: (number | null)[];
  /** Minste toppverdi for y-aksen. */
  minMaks?: number;
  /**
   * Omtrentlig bredde (px) grafen får på store skjermer (≥ lg). Brukes som viewBox-bredde der,
   * så teksten blir omtrent 11 px. Standard: samme som på nettbrett (680).
   */
  lgBredde?: number;
};

const BREDDER = { smal: 340, bred: 680 } as const;

/**
 * Serverrendret kolonnegraf (stablet eller enkel) i SVG. Tegnes i to–tre bredder (mobil, nettbrett,
 * ev. desktop) og vises med CSS, så teksten har lesbar størrelse uten at SVG-en skalerer den.
 */
export default function Kolonner(props: Props) {
  const lg = props.lgBredde && props.lgBredde !== BREDDER.bred ? props.lgBredde : null;
  return (
    <Tips>
      <div className="sm:hidden">
        <Tegning {...props} bredde={BREDDER.smal} />
      </div>
      <div className={lg ? "hidden sm:block lg:hidden" : "hidden sm:block"}>
        <Tegning {...props} bredde={BREDDER.bred} />
      </div>
      {lg && (
        <div className="hidden lg:block">
          <Tegning {...props} bredde={lg} />
        </div>
      )}
    </Tips>
  );
}

/** Rektangel med 4 px avrundet topp og rett bunn. */
function toppAvrundet(x: number, y: number, b: number, h: number, r = 4): string {
  const rr = Math.min(r, h, b / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + b - rr}Q${x + b},${y} ${x + b},${y + rr}V${y + h}Z`;
}

function Tegning({ kolonner, format, label, referanse, minMaks = 0, bredde }: Props & { bredde: number }) {
  const smal = bredde < 400;
  const H = smal ? 200 : 240;
  const venstre = smal ? 34 : 44;
  const hoyre = 6;
  const topp = 18;
  const bunn = kolonner.some((k) => k.dempet) ? 34 : 22;
  const plotB = bredde - venstre - hoyre;
  const plotH = H - topp - bunn;

  const totaler = kolonner.map((k) => k.deler.reduce((s, d) => s + d.verdi, 0));
  const maksData = Math.max(minMaks, ...totaler, ...(referanse ?? []).map((v) => v ?? 0));
  const skala = penSkala(maksData, smal ? 3 : 4);
  const y = (v: number) => topp + plotH - (v / skala.maks) * plotH;

  const band = plotB / kolonner.length;
  const sb = Math.min(24, band * 0.62);
  const cx = (i: number) => venstre + band * i + band / 2;
  // Vis annenhver etikett når det er trangt.
  const hver = band < 26 ? 2 : 1;

  const refPunkter = (referanse ?? [])
    .map((v, i) => (v === null || v === undefined ? null : ([cx(i), y(v)] as const)))
    .filter((p): p is readonly [number, number] => p !== null);

  return (
    <svg viewBox={`0 0 ${bredde} ${H}`} width="100%" role="img" aria-label={label} className="block h-auto overflow-visible">
      {/* Rutenett og y-akse */}
      {skala.ticks.map((t) => (
        <g key={t}>
          <line
            x1={venstre}
            x2={bredde - hoyre}
            y1={y(t)}
            y2={y(t)}
            className={t === 0 ? "stroke-ink-soft/60" : "stroke-ink-soft/20"}
            strokeWidth={1}
          />
          <text x={venstre - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-soft text-[11px] tabular-nums">
            {format(t)}
          </text>
        </g>
      ))}

      {/* Kolonner */}
      {kolonner.map((k, i) => {
        const x = cx(i) - sb / 2;
        let base = 0;
        const synlige = k.deler.filter((d) => d.verdi > 0);
        return (
          <g key={k.etikett} opacity={k.dempet ? 0.5 : 1}>
            {synlige.map((d, j) => {
              const y0 = y(base);
              base += d.verdi;
              const y1 = y(base);
              // 2 px luft mellom stablede deler.
              const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
              if (h <= 0) return null;
              const erTopp = j === synlige.length - 1;
              return erTopp ? (
                <path key={j} d={toppAvrundet(x, y0 - (j > 0 ? 2 : 0) - h, sb, h)} className={d.fyll} />
              ) : (
                <rect key={j} x={x} y={y0 - (j > 0 ? 2 : 0) - h} width={sb} height={h} className={d.fyll} />
              );
            })}
            {k.merke && (
              <text x={cx(i)} y={y(totaler[i]) - 6} textAnchor="middle" className="fill-ink-soft text-[10px] font-semibold">
                {k.merke}
              </text>
            )}
          </g>
        );
      })}

      {/* Sammenligningslinje */}
      {refPunkter.length > 1 && (
        <polyline
          points={refPunkter.map((p) => p.join(",")).join(" ")}
          className="fill-none stroke-ink"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {refPunkter.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={4} className="fill-ink stroke-card" strokeWidth={2} />
      ))}

      {/* X-etiketter */}
      {kolonner.map((k, i) =>
        (kolonner.length - 1 - i) % hver === 0 ? (
          <text key={k.etikett} x={cx(i)} y={topp + plotH + 15} textAnchor="middle" className="fill-ink-soft text-[11px] tabular-nums">
            {smal && k.kort ? k.kort : k.etikett}
            {k.dempet && (
              <tspan x={cx(i)} dy="1.15em" className="text-[10px] italic">
                hittil
              </tspan>
            )}
          </text>
        ) : null,
      )}

      {/* Treffflater for tooltip: hele båndet, ikke bare den malte stolpen. */}
      {kolonner.map((k, i) => (
        <rect
          key={k.etikett}
          x={venstre + band * i}
          y={topp}
          width={band}
          height={plotH}
          fill="transparent"
          data-tip={k.tips}
          className="cursor-default hover:fill-ink/5"
        />
      ))}
    </svg>
  );
}
