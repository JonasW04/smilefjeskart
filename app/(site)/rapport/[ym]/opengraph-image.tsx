import { ImageResponse } from "next/og";
import { DISPLAY, OG_SIZE, OgBrand, OgFrame, ogOptions, smileyImg } from "@/components/og";
import { tall } from "@/lib/chart";
import { rapport } from "@/lib/server/rapport";
import { andel, prosent } from "@/lib/stats";

export const alt = "Smilefjes-rapporten: månedens smilefjestilsyn";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function RapportOgImage({ params }: { params: Promise<{ ym: string }> }) {
  const { ym } = await params;
  const r = rapport(ym);
  const navn = r ? r.navn.charAt(0).toUpperCase() + r.navn.slice(1) : "Smilefjes-rapporten";

  return new ImageResponse(
    (
      <OgFrame kind="smil">
        <div style={{ display: "flex", transform: "rotate(-6deg)" }}>{smileyImg("smil", 260)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: 30, fontFamily: DISPLAY, opacity: 0.7 }}>Smilefjes-rapporten</div>
          <div style={{ display: "flex", fontSize: 76, fontFamily: DISPLAY, lineHeight: 1.05, letterSpacing: -1.5 }}>{navn}</div>
          {r && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", fontSize: 42, fontFamily: DISPLAY }}>
                {`${prosent(andel(r.ordinaer, "smil"))} smil ved ${tall(r.ordinaer.total)} tilsyn`}
              </div>
              <div style={{ display: "flex", fontSize: 30 }}>
                {`${tall(r.sur.length)} sur munn · ${tall(r.strek.length)} strekmunn · ${tall(r.comebacks.length)} comebacks`}
              </div>
            </div>
          )}
          <div style={{ display: "flex", marginTop: 12 }}>
            <OgBrand />
          </div>
        </div>
      </OgFrame>
    ),
    ogOptions(),
  );
}
