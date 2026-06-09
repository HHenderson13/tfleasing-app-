"use server";
import { db } from "@/db";
import { brokerVehicleCashValues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

interface PricingInput {
  bucket: string;
  variant: string;
  derivative: string | null;
  modelYear: string | null;
  capCode: string | null;
  capId: string | null;
  notes: string | null;
  // Either flat or component-driven; both can be present (components take
  // priority at quote time once retailPriceGbp is set).
  cashGbp: number;
  marginGbp: number | null;
  marginPct: number | null;
  retailPriceGbp: number | null;
  deliveryGbp: number | null;
  pdiPlatesGbp: number | null;
  firstRegFeeGbp: number | null;
  rflGbp: number | null;
  tradingMarginPct: number | null;
  standardsPct: number | null;
  vetsPct: number | null;
  oneFDiscountPct: number | null;
  dealerProfitGbp: number | null;
}

function normaliseString(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export async function createPricingAction(input: PricingInput) {
  await requireAdmin();
  const bucket = input.bucket.trim();
  const variant = input.variant.trim();
  if (!bucket || !variant) return { ok: false as const, error: "Bucket and variant are required." };
  if (!Number.isFinite(input.cashGbp) || input.cashGbp <= 0) return { ok: false as const, error: "Cash price must be greater than zero." };

  const id = randomUUID();
  const now = new Date();
  await db.insert(brokerVehicleCashValues).values({
    id,
    bucket,
    variant,
    derivative: normaliseString(input.derivative),
    modelYear: normaliseString(input.modelYear),
    cashGbp: input.cashGbp,
    marginGbp: input.marginGbp,
    marginPct: input.marginPct,
    capCode: normaliseString(input.capCode),
    capId: normaliseString(input.capId),
    notes: normaliseString(input.notes),
    retailPriceGbp: input.retailPriceGbp,
    deliveryGbp: input.deliveryGbp,
    pdiPlatesGbp: input.pdiPlatesGbp,
    firstRegFeeGbp: input.firstRegFeeGbp,
    rflGbp: input.rflGbp,
    tradingMarginPct: input.tradingMarginPct,
    standardsPct: input.standardsPct,
    vetsPct: input.vetsPct,
    oneFDiscountPct: input.oneFDiscountPct,
    dealerProfitGbp: input.dealerProfitGbp,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/cash-values");
  return { ok: true as const, id };
}

const NUMERIC_FIELDS: (keyof PricingInput)[] = [
  "cashGbp", "marginGbp", "marginPct",
  "retailPriceGbp", "deliveryGbp", "pdiPlatesGbp", "firstRegFeeGbp", "rflGbp",
  "tradingMarginPct", "standardsPct", "vetsPct", "oneFDiscountPct", "dealerProfitGbp",
];

export async function updatePricingAction(id: string, patch: Partial<PricingInput>) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of NUMERIC_FIELDS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null) clean[k] = null;
    else if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
  }
  if (patch.capCode !== undefined) clean.capCode = normaliseString(patch.capCode);
  if (patch.capId !== undefined) clean.capId = normaliseString(patch.capId);
  if (patch.notes !== undefined) clean.notes = normaliseString(patch.notes);
  if (Object.keys(clean).length === 1) return { ok: true as const }; // only updatedAt
  await db.update(brokerVehicleCashValues).set(clean).where(eq(brokerVehicleCashValues.id, id));
  revalidatePath("/admin/broker-data/cash-values");
  return { ok: true as const };
}

export async function deletePricingAction(id: string) {
  await requireAdmin();
  await db.delete(brokerVehicleCashValues).where(eq(brokerVehicleCashValues.id, id));
  revalidatePath("/admin/broker-data/cash-values");
  return { ok: true as const };
}

// Back-compat aliases — existing form file imported the old names.
export const createCashValueAction = createPricingAction;
export const updateCashValueAction = updatePricingAction;
export const deleteCashValueAction = deletePricingAction;
