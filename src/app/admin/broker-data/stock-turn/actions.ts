"use server";
import { db } from "@/db";
import { brokerStockTurnRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

interface CreateInput {
  label: string;
  bucket: string | null;
  modelYear: string | null;
  gateReleaseFrom: string | null;     // ISO string (date) or null
  gateReleaseTo: string | null;       // ISO string (date) or null
  mustRegisterBy: string;              // ISO string (date)
  bonusGbp: number;
  notes: string | null;
}

function trim(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

export async function createStockTurnRuleAction(input: CreateInput) {
  await requireAdmin();
  const label = input.label.trim();
  if (!label) return { ok: false as const, error: "Label is required." };
  if (!Number.isFinite(input.bonusGbp) || input.bonusGbp <= 0) {
    return { ok: false as const, error: "Bonus must be greater than zero." };
  }
  const mustRegisterBy = parseDate(input.mustRegisterBy);
  if (!mustRegisterBy) return { ok: false as const, error: "Registration deadline is required." };

  const id = randomUUID();
  const now = new Date();
  await db.insert(brokerStockTurnRules).values({
    id,
    label,
    bucket: trim(input.bucket),
    modelYear: trim(input.modelYear),
    gateReleaseFrom: parseDate(input.gateReleaseFrom),
    gateReleaseTo: parseDate(input.gateReleaseTo),
    mustRegisterBy,
    bonusGbp: input.bonusGbp,
    notes: trim(input.notes),
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/stock-turn");
  return { ok: true as const, id };
}

export async function setStockTurnRuleActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(brokerStockTurnRules).set({ active, updatedAt: new Date() }).where(eq(brokerStockTurnRules.id, id));
  revalidatePath("/admin/broker-data/stock-turn");
  return { ok: true as const };
}

export async function deleteStockTurnRuleAction(id: string) {
  await requireAdmin();
  await db.delete(brokerStockTurnRules).where(eq(brokerStockTurnRules.id, id));
  revalidatePath("/admin/broker-data/stock-turn");
  return { ok: true as const };
}
