"use server";

import { db } from "@/db";
import {
  salesExecs,
  salesLeaderboardMonthly,
  salesLeaderboardNameMap,
  salesLeaderboardParticipants,
  salesLeaderboardUploads,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { LEADERBOARD_CACHE_TAG } from "@/lib/sales-leaderboard-data";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { del } from "@vercel/blob";
import {
  parseDeliveredList,
  parseEnquiryLog,
  parseOrderList,
  type DeliveredParseRow,
  type EnquiryParseRow,
  type OrderListParseRow,
} from "@/lib/sales-leaderboard";

type ReportType = "orders" | "delivered" | "enquiry";
const REPORT_TYPES: ReportType[] = ["orders", "delivered", "enquiry"];

// Single helper — every admin mutation invalidates both the cross-request
// cache tag (so loadMonthSnapshot/Ytd/Archive/Dashboard rebuild on the next
// read) and the per-path render caches.
function invalidateLeaderboard() {
  // Next 16's updateTag is the server-action-friendly cache-bust — it
  // signals read-your-own-writes so the next read on the same request
  // sees fresh data, not the previous cached value.
  updateTag(LEADERBOARD_CACHE_TAG);
  revalidatePath("/sales-leaderboard");
  revalidatePath("/sales-leaderboard/admin");
  revalidatePath("/sales-leaderboard/me");
}

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

// ─── Report uploads ────────────────────────────────────────────────────────

const uploadSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  reportType: z.enum(["orders", "delivered", "enquiry"]),
});

export interface UploadResult {
  ok: boolean;
  error?: string;
  reportType?: string;
  yearMonth?: string;
  parsed?: { rowsTotal: number; rowsAttributed: number };
  matched?: number;
  unmapped?: { reportCode: string; count: number }[];
}

