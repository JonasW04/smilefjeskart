import fs from "node:fs";
import path from "node:path";
import { smileySvg, type SmileyKind } from "@/lib/smiley";

export const OG_SIZE = { width: 1200, height: 630 };

export const DISPLAY = "Bricolage";

let font: Buffer | null = null;

/** Fontinnstillinger for ImageResponse: Bricolage Grotesque ExtraBold til titler. */
export function ogOptions() {
  font ??= fs.readFileSync(path.join(process.cwd(), "assets", "fonts", "BricolageGrotesque-ExtraBold.ttf"));
  return { ...OG_SIZE, fonts: [{ name: DISPLAY, data: font, weight: 800 as const, style: "normal" as const }] };
}

const PAPER = "#fff8ec";
const INK = "#1e1631";
const BG: Record<SmileyKind, string> = { smil: "#d4f6e3", strek: "#fff0c4", sur: "#ffdde0", ukjent: "#ece8f3" };

export function smileyImg(kind: SmileyKind, size: number) {
  const src = `data:image/svg+xml;base64,${Buffer.from(smileySvg(kind, size)).toString("base64")}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="" />;
}

/** Felles ramme for delingsbilder: papirbakgrunn, kort med klistremerke-skygge. */
export function OgFrame({ kind, children }: { kind: SmileyKind; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: PAPER, padding: 48, color: INK, fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          flex: 1,
          background: BG[kind],
          border: `5px solid ${INK}`,
          borderRadius: 40,
          boxShadow: `12px 12px 0 ${INK}`,
          padding: 56,
          alignItems: "center",
          gap: 56,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function OgBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontFamily: DISPLAY }}>
      {smileyImg("smil", 40)}
      <span>Smilefjes</span>
      <span style={{ color: "#6b4eff", marginLeft: -12 }}>kartet</span>
    </div>
  );
}
