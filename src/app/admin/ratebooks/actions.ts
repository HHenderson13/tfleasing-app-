"use server";
import { db } from "@/db";
import { ratebook, ratebookUploads, savedDiscountKeys, vehicles } from "@/db/schema";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { parseRatebookBuffer } from "@/lib/ratebook-parse";

export async function uploadRatebook(formData: FormData) {
  const file = formData.get("file") as File | null;
  const funderId = String(formData.get("funderId") ?? "");
  const isMaintained = String(formData.get("isMaintained") ?? "") === "true";

  if (!file || !funderId) return { ok: false as const, error: "Missing file or funder" };
  const buf = Buffer.from(await file.arrayBuffer());
  const { rows, vehicles: parsedVehicles, warnings, diagnostics } = parseRatebookBuffer(buf, file.name);
  if (!rows.length) return { ok: false as const, error: warnings.join("; ") || "No rows parsed", diagnostics };

  // Replace this funder/maintenance slice in ratebook.
  await db.delete(ratebook).where(and(
    eq(ratebook.funderId, funderId),
    eq(ratebook.isBusiness, true),
    eq(ratebook.isMaintained, isMaintained),
  ));

  const CHUNK = 500;
  const allCapCodes = parsedVehicles.map((v) => v.capCode);

  // Restore any previously saved discount mappings for cap codes in this upload.
  const savedMappings = allCapCodes.length
    ? await db.select().from(savedDiscountKeys).where(inArray(savedDiscountKeys.capCode, allCapCodes))
    : [];
  const savedMap = new Map(savedMappings.map((s) => [s.capCode, s.discountKey]));

  // Upsert vehicle master data. Refresh model/derivative/BLP/fuel; preserve discountKey.
  // For brand-new rows, restore discountKey from savedMap if available.
  const withData = parsedVehicles.filter((v) => v.model && v.derivative);
  const placeholders = parsedVehicles.filter((v) => !(v.model && v.derivative));

  for (let i = 0; i < withData.length; i += CHUNK) {
    const slice = withData.slice(i, i + CHUNK).map((v) => ({
      capCode: v.capCode,
      model: v.model!,
      derivative: v.derivative!,
      fuelType: v.fuelType,
      listPriceNet: v.listPriceNet,
      isVan: false,
      discountKey: savedMap.get(v.capCode) ?? null,
    }));
    await db.insert(vehicles).values(slice).onConflictDoUpdate({
      target: vehicles.capCode,
      set: {
        model: sql`excluded.model`,
        derivative: sql`excluded.derivative`,
        fuelType: sql`COALESCE(excluded.fuel_type, vehicles.fuel_type)`,
        listPriceNet: sql`COALESCE(excluded.list_price_net, vehicles.list_price_net)`,
        // Restore saved discountKey only if the row currently has none.
        discountKey: sql`COALESCE(vehicles.discount_key, excluded.discount_key)`,
      },
    });
  }

  for (let i = 0; i < placeholders.length; i += CHUNK) {
    const slice = placeholders.slice(i, i + CHUNK).map((v) => ({
      capCode: v.capCode,
      model: v.model ?? "Unknown",
      derivative: v.derivative ?? v.capCode,
      fuelType: v.fuelType,
      listPriceNet: v.listPriceNet,
      isVan: false,
      discountKey: savedMap.get(v.capCode) ?? null,
    }));
    await db.insert(vehicles).values(slice).onConflictDoNothing();
  }

  // Insert ratebook rows.
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map((r) => ({
      funderId, ...r, isBusiness: true, isMaintained,
    }));
    await db.insert(ratebook).values(slice).onConflictDoNothing();
    inserted += slice.length;
  }

  // Reconcile vehicles: remove any cap code no longer present in ANY ratebook row.
  // Save their discountKey first so it can be restored if the cap code returns.
  const orphans = await db
    .select({ capCode: vehicles.capCode, discountKey: vehicles.discountKey })
    .from(vehicles)
    .where(
      sql`cap_code NOT IN (SELECT DISTINCT cap_code FROM ratebook)`
    );

  if (orphans.length) {
    const toSave = orphans.filter((o) => o.discountKey);
    if (toSave.length) {
      for (let i = 0; i < toSave.length; i += CHUNK) {
        const slice = toSave.slice(i, i + CHUNK).map((o) => ({
          capCode: o.capCode,
          discountKey: o.discountKey!,
        }));
        await db.insert(savedDiscountKeys).values(slice).onConflictDoUpdate({
          target: savedDiscountKeys.capCode,
          set: { discountKey: sql`excluded.discount_key` },
        });
      }
    }
    const orphanCodes = orphans.map((o) => o.capCode);
    for (let i = 0; i < orphanCodes.length; i += CHUNK) {
      await db.delete(vehicles).where(inArray(vehicles.capCode, orphanCodes.slice(i, i + CHUNK)));
    }
  }

  // Clean up savedDiscountKeys for cap codes that are now live (no longer orphans).
  if (allCapCodes.length) {
    for (let i = 0; i < allCapCodes.length; i += CHUNK) {
      await db.delete(savedDiscountKeys).where(
        inArray(savedDiscountKeys.capCode, allCapCodes.slice(i, i + CHUNK))
      );
    }
  }

  await db.insert(ratebookUploads).values({
    funderId, isMaintained, filename: file.name, rowCount: inserted, uploadedAt: new Date(),
  });

  revalidatePath("/admin/ratebooks");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/discounts");
  return { ok: true as const, inserted, removed: orphans.length, warnings, diagnostics };
}
