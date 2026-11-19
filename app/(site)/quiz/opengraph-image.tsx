import { ImageResponse } from "next/og";
import { DISPLAY, OG_SIZE, OgBrand, OgFrame, ogOptions, smileyImg } from "@/components/og";

export const alt = "Gjett smilefjeset – dagens Smilefjes-quiz på Smilefjeskartet";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <OgFrame kind="strek">
        <div style={{ display: "flex", flexDirection: "column", gap: 24, flex: 1 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", transform: "rotate(-8deg)" }}>{smileyImg("smil", 120)}</div>
            <div style={{ display: "flex", fontSize: 110, fontFamily: DISPLAY }}>?</div>
            <div style={{ display: "flex", transform: "rotate(5deg)" }}>{smileyImg("strek", 120)}</div>
            <div style={{ display: "flex", fontSize: 110, fontFamily: DISPLAY }}>?</div>
            <div style={{ display: "flex", transform: "rotate(-4deg)" }}>{smileyImg("sur", 120)}</div>
          </div>
          <div style={{ display: "flex", fontSize: 92, fontFamily: DISPLAY, lineHeight: 1, letterSpacing: -2 }}>Gjett smilefjeset</div>
          <div style={{ display: "flex", fontSize: 36, opacity: 0.75 }}>Fem ekte spisesteder hver dag. Fikk de smil, strekmunn eller sur munn?</div>
          <OgBrand />
        </div>
      </OgFrame>
    ),
    ogOptions(),
  );
}
