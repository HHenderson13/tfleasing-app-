"use server";
import { db } from "@/db";
import { brokerVehicleCashValues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

interface CashValueInput {
  bucket: string;
  variant: string;
  derivative: string | null;
  modelYear: string | null;
  cashGbp: number;
  marginGbp: number | null;
  marginPct: number | null;
  capCode: string | null;
  capId: string | null;
  notes: string | null;
}

function normaliseString(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export async function createCashValueAction(input: CashValueInput) {
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
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/cash-values");
  return { ok: true as const, id };
}

export async function updateCashValueAction(id: string, patch: Partial<CashValueInput>) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.cashGbp === "number" && Number.isFinite(patch.cashGbp) && patch.cashGbp > 0) clean.cashGbp = patch.cashGbp;
  if (typeof patch.marginGbp === "number" && Number.isFinite(patch.marginGbp)) clean.marginGbp = patch.marginGbp;
  if (patch.marginGbp === null) clean.marginGbp = null;
  if (typeof patch.marginPct === "number" && Number.isFinite(patch.marginPct)) clean.marginPct = patch.marginPct;
  if (patch.marginPct === null) clean.marginPct = null;
  if (patch.capCode !== undefined) clean.capCode = normaliseString(patch.capCode);
  if (patch.capId !== undefined) clean.capId = normaliseString(patch.capId);
  if (patch.notes !== undefined) clean.notes = normaliseString(patch.notes);
  if (Object.keys(clean).length === 1) return { ok: true as const }; // only updatedAt
  await db.update(brokerVehicleCashValues).set(clean).where(eq(brokerVehicleCashValues.id, id));
  revalidatePath("/admin/broker-data/cash-values");
  return { ok: true as const };
}

export async function deleteCashValueAction(id: string) {
  await requireAdmin();
  await db.delete(brokerVehicleCashValues).where(eq(brokerVehicleCashValues.id, id));
  revalidatePath("/admin/broker-data/cash-values");
  return { ok: true as const };
}
