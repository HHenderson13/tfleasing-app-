import type { Metadata } from "next";
import "./funders.css";

export const metadata: Metadata = {
  title: "Funder Comparison — TrustFord Leasing",
};

export default function FundersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
