"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { NotAnEnquiryExportError, ingestEnquiries, parseEnquiryWorkbook } from "@/lib/enquiries";
import { NotAnEnquiryLogError, parseTenAtTenWorkbook } from "@/lib/ten-at-ten";
import { NotACancelledOrdersError, parseCancellationsWorkbook } from "@/lib/ten-at-ten-cancellations";
import { NotAnOrderListError, classifyDealbook, detectTenAtTenFile, makeDeliveryKey, parseOrderWorkbook, type TenAtTenFileKind } from "@/lib/ten-at-ten-orders";
import {
  ingestCancellations, ingestDealbook, ingestTenAtTen, recordResponseUpload, saveBudgets, saveCancellationNote,
  setCancellationClassification, type TenAtTenIngest,
} from "@/lib/ten-at-ten-store";
import { feedPolePositionFromTenAtTen, invalidateLeaderboard, type FedSlot } from "@/lib/sales-leaderboard-store";

export interface TenAtTenUploadOutcome {
  ok: boolean;
  error?: string;
  filename?: string;
  kind?: TenAtTenFileKind;
  result?: TenAtTenIngest;
  /** A Dealbook file that could be either report: ask which, then re-send with `kind`. */
  needsChoice?: boolean;
  /** Pole Position months this upload changed — 10 at 10 feeds the board. */
  polePosition?: FedSlot[];
  /** Set when the upload landed but Pole Position couldn't be updated from it. */
  polePositionError?: string;
}

/**
 * Merge one export into 10 at 10, line by line. The file says what it is
 * — Enquiry Log, Enquiry Tracker (MotorComplete), a Dealbook, or Cancelled
 * Orders — told
 * apart by its header row, so one drop zone takes them all. The two
 * Dealbook reports share their columns and are told apart by their dates
 * (classifyDealbook); when a file could be either, the uploader is asked
 * and it comes back with `kind` set. Admin only.
 */
export async function uploadTenAtTenAction(formData: FormData): Promise<TenAtTenUploadOutcome> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a .xlsx export to upload." };
  if (!/\.xlsx?$/i.test(file.name)) return { ok: false, error: `${file.name}: not an Excel file (.xlsx expected).` };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: `${file.name}: over 20 MB, which is not one of these exports.` };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const detected = detectTenAtTenFile(buf);
    if (!detected) {
      return { ok: false, error: `${file.name}: not an Enquiry Tracker, Enquiry Log, Dealbook or Cancelled Orders export — the columns don't match any of them.` };
    }
    const meta = { filename: file.name, userId: user.id };
    let kind: TenAtTenFileKind;
    let result: TenAtTenIngest;
    if (detected === "enquiries") {
      kind = "enquiries";
      const parsed = parseTenAtTenWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) return { ok: false, error: `${file.name}: no usable rows found.` };
      result = await ingestTenAtTen(parsed, meta);
    } else if (detected === "cancellations") {
      kind = "cancellations";
      const parsed = parseCancellationsWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) return { ok: false, error: `${file.name}: no usable rows found.` };
      result = await ingestCancellations(parsed, meta);
    } else if (detected === "dealbook") {
      const parsed = parseOrderWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) return { ok: false, error: `${file.name}: no usable rows found.` };
      const chosen = formData.get("kind");
      const dealbook = chosen === "orders" || chosen === "deliveries" ? chosen : classifyDealbook(parsed.rows);
      if (!dealbook) {
        return { ok: false, needsChoice: true, filename: file.name, error: `${file.name}: is this Dealbook – Orders or Dealbook – Deliveries? Its dates fit either.` };
      }
      kind = dealbook;
      let syncMonths: string[] = [];
      if (dealbook === "deliveries") {
        // A delivery with no date in column AK can't be put in a month.
        const undated = parsed.rows.filter((r) => !r.deliveryDay).length;
        parsed.rows = parsed.rows
          .filter((r) => r.deliveryDay)
          .map((r) => ({ ...r, id: makeDeliveryKey(r.id, r.deliveryDay as string) }));
        parsed.skippedUnreadable += undated;
        // The report is the full list for its delivery month(s): anything
        // stored for them that it no longer carries has slipped or gone.
        syncMonths = [...new Set(parsed.rows.map((r) => (r.deliveryDay as string).slice(0, 7)))];
      }
      result = await ingestDealbook(parsed, meta, dealbook, syncMonths);
    } else {
      kind = "response";
      // The Enquiry Tracker's own parse and merge, rules unchanged.
      const parsed = parseEnquiryWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.rowsInFile === 0) return { ok: false, error: `${file.name}: no rows found.` };
      const r = await ingestEnquiries(parsed, meta);
      const days = parsed.rows.map((x) => x.enquiryDay).sort();
      result = {
        rowsInFile: r.rowsInFile,
        inserted: r.inserted,
        updated: r.updated,
        unchanged: r.unchanged,
        excluded: r.skippedExcluded + r.skippedNotLead + r.skippedLostSaleReason + r.skippedNotMotorComplete,
        removed: r.removedRetroactively,
        duplicatesCollapsed: r.duplicatesCollapsed,
        unreadable: r.skippedUnparseable,
        firstDay: days[0] ?? null,
        lastDay: days[days.length - 1] ?? null,
      };
      await recordResponseUpload(result, meta);
    }
    revalidatePath("/ten-at-ten");
    revalidatePath("/ten-at-ten/admin");

    // 10 at 10 feeds Pole Position: every file moves the board — the
    // enquiry log, both Dealbook reports, Cancelled Orders (which takes
    // cancelled orders out of Order Take) and the Enquiry Tracker (Response
    // Time). The upload itself has landed either way, so a problem here is
    // reported rather than failing it.
    let polePosition: FedSlot[] | undefined;
    let polePositionError: string | undefined;
    try {
      polePosition = await feedPolePositionFromTenAtTen(user.id);
      if (polePosition.length) invalidateLeaderboard();
    } catch (e) {
      logError("ten-at-ten/feed-pole-position", e, { filename: file.name });
      polePositionError = "Pole Position wasn't updated from this file — use Re-process on Pole Position's admin page.";
    }
    return { ok: true, filename: file.name, kind, result, polePosition, polePositionError };
  } catch (e) {
    if (e instanceof NotAnEnquiryLogError || e instanceof NotAnOrderListError || e instanceof NotAnEnquiryExportError || e instanceof NotACancelledOrdersError) {
      return { ok: false, error: `${file.name}: ${e.message}` };
    }
    logError("ten-at-ten/upload", e, { filename: file.name });
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}

