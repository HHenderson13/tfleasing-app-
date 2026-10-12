"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { NotAnEnquiryLogError, parseTenAtTenWorkbook } from "@/lib/ten-at-ten";
import { NotAnOrderListError, detectTenAtTenFile, parseOrderWorkbook } from "@/lib/ten-at-ten-orders";
import { ingestTenAtTen, ingestTenAtTenOrders, type TenAtTenIngest } from "@/lib/ten-at-ten-store";

export interface TenAtTenUploadOutcome {
  ok: boolean;
  error?: string;
  filename?: string;
  kind?: "enquiries" | "orders";
  result?: TenAtTenIngest;
}

/**
 * Merge one Dealerweb export into 10 at 10, line by line. The file says
 * what it is: the enquiry log and the order list are told apart by their
 * header row, so one drop zone takes both. Admin only.
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
      return { ok: false, error: `${file.name}: not the enquiry log or the order list — the columns don't match either.` };
    }
    const meta = { filename: file.name, userId: user.id };
    let result: TenAtTenIngest;
    if (kind === "enquiries") {
      const parsed = parseTenAtTenWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) return { ok: false, error: `${file.name}: no usable rows found.` };
      result = await ingestTenAtTen(parsed, meta);
    } else {
      const parsed = parseOrderWorkbook(buf);
      if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) return { ok: false, error: `${file.name}: no usable rows found.` };
      result = await ingestTenAtTenOrders(parsed, meta);
    }
    revalidatePath("/ten-at-ten");
    revalidatePath("/ten-at-ten/admin");
    return { ok: true, filename: file.name, kind, result };
  } catch (e) {
    if (e instanceof NotAnEnquiryLogError || e instanceof NotAnOrderListError) return { ok: false, error: `${file.name}: ${e.message}` };
    logError("ten-at-ten/upload", e, { filename: file.name });
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
