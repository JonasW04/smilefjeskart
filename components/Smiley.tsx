import { smileyId, type SmileyKind } from "@/lib/smiley";

type Props = {
  kind: SmileyKind;
  size?: number;
  className?: string;
  /** Tekst for skjermlesere. Utelat for dekorative fjes ved siden av tekst. */
  label?: string;
};

/**
 * Et smilefjes. Figuren ligger i <SmileySprite /> (rot-layouten), så hvert fjes er bare en
 * <use>-referanse og ikke ti SVG-elementer. <use> fyller hele <svg>-en, og symbolets viewBox skalerer
 * figuren, så størrelsen styres av size eller CSS.
 */
export default function Smiley({ kind, size = 40, className, label }: Props) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg width={size} height={size} {...(className ? { className } : {})} {...a11y}>
      <use href={`#${smileyId(kind)}`} />
    </svg>
  );
}