export async function uploadReportAction(formData: FormData): Promise<UploadResult> {
  const me = await requireAdmin();
  try {
    const file = formData.get("file") as File | null;
    const yearMonth = String(formData.get("yearMonth") ?? "");
    const reportType = String(formData.get("reportType") ?? "");
    const parsed = uploadSchema.safeParse({ yearMonth, reportType });
    if (!file) return { ok: false, error: "No file uploaded" };
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File over 10 MB" };

    const buffer = await file.arrayBuffer();
    const now = new Date();

    // Parse the XLSX into per-report-code aggregates. We persist these as
    // JSON so a later change to the name map / participants can re-attribute
    // without the admin re-uploading. See `attributeUpload` below.
    const parsedRows = runParse(parsed.data.reportType, buffer);
    const rowsTotal = parsedRows.rowsTotal;

    await db.insert(salesLeaderboardUploads).values({
      yearMonth: parsed.data.yearMonth,
      reportType: parsed.data.reportType,
      rowCount: rowsTotal,
      uploadedAt: now,
      uploadedByUserId: me.id,
      parsedData: JSON.stringify(parsedRows.rows),
    });

    const attribution = await attributeUpload(parsed.data.yearMonth, parsed.data.reportType, parsedRows.rows, now);

  invalidateLeaderboard();

    return {
      ok: true,
      reportType: parsed.data.reportType,
      yearMonth: parsed.data.yearMonth,
      parsed: { rowsTotal, rowsAttributed: parsedRows.rowsAttributed },
      matched: attribution.matched,
      unmapped: attribution.unmapped,
    };
  } catch (e) {
    logError("sales-leaderboard/upload", e);
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

// Manually trigger a re-attribute (exposed for the "Re-process" button on
// the Uploads tab — useful when the admin's just done a bunch of mapping
// changes and wants to confirm the numbers look right).
export async function reattributeAction() {
  await requireAdmin();
  const count = await reattributeAllStoredMonths();
  invalidateLeaderboard();
  return { ok: true as const, processed: count };
}

// ─── Attribution core ──────────────────────────────────────────────────────
//
// Single source of truth for "given parsed report rows for a (yearMonth,
// reportType) slot, apply them to the monthly stats table using the
// current name map + participants". Used by uploads and by re-attribute.

type ParsedRows = OrderListParseRow[] | DeliveredParseRow[] | EnquiryParseRow[];

function runParse(reportType: ReportType, buffer: ArrayBuffer): { rows: ParsedRows; rowsTotal: number; rowsAttributed: number } {
  if (reportType === "orders") {
    const out = parseOrderList(buffer);
    return { rows: out.rows, rowsTotal: out.summary.rowsTotal, rowsAttributed: out.summary.rowsAttributed };
  }
  if (reportType === "delivered") {
    const out = parseDeliveredList(buffer);
    return { rows: out.rows, rowsTotal: out.summary.rowsTotal, rowsAttributed: out.summary.rowsAttributed };
  }
  const out = parseEnquiryLog(buffer);
  return { rows: out.rows, rowsTotal: out.summary.rowsTotal, rowsAttributed: out.summary.rowsAttributed };
}

interface AttributionResult { matched: number; unmapped: { reportCode: string; count: number }[] }

async function attributeUpload(
  yearMonth: string,
  reportType: ReportType,
  rows: ParsedRows,
  now: Date,
): Promise<AttributionResult> {
  const [mapRows, participants] = await Promise.all([
    db.select().from(salesLeaderboardNameMap),
    db
      .select({ salesExecId: salesLeaderboardParticipants.salesExecId })
      .from(salesLeaderboardParticipants)
      .where(eq(salesLeaderboardParticipants.active, true)),
  ]);
  const codeToExec = new Map(mapRows.map((m) => [m.reportCode, m.salesExecId]));
  const participantIds = new Set(participants.map((p) => p.salesExecId));

  const unmappedCounts = new Map<string, number>();
  const targets = new Map<string, { o?: number; lv?: string | null; d?: number; ic?: number; e?: number; s?: number }>();
  let matched = 0;

  for (const r of rows) {
    const execId = codeToExec.get(r.reportCode);
    if (!execId) {
      unmappedCounts.set(r.reportCode, (unmappedCounts.get(r.reportCode) ?? 0) + 1);
      continue;
    }
    if (!participantIds.has(execId)) continue;
    if (reportType === "orders") {
      const o = r as OrderListParseRow;
      targets.set(execId, { o: o.orderCount, lv: o.latestVehicle });
    } else if (reportType === "delivered") {
      const d = r as DeliveredParseRow;
      targets.set(execId, { d: d.deliveryCount, ic: d.insuranceCount });
    } else {
      const e = r as EnquiryParseRow;
      targets.set(execId, { e: e.enquiryCount, s: e.salesCount });
    }
    matched++;
  }

  // Zero-fill participants who weren't in the report so dropping someone
  // off resets their count to 0 instead of leaving yesterday's number stuck.
  for (const id of participantIds) {
    if (targets.has(id)) continue;
    if (reportType === "orders")    targets.set(id, { o: 0, lv: null });
    if (reportType === "delivered") targets.set(id, { d: 0, ic: 0 });
    if (reportType === "enquiry")   targets.set(id, { e: 0, s: 0 });
  }

  const writes: Promise<void>[] = [];
  for (const [execId, vals] of targets) {
    const setFields: Record<string, unknown> = {};
    if (reportType === "orders") {
      setFields.orderCount = vals.o ?? 0;
      setFields.latestVehicle = vals.lv ?? null;
      setFields.ordersUpdatedAt = now;
    } else if (reportType === "delivered") {
      setFields.deliveryCount = vals.d ?? 0;
      setFields.insuranceCount = vals.ic ?? 0;
      setFields.deliveriesUpdatedAt = now;
    } else {
      setFields.enquiryCount = vals.e ?? 0;
      setFields.salesCount = vals.s ?? 0;
      setFields.enquiriesUpdatedAt = now;
    }
    writes.push(
      db
        .insert(salesLeaderboardMonthly)
        .values({ yearMonth, salesExecId: execId, ...setFields })
        .onConflictDoUpdate({
          target: [salesLeaderboardMonthly.yearMonth, salesLeaderboardMonthly.salesExecId],
          set: setFields,
        })
        .then(() => undefined),
    );
  }
  await Promise.all(writes);

  return {
    matched,
    unmapped: Array.from(unmappedCounts.entries())
      .map(([reportCode, count]) => ({ reportCode, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// Walk every (yearMonth, reportType) slot we have parsed data for, take the
// most recent upload per slot, and re-apply the attribution. Cheap — at most
// 12 months × 3 reports = 36 slots per year, and each slot writes ≤ a dozen
// rows.
async function reattributeAllStoredMonths(): Promise<number> {
  let processed = 0;
  const now = new Date();
  for (const reportType of REPORT_TYPES) {
    const slots = await db.all<{ year_month: string; id: number; parsed_data: string | null }>(sql`
      SELECT year_month, id, parsed_data
      FROM sales_leaderboard_uploads
      WHERE report_type = ${reportType}
        AND id IN (
          SELECT MAX(id) FROM sales_leaderboard_uploads
          WHERE report_type = ${reportType}
          GROUP BY year_month
        )
    `);
    for (const slot of slots) {
      if (!slot.parsed_data) continue; // Pre-self-healing upload — admin needs to re-upload that one
      try {
        const rows = JSON.parse(slot.parsed_data) as ParsedRows;
        await attributeUpload(slot.year_month, reportType, rows, now);
        processed++;
      } catch (e) {
        logError("sales-leaderboard/reattribute", e, { reportType, yearMonth: slot.year_month });
      }
    }
  }
  return processed;
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
    ORDER BY uploaded_at DESC LIMIT 1
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

  const labels = reportType === "orders"
    ? { primary: "Orders", secondary: null }
    : reportType === "delivered"
      ? { primary: "Deliveries", secondary: "Insurance" }
      : { primary: "Enquiries", secondary: "Sales" };

  const rows: UploadDetailRow[] = parsedRows.map((r) => {
    let primary = 0;
    let secondary: number | null = null;
    if (reportType === "orders") {
      primary = (r as OrderListParseRow).orderCount;
    } else if (reportType === "delivered") {
      primary = (r as DeliveredParseRow).deliveryCount;
      secondary = (r as DeliveredParseRow).insuranceCount;
    } else {
      primary = (r as EnquiryParseRow).enquiryCount;
      secondary = (r as EnquiryParseRow).salesCount;
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
    db.all<{ year_month: string; report_type: string; uploaded_at: number; row_count: number; has_parsed: number }>(sql`
      SELECT year_month, report_type, MAX(uploaded_at) as uploaded_at,
             (SELECT row_count FROM sales_leaderboard_uploads u2
               WHERE u2.year_month = u.year_month AND u2.report_type = u.report_type
               ORDER BY u2.uploaded_at DESC LIMIT 1) as row_count,
             (SELECT CASE WHEN parsed_data IS NOT NULL THEN 1 ELSE 0 END
                FROM sales_leaderboard_uploads u3
                WHERE u3.year_month = u.year_month AND u3.report_type = u.report_type
                ORDER BY u3.uploaded_at DESC LIMIT 1) as has_parsed
      FROM sales_leaderboard_uploads u
      GROUP BY year_month, report_type
      ORDER BY year_month DESC, report_type ASC
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
    })),
  };
}
