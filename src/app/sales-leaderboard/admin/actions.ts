"use server";

import { db } from "@/db";
import {
  salesExecs,
  salesLeaderboardNameMap,
  salesLeaderboardParticipants,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { del } from "@vercel/blob";
import {
  enquiryInbound,
  enquirySales,
  type DeliveredParseRow,
  type EnquiryParseRow,
  type LeaderboardReportType,
  type OrderListParseRow,
  type ResponseParseRow,
} from "@/lib/sales-leaderboard";
import {
  feedPolePositionFromTenAtTen,
  invalidateLeaderboard,
  reattributeAllStoredMonths,
  type ParsedRows,
} from "@/lib/sales-leaderboard-store";

type ReportType = LeaderboardReportType;
const REPORT_TYPES: ReportType[] = ["orders", "delivered", "enquiry", "response"];

// ─── Participants ──────────────────────────────────────────────────────────

const participantSchema = z.object({
  salesExecId: z.string().min(1),
  active: z.boolean(),
});

export async function setParticipantAction(input: { salesExecId: string; active: boolean }) {
  await requireAdmin();
  const parsed = participantSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const now = new Date();
  await db
    .insert(salesLeaderboardParticipants)
    .values({ salesExecId: parsed.data.salesExecId, active: parsed.data.active, addedAt: now })
    .onConflictDoUpdate({
      target: salesLeaderboardParticipants.salesExecId,
      set: { active: parsed.data.active },
    });
  // A new participant joining (or an old one being switched off) changes
  // attribution — re-process every month we have stored uploads for.
  await reattributeAllStoredMonths();
  invalidateLeaderboard();
  return { ok: true as const };
}

const photoSchema = z.object({
  salesExecId: z.string().min(1),
  photoUrl: z.string().url().nullable(),
});

export async function setPhotoUrlAction(input: { salesExecId: string; photoUrl: string | null }) {
  await requireAdmin();
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const [existing] = await db
    .select({ photoUrl: salesLeaderboardParticipants.photoUrl })
    .from(salesLeaderboardParticipants)
    .where(eq(salesLeaderboardParticipants.salesExecId, parsed.data.salesExecId))
    .limit(1);
  if (existing?.photoUrl && existing.photoUrl !== parsed.data.photoUrl) {
    try { await del(existing.photoUrl); } catch (e) { logError("sales-leaderboard/photo-del", e); }
  }
  const now = new Date();
  await db
    .insert(salesLeaderboardParticipants)
    .values({ salesExecId: parsed.data.salesExecId, photoUrl: parsed.data.photoUrl, active: true, addedAt: now })
    .onConflictDoUpdate({
      target: salesLeaderboardParticipants.salesExecId,
      set: { photoUrl: parsed.data.photoUrl },
    });
  invalidateLeaderboard();
  return { ok: true as const };
}

// ─── Name mapping ──────────────────────────────────────────────────────────

const mapSchema = z.object({
  reportCode: z.string().trim().min(1).max(40),
  salesExecId: z.string().min(1),
});

export async function setNameMappingAction(input: { reportCode: string; salesExecId: string }) {
  await requireAdmin();
  const parsed = mapSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db
    .insert(salesLeaderboardNameMap)
    .values({ reportCode: parsed.data.reportCode, salesExecId: parsed.data.salesExecId })
    .onConflictDoUpdate({
      target: salesLeaderboardNameMap.reportCode,
      set: { salesExecId: parsed.data.salesExecId },
    });
  // The map just changed — re-attribute every stored upload so the monthly
  // stats catch up to the new mapping. Without this, an upload that landed
  // before the map was set would stay zeroed out.
  await reattributeAllStoredMonths();
  invalidateLeaderboard();
  return { ok: true as const };
}

export async function removeNameMappingAction(reportCode: string) {
  await requireAdmin();
  if (!reportCode || typeof reportCode !== "string") return { ok: false as const, error: "Missing reportCode" };
  await db.delete(salesLeaderboardNameMap).where(eq(salesLeaderboardNameMap.reportCode, reportCode));
  await reattributeAllStoredMonths();
  invalidateLeaderboard();
  return { ok: true as const };
}

// ─── Re-process ────────────────────────────────────────────────────────────
//
// The files are uploaded to 10 at 10, which feeds the board as it goes
// (lib/sales-leaderboard-store.ts). Re-process pulls from 10 at 10 again,
// then re-applies every stored month — history included — through the
// current name map and participants.

export async function reattributeAction() {
  const me = await requireAdmin();
  let fed = 0;
  try {
    fed = (await feedPolePositionFromTenAtTen(me.id)).length;
  } catch (e) {
    logError("sales-leaderboard/feed", e);
  }
  const count = await reattributeAllStoredMonths();
  invalidateLeaderboard();
  return { ok: true as const, processed: count, fed };
}

// ─── Diagnostic ────────────────────────────────────────────────────────────
//
// Show the admin what the latest upload for a (yearMonth, reportType) slot
// is currently being attributed to. Surfaces three failure modes that look
// the same on the leaderboard ("zero data") but have very different fixes:
//   • Report code has no mapping at all  → add to Name map.
//   • Mapped to an exec who isn't a participant → tick them on.
//   • Mapped to a participant fine, but the report row had a zero value.

export interface UploadDetailRow {
  reportCode: string;
  // Whichever count is relevant to the report type. For orders this is
  // orderCount, for delivered it's deliveryCount, for enquiry it's
  // enquiryCount. We surface both raw count and secondary count for
  // delivered (insurance) and enquiry (sales).
  primary: number;
  secondary: number | null;
  attributedExecName: string | null; // null when there's no mapping
  attributedExecId: string | null;
  status: "attributed" | "unmapped" | "not_participant";
}

export interface UploadDetail {
  yearMonth: string;
  reportType: ReportType;
  uploadedAt: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  rows: UploadDetailRow[];
}

export async function loadUploadDetailAction(input: { yearMonth: string; reportType: ReportType }): Promise<{ ok: true; detail: UploadDetail } | { ok: false; error: string }> {
  await requireAdmin();
  const { yearMonth, reportType } = input;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return { ok: false, error: "Bad yearMonth" };
  if (!REPORT_TYPES.includes(reportType)) return { ok: false, error: "Bad reportType" };

  const slot = await db.all<{ id: number; uploaded_at: number; parsed_data: string | null }>(sql`
    SELECT id, uploaded_at, parsed_data
    FROM sales_leaderboard_uploads
    WHERE year_month = ${yearMonth} AND report_type = ${reportType}
    ORDER BY id DESC LIMIT 1
  `);
  if (slot.length === 0) return { ok: false, error: "No upload for that month yet" };
  const top = slot[0];
  if (!top.parsed_data) return { ok: false, error: "This upload predates self-healing — re-upload once to enable diagnostics" };

  const parsedRows = JSON.parse(top.parsed_data) as ParsedRows;
  const [mapRows, participantRows, execRows] = await Promise.all([
    db.select().from(salesLeaderboardNameMap),
    db.select().from(salesLeaderboardParticipants),
    db.select().from(salesExecs),
  ]);
  const codeToExec = new Map(mapRows.map((m) => [m.reportCode, m.salesExecId]));
  const activeIds = new Set(participantRows.filter((p) => p.active).map((p) => p.salesExecId));
  const execNameById = new Map(execRows.map((e) => [e.id, e.name]));

  // Enquiry logs show the inbound (MotorComplete) figures, which are what
  // reach the board. An upload parsed before sources were read can only
  // show the all-source counts, labelled as such.
  const hasSources = reportType === "enquiry" && (parsedRows as EnquiryParseRow[]).every((r) => r.sourceStatusCounts);
  const labels = reportType === "orders"
    ? { primary: "Orders", secondary: null }
    : reportType === "delivered"
      ? { primary: "Deliveries", secondary: "Insurance" }
      : reportType === "response"
        ? { primary: "Leads contacted", secondary: "Avg first contact (mins)" }
      : hasSources
        ? { primary: "Inbound enquiries", secondary: "Inbound sales" }
        : { primary: "All enquiries (re-upload for inbound)", secondary: "All sales" };

  const rows: UploadDetailRow[] = parsedRows.map((r) => {
    let primary = 0;
    let secondary: number | null = null;
    if (reportType === "orders") {
      primary = (r as OrderListParseRow).orderCount;
    } else if (reportType === "delivered") {
      primary = (r as DeliveredParseRow).deliveryCount;
      secondary = (r as DeliveredParseRow).insuranceCount;
    } else if (reportType === "response") {
      const x = r as ResponseParseRow;
      primary = x.contactCount;
      secondary = x.contactCount ? Math.round(x.contactMinutes / x.contactCount) : null;
    } else {
      const inbound = enquiryInbound(r as EnquiryParseRow);
      primary = inbound ? inbound.enquiries : (r as EnquiryParseRow).enquiryCount;
      secondary = inbound ? inbound.sales : enquirySales(r as EnquiryParseRow);
    }
    const execId = codeToExec.get(r.reportCode) ?? null;
    let status: UploadDetailRow["status"];
    if (!execId) status = "unmapped";
    else if (!activeIds.has(execId)) status = "not_participant";
    else status = "attributed";
    return {
      reportCode: r.reportCode,
      primary,
      secondary,
      attributedExecId: execId,
      attributedExecName: execId ? execNameById.get(execId) ?? null : null,
      status,
    };
  });
  rows.sort((a, b) => b.primary - a.primary);

  return {
    ok: true,
    detail: {
      yearMonth,
      reportType,
      uploadedAt: new Date(Number(top.uploaded_at) * 1000).toISOString(),
      primaryLabel: labels.primary,
      secondaryLabel: labels.secondary,
      rows,
    },
  };
}

// ─── Admin context loader ──────────────────────────────────────────────────

export async function loadAdminContext() {
  await requireAdmin();
  const [execs, participantsRows, mapRows, lastUploads] = await Promise.all([
    db.select().from(salesExecs).orderBy(salesExecs.name),
    db.select().from(salesLeaderboardParticipants),
    db.select().from(salesLeaderboardNameMap),
    // The latest upload per (month, report) — the one the board shows.
    db.all<{ year_month: string; report_type: string; uploaded_at: number; row_count: number; has_parsed: number; has_sources: number; source: string | null }>(sql`
      SELECT u.year_month, u.report_type, u.uploaded_at, u.row_count, u.source,
             CASE WHEN u.parsed_data IS NOT NULL THEN 1 ELSE 0 END AS has_parsed,
             CASE WHEN u.parsed_data LIKE '%"sourceStatusCounts"%' THEN 1 ELSE 0 END AS has_sources
      FROM sales_leaderboard_uploads u
      WHERE u.id IN (SELECT MAX(id) FROM sales_leaderboard_uploads GROUP BY year_month, report_type)
      ORDER BY u.year_month DESC, u.report_type ASC
    `),
  ]);
  const participantByExec = new Map(participantsRows.map((p) => [p.salesExecId, p]));
  return {
    execs: execs.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      isParticipant: participantByExec.has(e.id),
      active: participantByExec.get(e.id)?.active ?? false,
      photoUrl: participantByExec.get(e.id)?.photoUrl ?? null,
    })),
    nameMap: mapRows.map((m) => ({ reportCode: m.reportCode, salesExecId: m.salesExecId })),
    lastUploads: lastUploads.map((u) => ({
      yearMonth: u.year_month,
      reportType: u.report_type,
      uploadedAt: new Date(Number(u.uploaded_at) * 1000).toISOString(),
      rowCount: Number(u.row_count),
      hasParsedData: Number(u.has_parsed) === 1,
      // Enquiry logs only: false means the month has no Inbound Conversion
      // until the log is uploaded again.
      hasSourceData: Number(u.has_sources) === 1,
      // 'ten-at-ten' once 10 at 10 feeds the month; 'upload' for history.
      source: u.source === "ten-at-ten" ? "ten-at-ten" as const : "upload" as const,
    })),
  };
}