const budgetSchema = z.object({
  rows: z.array(z.object({
    yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    car: z.number().int().min(0).max(100000),
    cv: z.number().int().min(0).max(100000),
  })).max(60),
});

/** Save monthly delivery budgets (Car and CV; combined is their sum). Admin only. */
export async function saveBudgetsAction(input: { rows: { yearMonth: string; car: number; cv: number }[] }): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid budgets" };
  try {
    await saveBudgets(parsed.data.rows);
    revalidatePath("/ten-at-ten");
    revalidatePath("/ten-at-ten/admin");
    return { ok: true };
  } catch (e) {
    logError("ten-at-ten/budgets", e);
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save budgets." };
  }
}

const cancellationId = z.string().regex(/^[0-9a-f]{20}$/);
const noteSchema = z.object({ id: cancellationId, note: z.string().max(2000) });
const classificationSchema = z.object({ id: cancellationId, classification: z.enum(["rewrite", "proper"]).nullable() });

/** A manager's reason for a cancellation. Admin only, like all of 10 at 10. */
export async function saveCancellationNoteAction(input: { id: string; note: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAdmin();
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That note couldn't be saved — keep it under 2,000 characters." };
  try {
    const ok = await saveCancellationNote(parsed.data.id, parsed.data.note.trim(), user.name || user.email);
    if (!ok) return { ok: false, error: "That cancellation is no longer held — reload the page." };
    revalidatePath("/ten-at-ten");
    return { ok: true };
  } catch (e) {
    logError("ten-at-ten/cancellation-note", e, { id: parsed.data.id });
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the note." };
  }
}

/**
 * A manager's call that a cancellation is (or isn't) a Re-Write, where the
 * matching got it wrong; null hands it back to the matching. Admin only.
 */
export async function setCancellationStatusAction(input: { id: string; classification: "rewrite" | "proper" | null }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAdmin();
  const parsed = classificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const ok = await setCancellationClassification(parsed.data.id, parsed.data.classification, user.name || user.email);
    if (!ok) return { ok: false, error: "That cancellation is no longer held — reload the page." };
    revalidatePath("/ten-at-ten");
    // A Re-Write's re-order is credited to the original order month, so the
    // call moves Order Take. The call itself has saved either way.
    try {
      if ((await feedPolePositionFromTenAtTen(user.id)).length) invalidateLeaderboard();
    } catch (e) {
      logError("ten-at-ten/feed-pole-position", e, { id: parsed.data.id });
    }
    return { ok: true };
  } catch (e) {
    logError("ten-at-ten/cancellation-status", e, { id: parsed.data.id });
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save that." };
  }
}
