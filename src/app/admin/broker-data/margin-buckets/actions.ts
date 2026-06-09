"use server";
import { db } from "@/db";
import { marginBucketRules, marginBuckets, vehicleMaster } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

interface BucketInput {
  name: string;
  notes: string | null;
}

function trim(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export async function createMarginBucketAction(input: BucketInput) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Name is required." };
  // Uniqueness enforced at DB level — surface the dupe as a friendly error.
  const existing = await db.select().from(marginBuckets).where(eq(marginBuckets.name, name)).limit(1);
  if (existing.length > 0) return { ok: false as const, error: "A bucket with that name already exists." };
  const id = randomUUID();
  const now = new Date();
  await db.insert(marginBuckets).values({
    id,
    name,
    notes: trim(input.notes),
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/margin-buckets");
  return { ok: true as const, id };
}

export async function updateMarginBucketAction(id: string, patch: Partial<BucketInput>) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n) clean.name = n;
  }
  if (patch.notes !== undefined) clean.notes = trim(patch.notes);
  if (Object.keys(clean).length === 1) return { ok: true as const };
  await db.update(marginBuckets).set(clean).where(eq(marginBuckets.id, id));
  revalidatePath("/admin/broker-data/margin-buckets");
  return { ok: true as const };
}

export async function deleteMarginBucketAction(id: string) {
  await requireAdmin();
  // Detach any vehicles referencing this bucket so we don't leave dangling FKs.
  await db.update(vehicleMaster).set({ marginBucketId: null, updatedAt: new Date() }).where(eq(vehicleMaster.marginBucketId, id));
  await db.delete(marginBucketRules).where(eq(marginBucketRules.bucketId, id));
  await db.delete(marginBuckets).where(eq(marginBuckets.id, id));
  revalidatePath("/admin/broker-data/margin-buckets");
  revalidatePath("/admin/broker-data/vehicles");
  return { ok: true as const };
}

interface RuleInput {
  bucketId: string;
  label: string;
  pct: number;
}

export async function createMarginRuleAction(input: RuleInput) {
  await requireAdmin();
  const label = input.label.trim();
  if (!label) return { ok: false as const, error: "Label is required." };
  if (!Number.isFinite(input.pct)) return { ok: false as const, error: "Percentage is required." };
  // Sort order = (max existing) + 1 so new rows append at the bottom.
  const existing = await db.select().from(marginBucketRules).where(eq(marginBucketRules.bucketId, input.bucketId));
  const sortOrder = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;
  const id = randomUUID();
  const now = new Date();
  await db.insert(marginBucketRules).values({
    id,
    bucketId: input.bucketId,
    label,
    pct: input.pct,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/margin-buckets");
  return { ok: true as const, id };
}

export async function updateMarginRuleAction(id: string, patch: { label?: string; pct?: number }) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label !== undefined) {
    const n = patch.label.trim();
    if (n) clean.label = n;
  }
  if (typeof patch.pct === "number" && Number.isFinite(patch.pct)) clean.pct = patch.pct;
  if (Object.keys(clean).length === 1) return { ok: true as const };
  await db.update(marginBucketRules).set(clean).where(eq(marginBucketRules.id, id));
  revalidatePath("/admin/broker-data/margin-buckets");
  return { ok: true as const };
}

export async function deleteMarginRuleAction(id: string) {
  await requireAdmin();
  await db.delete(marginBucketRules).where(eq(marginBucketRules.id, id));
  revalidatePath("/admin/broker-data/margin-buckets");
  return { ok: true as const };
}
