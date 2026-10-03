import { ImageResponse } from "next/og";
import { DISPLAY, OG_SIZE, OgBrand, OgFrame, ogOptions, smileyImg } from "@/components/og";

export const alt = "Smilefjeskartet – Mattilsynets smilefjeskontroller på kart";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <OgFrame kind="smil">
        <div style={{ display: "flex", flexDirection: "column", gap: 24, flex: 1 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", transform: "rotate(-8deg)" }}>{smileyImg("smil", 130)}</div>
            <div style={{ display: "flex", transform: "rotate(5deg)" }}>{smileyImg("strek", 130)}</div>
            <div style={{ display: "flex", transform: "rotate(-4deg)" }}>{smileyImg("sur", 130)}</div>
          </div>
          <div style={{ display: "flex", fontSize: 84, fontFamily: DISPLAY, lineHeight: 1, letterSpacing: -2 }}>Hvor rent er kjøkkenet?</div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.75 }}>Alle Mattilsynets smilefjestilsyn siden 2016 – på kart.</div>
          <OgBrand />
        </div>
      </OgFrame>
    ),
    ogOptions(),
  );
}
