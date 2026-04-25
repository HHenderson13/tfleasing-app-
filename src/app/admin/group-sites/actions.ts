"use server";
import { db } from "@/db";
import { groupSites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

export type SiteKind = "car" | "cv";

export async function createGroupSite(input: { name: string; kind: SiteKind }) {
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Name is required." };
  const kind: SiteKind = input.kind === "cv" ? "cv" : "car";
  await db.insert(groupSites).values({ id: randomUUID(), name, kind, createdAt: new Date() });
  revalidatePath("/admin/group-sites");
  return { ok: true as const };
}

export async function updateGroupSite(id: string, patch: Partial<{ name: string; kind: SiteKind }>) {
  const clean: Record<string, string> = {};
  if (typeof patch.name === "string" && patch.name.trim()) clean.name = patch.name.trim();
  if (patch.kind === "car" || patch.kind === "cv") clean.kind = patch.kind;
  if (!Object.keys(clean).length) return;
  await db.update(groupSites).set(clean).where(eq(groupSites.id, id));
  revalidatePath("/admin/group-sites");
}

export async function deleteGroupSite(id: string) {
  await db.delete(groupSites).where(eq(groupSites.id, id));
  revalidatePath("/admin/group-sites");
}
