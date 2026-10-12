import type { MetadataRoute } from "next";

// Web App Manifest — scopes the PWA install to /ten-at-ten so the rest of
// the leasing tool doesn't get an install prompt (nobody needs a home-screen
// app for the orders/proposals UI). Installing from /ten-at-ten opens
// straight into 10 at 10 in standalone mode. It was /enquiries until the
// Enquiry Tracker moved into 10 at 10 (2026-10-12); /enquiries redirects.
//
// If /ten-at-ten ever moves, move start_url and scope with it or the
// install silently stops working.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrustFord 10 at 10",
    short_name: "10 at 10",
    description: "Enquiries, response times, orders and profit.",
    start_url: "/ten-at-ten",
    scope: "/ten-at-ten",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc", // slate-50 — matches the page background
    theme_color: "#0f172a",      // slate-900 — the app's interactive colour
    categories: ["business", "productivity"],
    icons: [
      // Next.js auto-merges app/icon.tsx + app/apple-icon.tsx so we don't
      // have to repeat them here. Leaving the array empty lets Next inject
      // the generated icons with the right sizes/MIME types.
    ],
  };
}
