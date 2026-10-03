import { andel, prosent, type Fordeling } from "@/lib/stats";

type Props = { fordeling: Fordeling; label: string; compact?: boolean };

/** Liggende stablet stolpe: andel smil / strek / sur. */
export default function FordelingBar({ fordeling: f, label, compact }: Props) {
  const deler = [
    { key: "smil", farge: "bg-smil", verdi: andel(f, "smil"), tekst: "smil" },
    { key: "strek", farge: "bg-strek", verdi: andel(f, "strek"), tekst: "strekmunn" },
    { key: "sur", farge: "bg-sur", verdi: andel(f, "sur"), tekst: "sur munn" },
  ] as const;
  const beskrivelse = deler.map((d) => `${prosent(d.verdi)} ${d.tekst}`).join(", ");
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-ink-soft">{prosent(andel(f, "smil"))} smil</span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${beskrivelse} (${f.total} steder)`}
        className={`flex overflow-hidden rounded-full border-2 border-line ${compact ? "h-3" : "h-5"}`}
      >
        {deler.map((d) =>
          d.verdi > 0 ? <div key={d.key} className={d.farge} style={{ width: `${d.verdi * 100}%` }} /> : null,
        )}
      </div>
    </div>
  );
}
