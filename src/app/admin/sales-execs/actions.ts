"use server";
import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { SALES_EXECS_TAG } from "@/lib/cache-tags";

// Centralised invalidation — every mutation here busts both the page
// render cache and the cross-request salesExecs lookup tag so /orders,
// /proposals, /reports etc. immediately see the new exec list.
function invalidate() {
  updateTag(SALES_EXECS_TAG);
  revalidatePath("/admin/sales-execs");
}

export async function createSalesExec(input: { name: string; email: string }) {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name || !email) return { ok: false as const, error: "Name and email are required." };
  await db.insert(salesExecs).values({
    id: randomUUID(),
    name,
    email,
    createdAt: new Date(),
  });
  invalidate();
  return { ok: true as const };
}

export async function updateSalesExec(id: string, patch: Partial<{ name: string; email: string }>) {
  const clean: Record<string, string> = {};
  if (typeof patch.name === "string" && patch.name.trim()) clean.name = patch.name.trim();
  if (typeof patch.email === "string" && patch.email.trim()) clean.email = patch.email.trim();
  if (!Object.keys(clean).length) return;
  await db.update(salesExecs).set(clean).where(eq(salesExecs.id, id));
  invalidate();
}

export async function deleteSalesExec(id: string) {
  await db.delete(salesExecs).where(eq(salesExecs.id, id));
  invalidate();
}
