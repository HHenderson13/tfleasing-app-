// Pole Position fed from 10 at 10 (user, 2026-10-12): the Dealerweb files
// are uploaded once, to 10 at 10, and Pole Position's monthly figures are
// built from what 10 at 10 holds instead of from uploads of their own.
//
// Pure. These build exactly the per-exec rows Pole Position's own parsers
// produce from a whole file (lib/sales-leaderboard.ts), so attribution,
// re-processing and the upload diagnostics carry on untouched — 10 at 10 is
// simply the new producer of those rows:
//   • Enquiry log  → enquiries with an enquiry date in the month, counted
//                    as 10 at 10's Enquiries counts them: a re-opened
//                    MotorComplete lead is inbound, once, in the month of
//                    its last re-open (feedEnquiryLines)
//   • Order list   → orders with an order date in the month, less any we
//                    hold that were later cancelled (Dealerweb's own order
//                    list leaves those out too), and a Re-Write counted in
//                    the month of the original order, not the re-order's
//   • Delivered list → lines whose delivery date is in the month — every
//                    line, delivered or due, as the delivered list counted
//   • Response Time → the MotorComplete leads 10 at 10 has judged (a full
//                    working day gone), by the month they came in: each
//                    exec's working minutes from the lead reaching them to
//                    first contact. Execs are named in full there, so the
//                    code is derived the Dealerweb way (execCodeFromName)
//                    and the name map does the rest
//
// The whole of 2026 is fed from here (user, 2026-11-06: "the new more
// accurate numbers driving Pole Position, now and historic"), once 10 at 10
// held every file for it. Months before FEED_FROM_MONTH keep the figures
// their own uploads gave them, and a month's report 10 at 10 doesn't hold
// keeps its own figures until it is uploaded there. Response Time
// alone starts later, at RESPONSE_FROM_MONTH, and is never back-filled.

import { CONTACT_TARGET_MINS } from "./business-hours";
import { reopenedLeads } from "./ten-at-ten";
import {
  execCodeFromName, isSaleStatus,
  type DeliveredParseRow, type EnquiryParseRow, type LeaderboardReportType, type OrderListParseRow, type ResponseParseRow,
} from "./sales-leaderboard";

/**
 * The first month fed from 10 at 10. It was October 2026, the first month
 * 10 at 10 held whole files for; the year was uploaded to 10 at 10 on
 * 6 Nov 2026 and the user asked for all of it to drive the board. Every
 * month before it is Pole Position's own history.
 */
export const FEED_FROM_MONTH = "2026-01";

/**
 * Response Time is fed from here on only, never back-filled (user,
 * 2026-11-06: "response time I won't be doing retrospective, but do pull
 * from 10 at 10 going forwards"). It was first scored in October 2026; the
 * Enquiry Tracker data held from August is not used to score earlier months.
 */
export const RESPONSE_FROM_MONTH = "2026-10";

export const isFedMonth = (yearMonth: string) => yearMonth >= FEED_FROM_MONTH;

export interface FeedEnquiryLine { exec: string; status: string | null; sourceRaw: string | null }
export interface FeedOrderLine { exec: string; orderedAt: number; vehicle: string | null }
export interface FeedDeliveryLine { exec: string; insuranceCount: number | null }
/** One judged MotorComplete lead: who it reached, and the working minutes to their first contact (null if none yet). */
export interface FeedResponseLine { salesExec: string; contactMins: number | null }

/** One enquiry as 10 at 10 holds it, for feedEnquiryLines. */
export interface FeedEnquirySource {
  enquiredAt: number; enquiryDay: string; exec: string; customer: string;
  /** 10 at 10's source name (TF Lead, Leasing.com...). */
  source: string;
  /** Column E as uploaded. */
  sourceRaw: string | null;
  status: string | null; outcome: string;
}

/**
 * The enquiry lines for Inbound Conversion, by month, counted exactly as
 * 10 at 10's Enquiries counts them (user, 2026-11-06). A lost MotorComplete
 * lead re-opened under another source counts once, as its last re-open, in
 * that month, under the lead's own column E so it reads as inbound; the lead
 * itself and any re-open replaced by a later one are left out. Pass every
 * enquiry held, not one month's: a lead and its re-open can sit in
 * different months.
 */
export function feedEnquiryLines(rows: readonly FeedEnquirySource[]): Map<string, FeedEnquiryLine[]> {
  const { dropped, leadOf } = reopenedLeads(rows);
  const byMonth = new Map<string, FeedEnquiryLine[]>();
  rows.forEach((r, i) => {
    if (dropped.has(i)) return;
    const lead = leadOf.get(i);
    const line = { exec: r.exec, status: r.status, sourceRaw: lead == null ? r.sourceRaw : rows[lead].sourceRaw };
    const m = r.enquiryDay.slice(0, 7);
    const list = byMonth.get(m);
    if (list) list.push(line); else byMonth.set(m, [line]);
  });
  return byMonth;
}

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

/**
 * Response Time per exec: leads with a first-contact time, the minutes they
 * took, and how many were inside the target. A lead never contacted has no
 * time to average and is left to Response times' own "never contacted".
 */
export function responseRowsFrom(lines: readonly FeedResponseLine[]): ResponseParseRow[] {
  const byCode = new Map<string, ResponseParseRow>();
  for (const l of lines) {
    const name = l.salesExec.replace(/\s+/g, " ").trim();
    if (!name || l.contactMins == null) continue;
    const code = execCodeFromName(name) || name;
    const r = byCode.get(code) ?? { reportCode: code, name, contactCount: 0, contactMinutes: 0, onTarget: 0 };
    r.contactCount++;
    r.contactMinutes += l.contactMins;
    if (l.contactMins <= CONTACT_TARGET_MINS) r.onTarget++;
    byCode.set(code, r);
  }
  return [...byCode.values()];
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
  response: "Response Time",
};
