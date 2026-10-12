// Pole Position fed from 10 at 10 (user, 2026-10-12): the Dealerweb files
// are uploaded once, to 10 at 10, and Pole Position's monthly figures are
// built from what 10 at 10 holds instead of from uploads of their own.
//
// Pure. These build exactly the per-exec rows Pole Position's own parsers
// produce from a whole file (lib/sales-leaderboard.ts), so attribution,
// re-processing and the upload diagnostics carry on untouched — 10 at 10 is
// simply the new producer of those rows:
//   • Enquiry log  → enquiries with an enquiry date in the month
//   • Order list   → orders with an order date in the month, less any we
//                    hold that were later cancelled (Dealerweb's own order
//                    list leaves those out too)
//   • Delivered list → lines whose delivery date is in the month — every
//                    line, delivered or due, as the delivered list counted
//
// History is kept: months before FEED_FROM_MONTH keep the figures their own
// uploads gave them and are never rewritten from here.

import { isSaleStatus, type DeliveredParseRow, type EnquiryParseRow, type LeaderboardReportType, type OrderListParseRow } from "./sales-leaderboard";

/**
 * The first month fed from 10 at 10 — the first it holds complete files
 * for. Every month before it is Pole Position's own history.
 */
export const FEED_FROM_MONTH = "2026-10";

export const isFedMonth = (yearMonth: string) => yearMonth >= FEED_FROM_MONTH;

export interface FeedEnquiryLine { exec: string; status: string | null; sourceRaw: string | null }
export interface FeedOrderLine { exec: string; orderedAt: number; vehicle: string | null }
export interface FeedDeliveryLine { exec: string; insuranceCount: number | null }

export function enquiryRowsFrom(lines: readonly FeedEnquiryLine[]): EnquiryParseRow[] {
  const byExec = new Map<string, EnquiryParseRow>();
  for (const l of lines) {
    const status = (l.status ?? "").trim();
    const source = (l.sourceRaw ?? "").trim();
    const r = byExec.get(l.exec) ?? { reportCode: l.exec, enquiryCount: 0, salesCount: 0, statusCounts: {}, sourceStatusCounts: {} };
    r.enquiryCount++;
    if (isSaleStatus(status)) r.salesCount++;
    r.statusCounts![status] = (r.statusCounts![status] ?? 0) + 1;
    const bySource = (r.sourceStatusCounts![source] ??= {});
    bySource[status] = (bySource[status] ?? 0) + 1;
    byExec.set(l.exec, r);
  }
  return [...byExec.values()];
}

/** Order Take per exec, and the vehicle on their most recent order for the scorecard. */
export function orderRowsFrom(lines: readonly FeedOrderLine[]): OrderListParseRow[] {
  const byExec = new Map<string, OrderListParseRow & { at: number }>();
  for (const l of lines) {
    const r = byExec.get(l.exec) ?? { reportCode: l.exec, orderCount: 0, latestVehicle: null, at: -Infinity };
    r.orderCount++;
    if (l.vehicle && l.orderedAt >= r.at) { r.latestVehicle = l.vehicle; r.at = l.orderedAt; }
    byExec.set(l.exec, r);
  }
  return [...byExec.values()].map((r) => ({ reportCode: r.reportCode, orderCount: r.orderCount, latestVehicle: r.latestVehicle }));
}

/**
 * Deliveries and Insurance per exec — or null while any line predates
 * 10 at 10 reading the insurance columns, so a month is never fed a zero
 * Insurance it didn't earn. Re-uploading that month's Dealbook – Deliveries
 * fills them in.
 */
export function deliveredRowsFrom(lines: readonly FeedDeliveryLine[]): DeliveredParseRow[] | null {
  if (lines.some((l) => l.insuranceCount == null)) return null;
  const byExec = new Map<string, DeliveredParseRow>();
  for (const l of lines) {
    const r = byExec.get(l.exec) ?? { reportCode: l.exec, deliveryCount: 0, insuranceCount: 0 };
    r.deliveryCount++;
    r.insuranceCount += l.insuranceCount as number;
    byExec.set(l.exec, r);
  }
  return [...byExec.values()];
}

/** A stable form of a slot's rows, to tell whether anything changed since it was last fed. */
export function rowsFingerprint(rows: readonly { reportCode: string }[]): string {
  const sortKeys = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
      : v;
  return JSON.stringify([...rows].sort((a, b) => a.reportCode.localeCompare(b.reportCode)).map(sortKeys));
}

export const FEED_REPORT_LABEL: Record<LeaderboardReportType, string> = {
  orders: "Order Take",
  delivered: "Deliveries & Insurance",
  enquiry: "Inbound Conversion",
};
