import type { Metadata } from "next";

// Metadata ONLY. This deliberately contains no guard and must not gain one:
// /broker/login and /broker/setup/[token] live under this same segment and
// have to stay reachable by someone with no session. Guarding happens per
// page, via requireBrokerUser / requireBrokerTermsAccepted.
//
// It exists so the browser tab, bookmarks and any screenshot that includes
// the tab bar do not carry our name. The root layout titles the staff app;
// the broker portal is deliberately unbranded.
export const metadata: Metadata = {
  title: "Stock Portal",
  description: "Available vehicle stock.",
  robots: { index: false, follow: false },
};

export default function BrokerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
