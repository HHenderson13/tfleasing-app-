// Formatters, colours and small rules shared by the 10 at 10 page and its
// PDF export, so the two always show a figure the same way.

import type { MarketSegmentView } from "@/lib/market-overview";
import type { CancellationView } from "@/lib/ten-at-ten-report";

export const SOURCE_COLOURS: Record<string, string> = {
  "TF Lead": "#1d4ed8",
  "Leasing.com": "#0891b2",
  LeaseLoco: "#7c3aed",
  CarWow: "#ea580c",
  "Broker / Prospect": "#64748b",
};

export const SEGMENT_META: Record<string, { title: string; colour: string }> = {
  "ICE Car": { title: "ICE Cars", colour: "#b45309" },
  "BEV Car": { title: "BEV Cars", colour: "#047857" },
  Van: { title: "Vans", colour: "#1d4ed8" },
};

export const STATUS_COLOURS: Record<string, string> = { Delivered: "#047857", Arrived: "#0891b2", Due: "#94a3b8" };

export const MARKET_META: Record<string, { title: string; colour: string }> = {
  car: { title: "Cars", colour: "#334155" },
  van: { title: "Vans", colour: SEGMENT_META.Van.colour },
};

/** Budget colours: Car slate, CV the van blue, Combined indigo. */
export const DEPARTMENT_COLOURS = { car: "#334155", cv: SEGMENT_META.Van.colour, combined: "#312e81" } as const;

export const SALES_SUPPORT = "Sales Support · allocation";

export const pct = (n: number | null, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);
export const int = (n: number) => n.toLocaleString("en-GB");
const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
export const gbp = (n: number | null) => (n == null ? "—" : GBP.format(Math.round(n)).replace("-", "−"));
export const share = (n: number, of: number) => (of > 0 ? (n / of) * 100 : null);
export const firstName = (name: string) => name.split(" ")[0];

export const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

export const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).replace(",", "");

export const timeTone = (avg: number | null, target: number): "good" | "bad" | undefined =>
  avg == null ? undefined : avg <= target ? "good" : "bad";

export const isProper = (c: CancellationView) => c.status === "proper";
export const needsReason = (c: CancellationView) => isProper(c) && !c.note.trim();

export const scrapeWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");

/** "£9/mo dearer" — from our side, like the Trends tab. */
export function gapText(gap: number | null): string {
  if (gap == null) return "no rival priced";
  if (Math.abs(gap) < 0.5) return "level with the cheapest rival";
  return gap > 0 ? `£${Math.round(gap)}/mo dearer on average` : `£${Math.round(-gap)}/mo cheaper on average`;
}

/** Cars and vans together: deals compared, how often cheapest, gap weighted by deals. */
export function marketTotals(segments: MarketSegmentView[]) {
  let compared = 0, cheapest = 0, gapSum = 0, headlineCompared = 0, headlineLowest = 0;
  for (const s of segments) {
    compared += s.overall.compared;
    cheapest += s.overall.cheapest;
    gapSum += (s.overall.gap ?? 0) * s.overall.compared;
    headlineCompared += s.overall.headline.compared;
    headlineLowest += s.overall.headline.lowest;
  }
  return { compared, cheapest, gap: compared ? gapSum / compared : null, headlineCompared, headlineLowest };
}
