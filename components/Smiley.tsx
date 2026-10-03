import { smileyElements, type SmileyKind } from "@/lib/smiley";
import { SMILE_LABEL } from "@/lib/smile";

type Props = {
  kind: SmileyKind;
  size?: number;
  className?: string;
  /** Tekst for skjermlesere. Utelat for dekorative fjes ved siden av tekst. */
  label?: string;
};

export default function Smiley({ kind, size = 40, className, label }: Props) {
  const aria = label ?? (kind === "ukjent" ? undefined : SMILE_LABEL[kind]);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label ? aria : undefined}
      aria-hidden={label ? undefined : true}
    >
      {smileyElements(kind).map((el, i) => {
        const common = {
          fill: "fill" in el && el.fill ? el.fill : "none",
          stroke: "stroke" in el ? el.stroke : undefined,
          strokeWidth: "sw" in el ? el.sw : undefined,
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
          opacity: "o" in el ? el.o : undefined,
        };
        if (el.t === "circle") return <circle key={i} cx={el.cx} cy={el.cy} r={el.r} {...common} />;
        if (el.t === "ellipse") return <ellipse key={i} cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} {...common} />;
        return <path key={i} d={el.d} {...common} />;
      })}
    </svg>
  );
}
