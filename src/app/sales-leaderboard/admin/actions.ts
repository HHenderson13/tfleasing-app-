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
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { del } from "@vercel/blob";
import {
  parseDeliveredList,
  parseEnquiryLog,
  parseOrderList,
} from "@/lib/sales-leaderboard";

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
  revalidatePath("/sales-leaderboard/admin");
  revalidatePath("/sales-leaderboard");
  return { ok: true as const };
}

const photoSchema = z.object({
  salesExecId: z.string().min(1),
  // Vercel Blob URL or null to clear.
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
  // Clean up the previous blob if we're replacing or clearing. Swallow errors —
  // a stale blob is wasted storage, not a functional problem.
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
  revalidatePath("/sales-leaderboard/admin");
  revalidatePath("/sales-leaderboard");
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
  revalidatePath("/sales-leaderboard/admin");
  return { ok: true as const };
}

export async function removeNameMappingAction(reportCode: string) {
  await requireAdmin();
  if (!reportCode || typeof reportCode !== "string") return { ok: false as const, error: "Missing reportCode" };
  await db.delete(salesLeaderboardNameMap).where(eq(salesLeaderboardNameMap.reportCode, reportCode));
  revalidatePath("/sales-leaderboard/admin");
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

    // Resolve the name map once; report codes that aren't in the map can't
    // be attributed, so we collect them for the admin to fix.
    const mapRows = await db.select().from(salesLeaderboardNameMap);
    const codeToExec = new Map(mapRows.map((m) => [m.reportCode, m.salesExecId]));

    // Active participants — admin curates this list. Stats only flow for
    // these; the report may contain other execs from across the dealership.
    const participants = await db
      .select({ salesExecId: salesLeaderboardParticipants.salesExecId })
      .from(salesLeaderboardParticipants)
      .where(eq(salesLeaderboardParticipants.active, true));
    const participantIds = new Set(participants.map((p) => p.salesExecId));

    // Per-report parsing + monthly stat writes. For the metric we control,
    // we always REPLACE the value for that month (re-uploading overrides),
    // and we zero-fill participants who weren't in the report.
    const unmappedCounts = new Map<string, number>();
    function trackUnmapped(code: string) {
      unmappedCounts.set(code, (unmappedCounts.get(code) ?? 0) + 1);
    }

    let matched = 0;
    let summary = { rowsTotal: 0, rowsAttributed: 0 };
    const writes: Promise<void>[] = [];
    const targets = new Map<string, { o?: number; lv?: string | null; d?: number; ic?: number; e?: number; s?: number }>();

    if (parsed.data.reportType === "orders") {
      const out = parseOrderList(buffer);
      summary = out.summary;
      for (const r of out.rows) {
        const execId = codeToExec.get(r.reportCode);
        if (!execId) { trackUnmapped(r.reportCode); continue; }
        if (!participantIds.has(execId)) continue;
        targets.set(execId, { o: r.orderCount, lv: r.latestVehicle });
        matched++;
      }
    } else if (parsed.data.reportType === "delivered") {
      const out = parseDeliveredList(buffer);
      summary = out.summary;
      for (const r of out.rows) {
        const execId = codeToExec.get(r.reportCode);
        if (!execId) { trackUnmapped(r.reportCode); continue; }
        if (!participantIds.has(execId)) continue;
        targets.set(execId, { d: r.deliveryCount, ic: r.insuranceCount });
        matched++;
      }
    } else {
      const out = parseEnquiryLog(buffer);
      summary = out.summary;
      for (const r of out.rows) {
        const execId = codeToExec.get(r.reportCode);
        if (!execId) { trackUnmapped(r.reportCode); continue; }
        if (!participantIds.has(execId)) continue;
        targets.set(execId, { e: r.enquiryCount, s: r.salesCount });
        matched++;
      }
    }

    // Zero-fill participants absent from this report so a re-upload that
    // drops someone off the list resets their count to 0 (not "stuck on
    // yesterday's number").
    for (const id of participantIds) {
      if (targets.has(id)) continue;
      if (parsed.data.reportType === "orders")    targets.set(id, { o: 0, lv: null });
      if (parsed.data.reportType === "delivered") targets.set(id, { d: 0, ic: 0 });
      if (parsed.data.reportType === "enquiry")   targets.set(id, { e: 0, s: 0 });
    }

    for (const [execId, vals] of targets) {
      const setFields: Record<string, unknown> = {};
      if (parsed.data.reportType === "orders") {
        setFields.orderCount = vals.o ?? 0;
        setFields.latestVehicle = vals.lv ?? null;
        setFields.ordersUpdatedAt = now;
      } else if (parsed.data.reportType === "delivered") {
        setFields.deliveryCount = vals.d ?? 0;
        setFields.insuranceCount = vals.ic ?? 0;
        setFields.deliveriesUpdatedAt = now;
      } else {
        setFields.enquiryCount = vals.e ?? 0;
        setFields.salesCount = vals.s ?? 0;
        setFields.enquiriesUpdatedAt = now;
      }
      writes.push(
        db.insert(salesLeaderboardMonthly)
          .values({
            yearMonth: parsed.data.yearMonth,
            salesExecId: execId,
            ...setFields,
          })
          .onConflictDoUpdate({
            target: [salesLeaderboardMonthly.yearMonth, salesLeaderboardMonthly.salesExecId],
            set: setFields,
          })
          .then(() => undefined),
      );
    }
    await Promise.all(writes);

    await db.insert(salesLeaderboardUploads).values({
      yearMonth: parsed.data.yearMonth,
      reportType: parsed.data.reportType,
      rowCount: summary.rowsTotal,
      uploadedAt: now,
      uploadedByUserId: me.id,
    });

    revalidatePath("/sales-leaderboard");
    revalidatePath("/sales-leaderboard/admin");

    return {
      ok: true,
      reportType: parsed.data.reportType,
      yearMonth: parsed.data.yearMonth,
      parsed: summary,
      matched,
      unmapped: Array.from(unmappedCounts.entries())
        .map(([reportCode, count]) => ({ reportCode, count }))
        .sort((a, b) => b.count - a.count),
    };
  } catch (e) {
    logError("sales-leaderboard/upload", e);
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

// Light helper for the admin page: list every sales_exec + whether they're
// a participant + their current photo URL.
export async function loadAdminContext() {
  await requireAdmin();
  const [execs, participantsRows, mapRows, lastUploads] = await Promise.all([
    db.select().from(salesExecs).orderBy(salesExecs.name),
    db.select().from(salesLeaderboardParticipants),
    db.select().from(salesLeaderboardNameMap),
    db.all<{ year_month: string; report_type: string; uploaded_at: number; row_count: number }>(sql`
      SELECT year_month, report_type, MAX(uploaded_at) as uploaded_at,
             (SELECT row_count FROM sales_leaderboard_uploads u2
               WHERE u2.year_month = u.year_month AND u2.report_type = u.report_type
               ORDER BY u2.uploaded_at DESC LIMIT 1) as row_count
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
    })),
  };
}
