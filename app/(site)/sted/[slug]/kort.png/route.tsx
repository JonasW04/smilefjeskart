import { ImageResponse } from "next/og";
import { BG, DISPLAY, OgBrand, ogOptions, smileyImg } from "@/components/og";
import { getSted } from "@/lib/server/data";
import { SMILE_LABEL } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, fordeling, formatDato, ordinaereKarakterer, prosent, sisteTilsyn } from "@/lib/stats";

const INK = "#1e1631";
const PAPER = "#fff8ec";
const KORT = { width: 1080, height: 1920 };
const ANTALL_I_TIDSLINJA = 8;

/** Delingskort i story-format (9:16) for Snapchat, Instagram og Messenger. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getSted(slug);
  if (!s) return new Response("Fant ikke stedet", { status: 404 });

  const siste = sisteTilsyn(s);
  const kind = kindFromKarakter(siste.karakter);
  const ord = fordeling(ordinaereKarakterer(s));
  const sted = [s.poststed, s.kommune !== s.poststed ? s.kommune : null].filter(Boolean).join(", ");
  const tidslinje = s.tilsyn.slice(-ANTALL_I_TIDSLINJA);
  const navnStorrelse = s.navn.length > 34 ? 72 : s.navn.length > 20 ? 92 : 116;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: PAPER, padding: "90px 64px 80px", color: INK, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "center", transform: "scale(1.6)", marginTop: 10, marginBottom: 60 }}>
          <OgBrand />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: BG[kind],
            border: `6px solid ${INK}`,
            borderRadius: 56,
            boxShadow: `16px 16px 0 ${INK}`,
            padding: "64px 56px",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", transform: "rotate(-6deg)" }}>{smileyImg(kind, 360)}</div>
          <div style={{ display: "flex", marginTop: 40, fontFamily: DISPLAY, fontSize: 96, letterSpacing: -2 }}>
            {kind === "ukjent" ? "Ukjent karakter" : `${SMILE_LABEL[kind]}!`}
          </div>
          <div style={{ display: "flex", fontSize: 40, opacity: 0.8 }}>{`Siste tilsyn ${formatDato(siste.dato)}`}</div>
          <div style={{ display: "flex", marginTop: 48, textAlign: "center", justifyContent: "center", fontFamily: DISPLAY, fontSize: navnStorrelse, lineHeight: 1.05, letterSpacing: -2 }}>
            {s.navn}
          </div>
          {sted && <div style={{ display: "flex", marginTop: 16, fontSize: 40, opacity: 0.75 }}>{sted}</div>}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", paddingTop: 40, width: "100%" }}>
            <div style={{ display: "flex", fontSize: 30, letterSpacing: 3, opacity: 0.7 }}>
              {tidslinje.length < s.tilsyn.length ? `SISTE ${tidslinje.length} AV ${s.tilsyn.length} TILSYN` : `ALLE ${s.tilsyn.length} TILSYN`}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18, marginTop: 24, background: "#ffffffb3", border: `4px solid ${INK}`, borderRadius: 32, padding: "28px 20px" }}>
              {tidslinje.map((t, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 172, opacity: t.oppfolging ? 0.6 : 1 }}>
                  {smileyImg(kindFromKarakter(t.karakter), 92)}
                  <div style={{ display: "flex", marginTop: 8, fontSize: 26 }}>{formatDato(t.dato)}</div>
                </div>
              ))}
            </div>
            {ord.total > 0 && (
              <div style={{ display: "flex", marginTop: 28, fontSize: 36 }}>{`${prosent(andel(ord, "smil"))} smil ved ${ord.total} ordinære tilsyn`}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 44, fontSize: 34, opacity: 0.75 }}>
          Mattilsynets tilsyn, på kart · smilefjeskartet.no
        </div>
      </div>
    ),
    { ...ogOptions(), ...KORT, headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
