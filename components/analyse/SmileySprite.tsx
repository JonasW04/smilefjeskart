import Smiley from "@/components/Smiley";
import type { SmileyKind } from "@/lib/smiley";

const KINDS: SmileyKind[] = ["smil", "strek", "sur", "ukjent"];

/**
 * Definerer smilefjesene én gang per side som SVG-symboler. Lange lister (f.eks. alle 1 300 steder
 * i Oslo) bruker <use href="#sf-smil"> og peker hit, i stedet for å gjenta hele figuren for hver rad.
 * Skal bare rendres én gang per side.
 */
export function SmileySprite() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        {KINDS.map((k) => (
          <symbol key={k} id={`sf-${k}`} viewBox="0 0 64 64">
            <Smiley kind={k} size={64} />
          </symbol>
        ))}
      </defs>
    </svg>
  );
}
