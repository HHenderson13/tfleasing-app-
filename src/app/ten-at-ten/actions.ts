"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { NotAnEnquiryExportError, ingestEnquiries, parseEnquiryWorkbook } from "@/lib/enquiries";
import { NotAnEnquiryLogError, parseTenAtTenWorkbook } from "@/lib/ten-at-ten";
import { NotAnOrderListError, detectTenAtTenFile, parseOrderWorkbook, type TenAtTenFileKind } from "@/lib/ten-at-ten-orders";
import { ingestTenAtTen, ingestTenAtTenOrders, recordResponseUpload, type TenAtTenIngest } from "@/lib/ten-at-ten-store";

export interface TenAtTenUploadOutcome {
  ok: boolean;
  error?: string;
  filename?: string;
  kind?: TenAtTenFileKind;
  result?: TenAtTenIngest;
}

/**
 * Merge one export into 10 at 10, line by line. The file says what it is
 * — the Dealerweb enquiry log, the Dealerweb order list, or the
 * MotorComplete enquiry export behind Response times — told apart by its
 * header row, so one drop zone takes all three. Admin only.
 */
export async function uploadTenAtTenAction(formData: FormData): Promise<TenAtTenUploadOutcome> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a .xlsx export to upload." };
  if (!/\.xlsx?$/i.test(file.name)) return { ok: false, error: `${file.name}: not an Excel file (.xlsx expected).` };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: `${file.name}: over 20 MB, which is not one of these exports.` };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = detectTenAtTenFile(buf);
    if (!kind) {
      return { ok: false, error: `${file.name}: not an Enquiry Tracker, Enquiry Log or Dealbook – Orders export — the columns don't match any of them.` };
    }
    const meta = { filename: file.name, userId: user.id };
    let result: TenAtTenIngest;
    if (kind === "enquiries") {
      const parsed = parseTenAtTenWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) return { ok: false, error: `${file.name}: no usable rows found.` };
      result = await ingestTenAtTen(parsed, meta);
    } else if (kind === "orders") {
      const parsed = parseOrderWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) return { ok: false, error: `${file.name}: no usable rows found.` };
      result = await ingestTenAtTenOrders(parsed, meta);
    } else {
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
    return { ok: true, filename: file.name, kind, result };
  } catch (e) {
    if (e instanceof NotAnEnquiryLogError || e instanceof NotAnOrderListError || e instanceof NotAnEnquiryExportError) {
      return { ok: false, error: `${file.name}: ${e.message}` };
    }
    logError("ten-at-ten/upload", e, { filename: file.name });
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
