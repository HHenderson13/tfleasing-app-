"use server";
import { db } from "@/db";
import { brokerBusinessDiscounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

interface CreateInput {
  label: string;
  vehicleClass: "car" | "van" | null;
  bucket: string | null;
  fundingRoute: "outright" | "pcp" | "hp" | "hp_balloon" | "contract_hire" | null;
  extraDiscountPct: number;
  aprUpliftPct: number;
  notes: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

function trim(v: string | null): string | null {
  if (v === null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createBusinessDiscountAction(input: CreateInput) {
  await requireAdmin();
  if (!input.label.trim()) return { ok: false as const, error: "Label is required." };
  if (!Number.isFinite(input.extraDiscountPct) || input.extraDiscountPct < 0) {
    return { ok: false as const, error: "Extra discount % must be a non-negative number." };
  }
  if (!Number.isFinite(input.aprUpliftPct) || input.aprUpliftPct < 0) {
    return { ok: false as const, error: "APR uplift % must be a non-negative number." };
  }
  const now = new Date();
  await db.insert(brokerBusinessDiscounts).values({
    id: randomUUID(),
    label: input.label.trim(),
    vehicleClass: input.vehicleClass,
    bucket: trim(input.bucket),
    fundingRoute: input.fundingRoute,
    extraDiscountPct: input.extraDiscountPct,
    aprUpliftPct: input.aprUpliftPct,
    notes: trim(input.notes),
    validFrom: parseDate(input.validFrom),
    validUntil: parseDate(input.validUntil),
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/business");
  return { ok: true as const };
}

export async function setBusinessDiscountActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(brokerBusinessDiscounts).set({ active, updatedAt: new Date() }).where(eq(brokerBusinessDiscounts.id, id));
  revalidatePath("/admin/broker-data/business");
  return { ok: true as const };
}

export async function deleteBusinessDiscountAction(id: string) {
  await requireAdmin();
  await db.delete(brokerBusinessDiscounts).where(eq(brokerBusinessDiscounts.id, id));
  revalidatePath("/admin/broker-data/business");
  return { ok: true as const };
}
