"use server";
import { db } from "@/db";
import { stockMappings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type MappingKind =
  | "dealer" | "model" | "colour" | "engine" | "destination" | "option"
  | "body" | "transmission" | "drive" | "status" | "derivative";

function reval() {
  revalidatePath("/admin/stock-mappings");
  revalidatePath("/stock");
}

export async function upsertMapping(input: {
  kind: MappingKind;
  rawKey: string;
  displayName: string;
  hidden?: boolean;
  promoteToVariant?: boolean;
}) {
  const rawKey = input.rawKey.trim();
  const displayName = input.displayName.trim();
  if (!rawKey) return { ok: false as const, error: "Raw key required." };
  if (!displayName) return { ok: false as const, error: "Display name required." };
  const existing = await db
    .select()
    .from(stockMappings)
    .where(and(eq(stockMappings.kind, input.kind), eq(stockMappings.rawKey, rawKey)))
    .limit(1);
  if (existing.length) {
    await db
      .update(stockMappings)
      .set({ displayName, groupSiteId: null, hidden: !!input.hidden, promoteToVariant: !!input.promoteToVariant })
      .where(and(eq(stockMappings.kind, input.kind), eq(stockMappings.rawKey, rawKey)));
  } else {
    await db.insert(stockMappings).values({
      kind: input.kind,
      rawKey,
      displayName,
      groupSiteId: null,
      hidden: !!input.hidden,
      promoteToVariant: !!input.promoteToVariant,
    });
  }
  reval();
  return { ok: true as const };
}

export async function deleteMapping(kind: MappingKind, rawKey: string) {
  await db.delete(stockMappings).where(and(eq(stockMappings.kind, kind), eq(stockMappings.rawKey, rawKey)));
  reval();
}
