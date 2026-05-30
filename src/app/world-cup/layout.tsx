import type { Metadata, Viewport } from "next";

// Section-scoped metadata for the World Cup pages. Adds the iOS-specific PWA
// meta tags so when someone uses Safari's "Add to Home Screen" from any
// /world-cup/* page, the resulting installed icon opens to the WC landing
// in standalone mode (no Safari chrome) and reads as "WC Predictions".
//
// Theme color sits here too so iOS / Android use the emerald accent rather
// than the default white system bar. Set at viewport level (Next 14+ rule
// — themeColor moved out of metadata).
export const metadata: Metadata = {
  title: {
    template: "%s · World Cup",
    default: "World Cup Predictions",
  },
  appleWebApp: {
    capable: true,
    title: "WC Predictions",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  // PWA usually wants `viewport-fit=cover` so the app uses the safe-area on
  // notched iPhones. Doesn't affect non-PWA browser visits.
  viewportFit: "cover",
};

export default function WorldCupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
