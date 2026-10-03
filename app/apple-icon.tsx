import { ImageResponse } from "next/og";
import { smileyImg } from "@/components/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#fff8ec" }}>
        {smileyImg("smil", 150)}
      </div>
    ),
    size,
  );
}
