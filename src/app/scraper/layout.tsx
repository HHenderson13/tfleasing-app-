import type { Metadata } from "next";
import "./scraper.css";

export const metadata: Metadata = {
  title: "Market Analysis — TrustFord Leasing",
};

export default function ScraperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
