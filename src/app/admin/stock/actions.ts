"use server";
import { db } from "@/db";
import { proposalEtaSnapshots, proposals, stockSettings, stockUploads, stockVehicles } from "@/db/schema";
import { parseStockWorkbook } from "@/lib/stock-parser";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";

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
  // Legacy small-file path: kept for local dev where the 4.5MB Vercel platform
  // body cap doesn't apply. Production uses processStockBlobAction instead.
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Pick a file to upload." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return processWorkbook(buffer, file.name);
}

export async function processStockBlobAction(input: { blobUrl: string; filename: string }) {
  const res = await fetch(input.blobUrl);
  if (!res.ok) return { ok: false as const, error: `Failed to fetch uploaded file (${res.status}).` };
  const buffer = Buffer.from(await res.arrayBuffer());
  const result = await processWorkbook(buffer, input.filename);
  // Tidy: blob is one-shot, no need to keep it once parsed.
  try { await del(input.blobUrl); } catch { /* ignore */ }
  return result;
}

async function processWorkbook(buffer: Buffer, filename: string) {
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

  await db.transaction(async (tx) => {
    // Replace semantics: clear the previous snapshot.
    await tx.delete(stockVehicles);
    await tx.insert(stockUploads).values({
      id: uploadId,
      filename,
      vehicleCount: parsed.length,
      uploadedAt: now,
    });
    // Insert in batches to keep the SQL statement size reasonable.
    const BATCH = 400;
    for (let i = 0; i < parsed.length; i += BATCH) {
      const slice = parsed.slice(i, i + BATCH);
      await tx.insert(stockVehicles).values(
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
          deliveredAt: v.deliveredAt,
          interestBearingAt: v.interestBearingAt,
          adoptedAt: v.adoptedAt,
          customerAssigned: v.customerAssigned,
          sourceSheet: v.sourceSheet,
          uploadId,
        }))
      );
    }
  });

  // Capture an ETA snapshot per active order proposal so the daily summary can
  // detect ETA movements vs. the previous upload.
  await captureEtaSnapshots(uploadId, now);

  revalidatePath("/admin/stock");
  revalidatePath("/stock");
  return { ok: true as const, count: parsed.length };
}

const TF_BRANCH_CODES = ["62133", "62134"];

async function captureEtaSnapshots(uploadId: string, capturedAt: Date) {
  const orderProps = await db
    .select({
      id: proposals.id,
      vin: proposals.vin,
      orderNumber: proposals.orderNumber,
    })
    .from(proposals)
    .where(inArray(proposals.status, ["in_order", "awaiting_delivery"]));
  if (orderProps.length === 0) return;

  const stock = await db
    .select({
      vin: stockVehicles.vin,
      orderNo: stockVehicles.orderNo,
      dealerRaw: stockVehicles.dealerRaw,
      locationStatus: stockVehicles.locationStatus,
      etaAt: stockVehicles.etaAt,
    })
    .from(stockVehicles);

  const rows: { proposalId: string; uploadId: string; etaAt: Date | null; locationStatus: string | null; capturedAt: Date }[] = [];
  for (const p of orderProps) {
    let hit: (typeof stock)[number] | undefined;
    if (p.vin) hit = stock.find((s) => s.vin === p.vin);
    if (!hit && p.orderNumber) {
      hit = stock.find(
        (s) =>
          s.orderNo === p.orderNumber &&
          s.dealerRaw &&
          TF_BRANCH_CODES.some((c) => s.dealerRaw!.includes(c)),
      );
    }
    rows.push({
      proposalId: p.id,
      uploadId,
      etaAt: hit?.etaAt ?? null,
      locationStatus: hit?.locationStatus ?? null,
      capturedAt,
    });
  }
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(proposalEtaSnapshots).values(rows.slice(i, i + BATCH));
  }
}
