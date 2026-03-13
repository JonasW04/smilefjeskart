import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "Smilefjeskartet – Mattilsynets smilefjeskontroller på kart";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "24px",
            marginBottom: "40px",
            fontSize: "80px",
          }}
        >
          <span>😊</span>
          <span>😐</span>
          <span>☹️</span>
        </div>
        <h1
          style={{
            fontSize: "64px",
            fontWeight: 800,
            margin: 0,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          Smilefjeskartet
        </h1>
        <p
          style={{
            fontSize: "28px",
            opacity: 0.85,
            textAlign: "center",
            marginTop: "20px",
            maxWidth: "800px",
            lineHeight: 1.4,
          }}
        >
          Se Mattilsynets smilefjeskontroller for restauranter og spisesteder i
          Norge på et interaktivt kart
        </p>
        <div
          style={{
            display: "flex",
            marginTop: "40px",
            fontSize: "18px",
            opacity: 0.6,
          }}
        >
          smilefjeskartet.no
        </div>
      </div>
    ),
    { ...size },
  );
}
