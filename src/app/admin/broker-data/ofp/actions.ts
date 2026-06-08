"use server";
import { db } from "@/db";
import { brokerOfpData, brokerOfpUploads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { parseOfpWorkbook, type VehicleClass } from "@/lib/broker-ofp-parser";
import { logError } from "@/lib/logger";

export interface OfpUploadResult {
  ok: boolean;
  error?: string;
  rowsParsed?: number;
  pcpCells?: number;
  hpBalCells?: number;
  warnings?: string[];
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const INSERT_BATCH_SIZE = 500;

export async function uploadOfpAction(formData: FormData): Promise<OfpUploadResult> {
  const me = await requireAdmin();
  try {
    const file = formData.get("file") as File | null;
    const vehicleClass = String(formData.get("vehicleClass") ?? "");
    if (!file) return { ok: false, error: "No file uploaded." };
    if (vehicleClass !== "cv" && vehicleClass !== "pv") {
      return { ok: false, error: "Pick CV or PV." };
    }
    if (file.size > MAX_SIZE_BYTES) {
      return { ok: false, error: "File over 20 MB — too big to process." };
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseOfpWorkbook(buffer, vehicleClass as VehicleClass);
    if (parsed.rows.length === 0) {
      return { ok: false, error: "No OFP rows found — check the file is the right workbook." };
    }

    const now = new Date();
    const uploadId = randomUUID();
    // Replace strategy: wipe everything for this vehicle class, then insert
    // the new batch. Keeps lookups simple — there's never more than one
    // active dataset per class.
    await db.delete(brokerOfpData).where(eq(brokerOfpData.vehicleClass, vehicleClass));

    // Batched inserts to keep each statement well under libsql's parameter
    // limit. 500 rows × ~8 columns = ~4000 parameters per statement.
    for (let i = 0; i < parsed.rows.length; i += INSERT_BATCH_SIZE) {
      const chunk = parsed.rows.slice(i, i + INSERT_BATCH_SIZE).map((r) => ({
        uploadId,
        vehicleClass,
        fundingRoute: r.fundingRoute,
        vehicle: r.vehicle,
        modelYear: r.modelYear,
        termMonths: r.termMonths,
        annualMileage: r.annualMileage,
        balloonGbp: r.balloonGbp,
      }));
      await db.insert(brokerOfpData).values(chunk);
    }

    await db.insert(brokerOfpUploads).values({
      id: uploadId,
      filename: file.name,
      vehicleClass,
      rowCount: parsed.rows.length,
      uploadedAt: now,
      uploadedByUserId: me.id,
    });

    revalidatePath("/admin/broker-data/ofp");
    return {
      ok: true,
      rowsParsed: parsed.rows.length,
      pcpCells: parsed.sheetSummary.find((s) => s.route === "pcp")?.cellsAttributed ?? 0,
      hpBalCells: parsed.sheetSummary.find((s) => s.route === "hp_balloon")?.cellsAttributed ?? 0,
      warnings: parsed.warnings,
    };
  } catch (e) {
    logError("broker-data/ofp-upload", e);
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
