import { ImageResponse } from "next/og";

// iOS home-screen icon — Apple's "Add to Home Screen" uses this exact size.
// iOS automatically rounds the corners so we don't apply borderRadius
// (otherwise we'd get a rounded icon inside a rounded mask).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 110,
          fontWeight: 800,
        }}
      >
        ⚽
      </div>
    ),
    { ...size },
  );
}
