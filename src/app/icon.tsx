import { ImageResponse } from "next/og";

// Generated PWA / favicon icon. Emerald background with a trophy glyph —
// matches the homepage tile + live-widget accent. Next.js auto-routes this at
// /icon and embeds it in the manifest under the right size + MIME type.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #10b981, #0d9488)",
          color: "white",
          fontSize: 120,
          fontWeight: 800,
          borderRadius: 32,
        }}
      >
        ⚽
      </div>
    ),
    { ...size },
  );
}
