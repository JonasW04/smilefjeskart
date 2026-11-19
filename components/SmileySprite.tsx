import { smileyElements, smileyId, type SmileyElement, type SmileyKind } from "@/lib/smiley";

const KINDS: SmileyKind[] = ["smil", "strek", "sur", "ukjent"];

function Figur({ el }: { el: SmileyElement }) {
  // Bare attributter som har verdi, så RSC-payloaden ikke fylles med "$undefined".
  const p: Record<string, string | number> = { fill: "fill" in el && el.fill ? el.fill : "none" };
  if ("stroke" in el && el.stroke) {
    p.stroke = el.stroke;
    p.strokeWidth = el.sw ?? 3;
    p.strokeLinecap = "round";
    p.strokeLinejoin = "round";
  }
  if ("o" in el && el.o !== undefined) p.opacity = el.o;
  if (el.t === "circle") return <circle cx={el.cx} cy={el.cy} r={el.r} {...p} />;
  if (el.t === "ellipse") return <ellipse cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} {...p} />;
  return <path d={el.d} {...p} />;
}

/**
 * Definerer de fire smilefjesene én gang per dokument som SVG-symboler. <Smiley> peker hit med
 * <use href="#smiley-smil">, i stedet for å gjenta hele figuren for hvert fjes. Rendres én gang,
 * i rot-layouten.
 */
export default function SmileySprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", overflow: "hidden" }} aria-hidden="true" focusable="false">
      <defs>
        {KINDS.map((k) => (
          <symbol key={k} id={smileyId(k)} viewBox="0 0 64 64">
            {smileyElements(k).map((el, i) => (
              <Figur key={i} el={el} />
            ))}
          </symbol>
        ))}
      </defs>
    </svg>
  );
}
