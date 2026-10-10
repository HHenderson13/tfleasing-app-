"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { NotAnEnquiryLogError, parseTenAtTenWorkbook } from "@/lib/ten-at-ten";
import { ingestTenAtTen, type TenAtTenIngest } from "@/lib/ten-at-ten-store";

export interface TenAtTenUploadOutcome {
  ok: boolean;
  error?: string;
  filename?: string;
  result?: TenAtTenIngest;
}

/** Merge one enquiry log into 10 at 10, line by line. Admin only. */
export async function uploadTenAtTenAction(formData: FormData): Promise<TenAtTenUploadOutcome> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a .xlsx enquiry log to upload." };
  if (!/\.xlsx?$/i.test(file.name)) return { ok: false, error: `${file.name}: not an Excel file (.xlsx expected).` };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: `${file.name}: over 20 MB, which is not an enquiry log.` };

  try {
    const parsed = parseTenAtTenWorkbook(Buffer.from(await file.arrayBuffer()));
    if (parsed.rows.length === 0 && parsed.skippedExcluded === 0) {
      return { ok: false, error: `${file.name}: no usable rows found.` };
    }
    const result = await ingestTenAtTen(parsed, { filename: file.name, userId: user.id });
    revalidatePath("/ten-at-ten");
    revalidatePath("/ten-at-ten/admin");
    return { ok: true, filename: file.name, result };
  } catch (e) {
    if (e instanceof NotAnEnquiryLogError) return { ok: false, error: `${file.name}: ${e.message}` };
    logError("ten-at-ten/upload", e, { filename: file.name });
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
