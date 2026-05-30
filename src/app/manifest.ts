import type { MetadataRoute } from "next";

// Web App Manifest — scopes the PWA install to /world-cup so the leasing tool
// pages don't get an install prompt (nobody needs a home-screen app for the
// orders/proposals UI). Installing from /world-cup opens directly to the
// World Cup landing in standalone mode — feels like a native sweepstake app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrustFord World Cup",
    short_name: "WC Predictions",
    description: "Office World Cup prediction game — predict, track, win.",
    start_url: "/world-cup",
    scope: "/world-cup",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc", // slate-50 — matches the page background
    theme_color: "#10b981",      // emerald-500 — accents the live + tile branding
    categories: ["sports", "entertainment", "social"],
    icons: [
      // Next.js auto-merges app/icon.tsx + app/apple-icon.tsx so we don't
      // have to repeat them here. Leaving the array empty lets Next inject
      // the generated icons with the right sizes/MIME types.
    ],
  };
}
