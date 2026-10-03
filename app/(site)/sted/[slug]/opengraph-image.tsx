import { ImageResponse } from "next/og";
import { DISPLAY, OG_SIZE, OgBrand, OgFrame, ogOptions, smileyImg } from "@/components/og";
import { getSted } from "@/lib/server/data";
import { SMILE_LABEL } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, fordeling, formatDato, ordinaereKarakterer, prosent, sisteTilsyn } from "@/lib/stats";

export const alt = "Smilefjes for serveringssted";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function StedOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getSted(slug);
  const siste = s ? sisteTilsyn(s) : null;
  const kind = siste ? kindFromKarakter(siste.karakter) : "ukjent";
  const ord = s ? fordeling(ordinaereKarakterer(s)) : null;

  return new ImageResponse(
    (
      <OgFrame kind={kind}>
        <div style={{ display: "flex", transform: "rotate(-6deg)" }}>{smileyImg(kind, 300)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: s && s.navn.length > 28 ? 54 : 70, fontFamily: DISPLAY, lineHeight: 1.05, letterSpacing: -1.5 }}>
            {s?.navn ?? "Ukjent sted"}
          </div>
          {s && <div style={{ display: "flex", fontSize: 32, opacity: 0.75 }}>{[s.poststed, s.kommune !== s.poststed ? s.kommune : null].filter(Boolean).join(", ")}</div>}
          {siste && kind !== "ukjent" && (
            <div style={{ display: "flex", fontSize: 38, fontFamily: DISPLAY }}>
              {SMILE_LABEL[kind]} {formatDato(siste.dato)}
            </div>
          )}
          {ord && ord.total > 0 && (
            <div style={{ display: "flex", fontSize: 30 }}>
              {`${prosent(andel(ord, "smil"))} smil ved ${ord.total} ordinære tilsyn`}
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
