"use server";
import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

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
  revalidatePath("/admin/sales-execs");
  return { ok: true as const };
}

export async function updateSalesExec(id: string, patch: Partial<{ name: string; email: string }>) {
  const clean: Record<string, string> = {};
  if (typeof patch.name === "string" && patch.name.trim()) clean.name = patch.name.trim();
  if (typeof patch.email === "string" && patch.email.trim()) clean.email = patch.email.trim();
  if (!Object.keys(clean).length) return;
  await db.update(salesExecs).set(clean).where(eq(salesExecs.id, id));
  revalidatePath("/admin/sales-execs");
}

export async function deleteSalesExec(id: string) {
  await db.delete(salesExecs).where(eq(salesExecs.id, id));
  revalidatePath("/admin/sales-execs");
}
