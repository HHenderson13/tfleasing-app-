"use server";
import { db } from "@/db";
import { proposalStageChecks, stageCheckDefs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { STAGE_CHECK_DEFS_TAG } from "@/lib/cache-tags";

// Bust both the page render cache and the cross-request stageCheckDefs
// tag so list/order/awaiting pages immediately see the new check list.
function invalidate(extraPaths: string[] = []) {
  updateTag(STAGE_CHECK_DEFS_TAG);
  revalidatePath("/admin/order-checks");
  revalidatePath("/orders");
  revalidatePath("/orders/awaiting");
  for (const p of extraPaths) revalidatePath(p);
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || randomUUID().slice(0, 8);
}

export async function createOrderCheck(input: { label: string; appliesToBq: boolean; stage?: "order" | "delivery" }) {
  const label = input.label.trim();
  if (!label) return { ok: false as const, error: "Label is required." };
  const stage = input.stage === "delivery" ? "delivery" : "order";
  const rows = await db.select().from(stageCheckDefs);
  const sameStage = rows.filter((r) => r.stage === stage);
  const maxSort = sameStage.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  let id = slugify(label);
  if (rows.some((r) => r.id === id)) id = `${id}-${randomUUID().slice(0, 4)}`;
  await db.insert(stageCheckDefs).values({
    id,
    label,
    sortOrder: maxSort + 10,
    appliesToBq: input.appliesToBq,
    stage,
    createdAt: new Date(),
  });
  invalidate();
  return { ok: true as const };
}

export async function updateOrderCheck(id: string, patch: Partial<{ label: string; appliesToBq: boolean; sortOrder: number }>) {
  const clean: Record<string, unknown> = {};
  if (typeof patch.label === "string" && patch.label.trim()) clean.label = patch.label.trim();
  if (typeof patch.appliesToBq === "boolean") clean.appliesToBq = patch.appliesToBq;
  if (typeof patch.sortOrder === "number") clean.sortOrder = patch.sortOrder;
  if (!Object.keys(clean).length) return;
  await db.update(stageCheckDefs).set(clean).where(eq(stageCheckDefs.id, id));
  invalidate();
}

export async function deleteOrderCheck(id: string) {
  await db.delete(proposalStageChecks).where(eq(proposalStageChecks.checkId, id));
  await db.delete(stageCheckDefs).where(eq(stageCheckDefs.id, id));
  invalidate();
}
