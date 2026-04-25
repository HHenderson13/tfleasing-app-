"use server";
import { db } from "@/db";
import { stockSettings, stockUploads, stockVehicles } from "@/db/schema";
import { parseStockWorkbook } from "@/lib/stock-parser";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

async function getPassword(): Promise<string> {
  const [row] = await db.select().from(stockSettings).where(eq(stockSettings.id, "default")).limit(1);
  return row?.workbookPassword ?? "Ftru";
}

export async function updateWorkbookPasswordAction(password: string) {
  const trimmed = password.trim();
  if (!trimmed) return { ok: false as const, error: "Password cannot be empty." };
  const existing = await db.select().from(stockSettings).where(eq(stockSettings.id, "default")).limit(1);
  if (existing.length) {
    await db.update(stockSettings).set({ workbookPassword: trimmed, updatedAt: new Date() }).where(eq(stockSettings.id, "default"));
  } else {
    await db.insert(stockSettings).values({ id: "default", workbookPassword: trimmed, updatedAt: new Date() });
  }
  revalidatePath("/admin/stock");
  return { ok: true as const };
}

export async function uploadStockAction(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Pick a file to upload." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const password = await getPassword();
  let parsed;
  try {
    parsed = await parseStockWorkbook(buffer, password);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /password/i.test(msg)
      ? `Could not read workbook: ${msg}. The saved password is "${password}" — update it below if Ford has changed it.`
      : `Could not read workbook: ${msg}`;
    return { ok: false as const, error: friendly };
  }
  if (parsed.length === 0) {
    return { ok: false as const, error: 'No vehicles found. Make sure the "input" tab is populated.' };
  }

  const uploadId = randomUUID();
  const now = new Date();

  db.transaction((tx) => {
    // Replace semantics: clear the previous snapshot.
    tx.delete(stockVehicles).run();
    tx.insert(stockUploads).values({
      id: uploadId,
      filename: file.name,
      vehicleCount: parsed.length,
      uploadedAt: now,
    }).run();
    // Insert in batches to keep the SQL statement size reasonable.
    const BATCH = 400;
    for (let i = 0; i < parsed.length; i += BATCH) {
      const slice = parsed.slice(i, i + BATCH);
      tx.insert(stockVehicles).values(
        slice.map((v) => ({
          vin: v.vin,
          modelRaw: v.modelRaw,
          modelYear: v.modelYear,
          bodyStyle: v.bodyStyle,
          seriesRaw: v.seriesRaw,
          derivativeRaw: v.derivativeRaw,
          engine: v.engine,
          transmission: v.transmission,
          drive: v.drive,
          colourRaw: v.colourRaw,
          options: v.options.join("\n") || null,
          orderNo: v.orderNo,
          locationStatus: v.locationStatus,
          gateReleaseAt: v.gateReleaseAt,
          etaAt: v.etaAt,
          dealerRaw: v.dealerRaw,
          destinationRaw: v.destinationRaw,
          sourceSheet: v.sourceSheet,
          uploadId,
        }))
      ).run();
    }
  });

  revalidatePath("/admin/stock");
  revalidatePath("/stock");
  return { ok: true as const, count: parsed.length };
}
