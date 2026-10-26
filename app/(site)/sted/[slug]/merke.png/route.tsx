import { ImageResponse } from "next/og";
import { BG, DISPLAY, ogOptions, smileyImg } from "@/components/og";
import { getSted } from "@/lib/server/data";
import { SMILE_LABEL } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { formatDato, sisteTilsyn } from "@/lib/stats";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getSted(slug);
  if (!s) return new Response("Fant ikke stedet", { status: 404 });

  const siste = sisteTilsyn(s);
  const kind = kindFromKarakter(siste.karakter);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: BG[kind],
          border: "4px solid #1e1631",
          borderRadius: 24,
          color: "#1e1631",
          alignItems: "center",
          gap: 16,
          padding: "0 20px",
        }}
      >
        {smileyImg(kind, 72)}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <div style={{ display: "flex", fontSize: 17, opacity: 0.75 }}>Siste smilefjestilsyn</div>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: 34 }}>{kind === "ukjent" ? "Ukjent" : SMILE_LABEL[kind]}</div>
          <div style={{ display: "flex", fontSize: 17, gap: 6 }}>
            <span>{`${formatDato(siste.dato)} ·`}</span>
            <span style={{ display: "flex", fontFamily: DISPLAY }}>
              Smilefjes<span style={{ color: "#6b4eff" }}>kartet</span>
            </span>
          </div>
        </div>
      </div>
    ),
    { ...ogOptions(), width: 440, height: 112, headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
