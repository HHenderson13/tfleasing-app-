import "server-only";

// Pole Position's stored figures: attribution of each month's report rows to
// execs, re-processing, and the feed from 10 at 10. Shared by the Pole
// Position admin actions and the 10 at 10 upload, which now drives the board.

import { eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/db";
import { salesLeaderboardMonthly, salesLeaderboardNameMap, salesLeaderboardParticipants, salesLeaderboardUploads } from "@/db/schema";
import { reportingHorizonFromInstant } from "./business-hours";
import { loadEnquiries, loadLatestEnquiryUploadAt } from "./enquiries";
import { partitionByReportability } from "./enquiry-reporting";
import { logError } from "./logger";
import {
  FEED_FROM_MONTH, deliveredRowsFrom, enquiryRowsFrom, orderRowsFrom, responseRowsFrom, rowsFingerprint,
} from "./pole-position-feed";
import {
  attributeReportRows,
  type DeliveredParseRow,
  type EnquiryParseRow,
  type LeaderboardReportType,
  type OrderListParseRow,
  type ResponseParseRow,
} from "./sales-leaderboard";
import { LEADERBOARD_CACHE_TAG } from "./sales-leaderboard-data";
import { creditOrders } from "./ten-at-ten-cancellations";
import { loadCancellationsReport, loadExecNames } from "./ten-at-ten-store";

export type ParsedRows = OrderListParseRow[] | DeliveredParseRow[] | EnquiryParseRow[] | ResponseParseRow[];
const REPORT_TYPES: LeaderboardReportType[] = ["orders", "delivered", "enquiry", "response"];

/**
 * Every change to the board's data busts the cross-request cache tag and the
 * page caches. Call from a server action — updateTag gives that request
 * read-your-own-writes.
 */
export function invalidateLeaderboard() {
  updateTag(LEADERBOARD_CACHE_TAG);
  revalidatePath("/sales-leaderboard");
  revalidatePath("/sales-leaderboard/admin");
  revalidatePath("/sales-leaderboard/me");
}

export interface AttributionResult { matched: number; unmapped: { reportCode: string; count: number }[] }

/**
 * Apply one (month, report) slot's rows to the monthly stats using the
 * current name map and participants. The single path every figure on the
 * board comes through.
 */
export async function attributeUpload(yearMonth: string, reportType: LeaderboardReportType, rows: ParsedRows, now: Date): Promise<AttributionResult> {
  const [mapRows, participants] = await Promise.all([
    db.select().from(salesLeaderboardNameMap),
    db.select({ salesExecId: salesLeaderboardParticipants.salesExecId }).from(salesLeaderboardParticipants).where(eq(salesLeaderboardParticipants.active, true)),
  ]);
  const codeToExec = new Map(mapRows.map((m) => [m.reportCode, m.salesExecId]));
  const participantIds = new Set(participants.map((p) => p.salesExecId));

  const { byExec, matched, unmapped } = attributeReportRows(reportType, rows, codeToExec, participantIds);

  const writes: Promise<void>[] = [];
  for (const [execId, vals] of byExec) {
    const setFields: Record<string, unknown> = {};
    if (reportType === "orders") {
      setFields.orderCount = vals.orderCount;
      setFields.latestVehicle = vals.latestVehicle;
      setFields.ordersUpdatedAt = now;
    } else if (reportType === "delivered") {
      setFields.deliveryCount = vals.deliveryCount;
      setFields.insuranceCount = vals.insuranceCount;
      setFields.deliveriesUpdatedAt = now;
    } else if (reportType === "response") {
      setFields.responseCount = vals.responseCount;
      setFields.responseMinutes = vals.responseMinutes;
      setFields.responseOnTarget = vals.responseOnTarget;
      setFields.responsesUpdatedAt = now;
    } else {
      setFields.enquiryCount = vals.enquiryCount;
      setFields.salesCount = vals.salesCount;
      // Written every time, NULL included, so a re-processed old upload
      // clears an inbound figure rather than leaving a stale one behind.
      setFields.inboundEnquiryCount = vals.inboundEnquiryCount;
      setFields.inboundSalesCount = vals.inboundSalesCount;
      setFields.enquiriesUpdatedAt = now;
    }
    writes.push(
      db.insert(salesLeaderboardMonthly)
        .values({ yearMonth, salesExecId: execId, ...setFields })
        .onConflictDoUpdate({ target: [salesLeaderboardMonthly.yearMonth, salesLeaderboardMonthly.salesExecId], set: setFields })
        .then(() => undefined),
    );
  }
  await Promise.all(writes);
  return { matched, unmapped };
}

/**
 * Re-apply the latest stored rows of every (month, report) slot — Pole
 * Position's own uploads for history, 10 at 10's for fed months. Run when
 * the name map or participants change.
 */
export async function reattributeAllStoredMonths(): Promise<number> {
  let processed = 0;
  const now = new Date();
  for (const reportType of REPORT_TYPES) {
    const slots = await db.all<{ year_month: string; id: number; parsed_data: string | null }>(sql`
      SELECT year_month, id, parsed_data
      FROM sales_leaderboard_uploads
      WHERE report_type = ${reportType}
        AND id IN (SELECT MAX(id) FROM sales_leaderboard_uploads WHERE report_type = ${reportType} GROUP BY year_month)
    `);
    for (const slot of slots) {
      if (!slot.parsed_data) continue; // pre-self-healing upload
      try {
        await attributeUpload(slot.year_month, reportType, JSON.parse(slot.parsed_data) as ParsedRows, now);
        processed++;
      } catch (e) {
        logError("sales-leaderboard/reattribute", e, { reportType, yearMonth: slot.year_month });
      }
    }
  }
  return processed;
}

// ─── Fed from 10 at 10 ─────────────────────────────────────────────────────

export interface FedSlot { yearMonth: string; reportType: LeaderboardReportType }

/**
 * Rebuild Pole Position's fed months from 10 at 10. For each month from
 * FEED_FROM_MONTH that 10 at 10 holds a report for, the rows are rebuilt;
 * where they differ from the slot's latest stored rows they're stored as a
 * new upload (source 'ten-at-ten') and attributed. A slot 10 at 10 holds
 * nothing for keeps whatever it had, so a report not yet uploaded to 10 at
 * 10 never zeroes the board. Returns the slots that changed.
 */
export async function feedPolePositionFromTenAtTen(userId: string): Promise<FedSlot[]> {
  const from = `${FEED_FROM_MONTH}-01`;
  const months = async (table: "ten_at_ten_enquiries" | "ten_at_ten_orders" | "ten_at_ten_deliveries", col: "enquiry_day" | "order_day" | "delivery_day") =>
    (await db.all<{ m: string }>(sql`SELECT DISTINCT substr(${sql.raw(col)}, 1, 7) AS m FROM ${sql.raw(table)} WHERE ${sql.raw(col)} >= ${from} ORDER BY m`)).map((r) => r.m);
  const [enquiryMonths, orderMonths, deliveryMonths, responseLines, latestResponseUpload] = await Promise.all([
    months("ten_at_ten_enquiries", "enquiry_day"),
    months("ten_at_ten_orders", "order_day"),
    months("ten_at_ten_deliveries", "delivery_day"),
    loadEnquiries({ from }),
    loadLatestEnquiryUploadAt(),
  ]);
  // Response Time judges only what Response times judges: leads that have
  // had a full working day, measured from the latest MotorComplete upload.
  const horizon = latestResponseUpload == null ? null : reportingHorizonFromInstant(latestResponseUpload);
  const judged = horizon == null ? [] : partitionByReportability(responseLines, horizon).reportable;
  const responseMonths = [...new Set(judged.map((r) => r.enquiryDay.slice(0, 7)))].sort();
  if (enquiryMonths.length + orderMonths.length + deliveryMonths.length + responseMonths.length === 0) return [];

  // Order Take is 10 at 10's Orders: what Dealerweb's latest order list
  // carries (held orders later cancelled, and old copies, left out), with a
  // Re-Write credited to the month of the original order, never the month
  // it was keyed again (creditOrders). A re-order only moves earlier,
  // so one credited before FEED_FROM_MONTH leaves the fed months altogether.
  let credited: { id: string; orderDay: string; exec: string; ordered_at: number; vehicle_raw: string | null }[] = [];
  if (orderMonths.length) {
    const [{ leftOutIds, rewriteOrderDays }, held] = await Promise.all([
      loadExecNames().then(loadCancellationsReport),
      db.all<{ id: string; order_day: string; exec: string; ordered_at: number; vehicle_raw: string | null }>(
        sql`SELECT id, order_day, exec, ordered_at, vehicle_raw FROM ten_at_ten_orders WHERE order_day >= ${from}`,
      ),
    ]);
    credited = creditOrders(held.map((l) => ({ ...l, orderDay: l.order_day })), leftOutIds, rewriteOrderDays).lines;
  }

  const slots: { yearMonth: string; reportType: LeaderboardReportType; rows: ParsedRows | null; lines: number }[] = [];
  for (const m of enquiryMonths) {
    const lines = await db.all<{ exec: string; status: string | null; source_raw: string | null }>(
      sql`SELECT exec, status, source_raw FROM ten_at_ten_enquiries WHERE substr(enquiry_day, 1, 7) = ${m}`,
    );
    slots.push({ yearMonth: m, reportType: "enquiry", lines: lines.length, rows: enquiryRowsFrom(lines.map((l) => ({ exec: l.exec, status: l.status, sourceRaw: l.source_raw }))) });
  }
  for (const m of orderMonths) {
    const lines = credited.filter((l) => l.orderDay.startsWith(m));
    slots.push({ yearMonth: m, reportType: "orders", lines: lines.length, rows: orderRowsFrom(lines.map((l) => ({ exec: l.exec, orderedAt: Number(l.ordered_at), vehicle: l.vehicle_raw }))) });
  }
  for (const m of deliveryMonths) {
    const lines = await db.all<{ exec: string; insurance_count: number | null }>(
      sql`SELECT exec, insurance_count FROM ten_at_ten_deliveries WHERE substr(delivery_day, 1, 7) = ${m}`,
    );
    slots.push({ yearMonth: m, reportType: "delivered", lines: lines.length, rows: deliveredRowsFrom(lines.map((l) => ({ exec: l.exec, insuranceCount: l.insurance_count == null ? null : Number(l.insurance_count) }))) });
  }

  for (const m of responseMonths) {
    const lines = judged.filter((r) => r.enquiryDay.startsWith(m));
    slots.push({ yearMonth: m, reportType: "response", lines: lines.length, rows: responseRowsFrom(lines.map((r) => ({ salesExec: r.salesExec, contactMins: r.contactMins }))) });
  }

  const changed: FedSlot[] = [];
  const now = new Date();
  for (const slot of slots) {
    if (!slot.rows) continue; // deliveries lines without insurance yet — leave the slot as it is
    const [latest] = await db.all<{ parsed_data: string | null; source: string | null }>(sql`
      SELECT parsed_data, source FROM sales_leaderboard_uploads
      WHERE year_month = ${slot.yearMonth} AND report_type = ${slot.reportType}
      ORDER BY id DESC LIMIT 1
    `);
    const fingerprint = rowsFingerprint(slot.rows);
    if (latest?.source === "ten-at-ten" && latest.parsed_data && rowsFingerprint(JSON.parse(latest.parsed_data)) === fingerprint) continue;
    await db.insert(salesLeaderboardUploads).values({
      yearMonth: slot.yearMonth,
      reportType: slot.reportType,
      rowCount: slot.lines,
      uploadedAt: now,
      uploadedByUserId: userId,
      parsedData: JSON.stringify(slot.rows),
      source: "ten-at-ten",
    });
    await attributeUpload(slot.yearMonth, slot.reportType, slot.rows, now);
    changed.push({ yearMonth: slot.yearMonth, reportType: slot.reportType });
  }
  return changed;
}
