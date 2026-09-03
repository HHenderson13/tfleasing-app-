import type { MetadataRoute } from "next";

// Web App Manifest — scopes the PWA install to /enquiries so the rest of the
// leasing tool doesn't get an install prompt (nobody needs a home-screen app
// for the orders/proposals UI). Installing from /enquiries opens straight
// into the Enquiry Tracker in standalone mode, which is the one page anyone
// wants to glance at from a phone.
//
// If /enquiries ever moves, move start_url and scope with it or the install
// silently stops working.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrustFord Enquiry Tracker",
    short_name: "Enquiries",
    description: "Enquiry volumes and response times, by sales executive.",
    start_url: "/enquiries",
    scope: "/enquiries",
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
