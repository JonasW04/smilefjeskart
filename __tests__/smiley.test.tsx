import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Smiley from "@/components/Smiley";
import SmileySprite from "@/components/SmileySprite";
import { smileySvg, type SmileyKind } from "@/lib/smiley";

const KINDS: SmileyKind[] = ["smil", "strek", "sur", "ukjent"];

describe("Smiley as a sprite reference", () => {
  it("renders a decorative <use> reference with no inline geometry", () => {
    expect(renderToStaticMarkup(<Smiley kind="strek" size={30} className="shrink-0" />)).toBe(
      '<svg width="30" height="30" class="shrink-0" aria-hidden="true"><use href="#smiley-strek"></use></svg>',
    );
  });

  it("exposes the label as an accessible image when given one", () => {
    expect(renderToStaticMarkup(<Smiley kind="sur" label="Sur munn" />)).toBe(
      '<svg width="40" height="40" role="img" aria-label="Sur munn"><use href="#smiley-sur"></use></svg>',
    );
  });

  it("defines each face once with the same geometry as the standalone SVG used for map markers", () => {
    const html = renderToStaticMarkup(<SmileySprite />);
    expect(html).toContain('aria-hidden="true"');
    for (const k of KINDS) {
      expect(html.split(`id="smiley-${k}"`)).toHaveLength(2);
      // React skriver <circle ...></circle> der strengversjonen bruker <circle .../>.
      const kropp = smileySvg(k)
        .replace(/^<svg[^>]*>|<\/svg>$/g, "")
        .replace(/<(\w+)([^>]*)\/>/g, "<$1$2></$1>");
      expect(html).toContain(`<symbol id="smiley-${k}" viewBox="0 0 64 64">${kropp}</symbol>`);
    }
    expect(html).not.toContain("undefined");
  });
});
