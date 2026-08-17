"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { ingestEnquiries, parseEnquiryWorkbook, type IngestResult } from "@/lib/enquiries";

export interface UploadOutcome {
  ok: boolean;
  error?: string;
  filename?: string;
  result?: IngestResult;
}

/**
 * Ingest one MotorComplete export. Admin only.
 *
 * Uploads stack: rows are merged on their natural key, so re-uploading a
 * file whose date range overlaps an earlier one updates the enquiries it
 * has newer information for and leaves the rest untouched. Nothing is
 * ever deleted by an upload.
 */
export async function uploadEnquiriesAction(formData: FormData): Promise<UploadOutcome> {
  const user = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a .xlsx export to upload." };
  }
  if (!/\.xlsx?$/i.test(file.name)) {
    return { ok: false, error: "That doesn't look like an Excel export (.xlsx expected)." };
  }
  // Generous ceiling — the exports are ~30 KB, so anything near this is a
  // wrong file rather than a big day.
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, error: "File is over 20 MB — that's not an enquiry export." };
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseEnquiryWorkbook(buf);

    if (parsed.rows.length === 0) {
      return {
        ok: false,
        error:
          parsed.rowsInFile === 0
            ? "No rows found in that file."
            : `Read ${parsed.rowsInFile} rows but none were usable — check it's the MotorComplete enquiry export with the standard column layout.`,
      };
    }

    const result = await ingestEnquiries(parsed, {
      filename: file.name,
      userId: user.id,
    });

    revalidatePath("/enquiries");
    revalidatePath("/enquiries/upload");
    return { ok: true, filename: file.name, result };
  } catch (e) {
    logError("enquiries/uploadEnquiriesAction", e, { filename: file.name });
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
