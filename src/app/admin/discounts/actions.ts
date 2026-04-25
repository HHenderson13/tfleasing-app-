"use server";
import { db } from "@/db";
import { modelDiscounts, savedDiscountKeys, vehicles } from "@/db/schema";
import { eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateDiscount(id: string, patch: Partial<{
  label: string; termsPct: number; dealerPct: number; additionalDiscountsGbp: number; novunaChip3Yr: number | null; novunaChip4Yr: number | null; grantText: string | null; customerSavingGbp: number | null; notes: string | null;
}>) {
  await db.update(modelDiscounts).set(patch).where(eq(modelDiscounts.id, id));
  revalidatePath("/admin/discounts");
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile";
}

export async function createDiscount(input: { label: string }) {
  const base = slugify(input.label);
  const existing = await db.select({ id: modelDiscounts.id }).from(modelDiscounts);
  const taken = new Set(existing.map((r) => r.id));
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  const next = await db.all<{ m: number }>(sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS m FROM model_discounts`);
  await db.insert(modelDiscounts).values({
    id, label: input.label, termsPct: 0, dealerPct: 0, sortOrder: next[0]?.m ?? 0,
  });
  revalidatePath("/admin/discounts");
}

export async function deleteDiscount(id: string) {
  await db.update(vehicles).set({ discountKey: null }).where(eq(vehicles.discountKey, id));
  await db.delete(modelDiscounts).where(eq(modelDiscounts.id, id));
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/vehicles");
}

export async function assignVehiclesToDiscount(discountId: string, capCodes: string[]) {
  if (!capCodes.length) return { ok: true as const, assigned: 0 };

  const existing = await db
    .select({ capCode: vehicles.capCode, model: vehicles.model, derivative: vehicles.derivative, discountKey: vehicles.discountKey })
    .from(vehicles)
    .where(inArray(vehicles.capCode, capCodes));

  const conflicts = existing.filter((v) => v.discountKey && v.discountKey !== discountId);
  if (conflicts.length) {
    const first = conflicts[0];
    const extra = conflicts.length > 1 ? ` (+${conflicts.length - 1} more)` : "";
    return {
      ok: false as const,
      error: `"${first.model} ${first.derivative}" is already assigned to profile "${first.discountKey}". Remove it from that profile before re-assigning.${extra}`,
      conflicts: conflicts.map((c) => ({ capCode: c.capCode, currentDiscountKey: c.discountKey! })),
    };
  }

  const toAssign = existing.filter((v) => v.discountKey !== discountId).map((v) => v.capCode);
  if (toAssign.length) {
    await db.update(vehicles).set({ discountKey: discountId }).where(inArray(vehicles.capCode, toAssign));
  }
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/vehicles");
  return { ok: true as const, assigned: toAssign.length };
}

export async function unassignVehicleFromDiscount(capCode: string) {
  await db.update(vehicles).set({ discountKey: null }).where(eq(vehicles.capCode, capCode));
  // Clear any saved mapping so this explicit removal isn't undone by a future upload.
  await db.delete(savedDiscountKeys).where(eq(savedDiscountKeys.capCode, capCode));
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/vehicles");
}

export async function listAssignableVehicles(discountId: string) {
  const rows = await db
    .select({
      capCode: vehicles.capCode,
      model: vehicles.model,
      derivative: vehicles.derivative,
      fuelType: vehicles.fuelType,
      listPriceNet: vehicles.listPriceNet,
      discountKey: vehicles.discountKey,
    })
    .from(vehicles)
    .where(isNull(vehicles.discountKey))
    .orderBy(vehicles.model, vehicles.derivative);
  // `discountId` reserved for future per-profile exclusion rules; currently we show all unassigned vehicles.
  void discountId;
  return rows;
}
