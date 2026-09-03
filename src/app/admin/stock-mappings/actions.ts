"use server";
import { db } from "@/db";
import { stockMappings, stockModelDealerRules } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { STOCK_MAPPINGS_TAG } from "@/lib/stock-list";
import { requireAdmin } from "@/lib/auth-guard";
import { formatDealerCodes, parseDealerCodes } from "@/lib/stock-model-rules";

export type MappingKind =
  | "dealer" | "model" | "colour" | "engine" | "destination" | "option"
  | "body" | "transmission" | "drive" | "status" | "derivative" | "series";

function reval() {
  // Tag busts the cross-request mapped-stock cache (used by /stock,
  // /orders/awaiting, and every broker page). revalidatePath flushes the
  // server-rendered shell for the same routes.
  updateTag(STOCK_MAPPINGS_TAG);
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

// ─── Model-by-dealer rules ─────────────────────────────────────────────────
//
// An Explorer on a van dealer code is an Explorer Van. See
// lib/stock-model-rules.ts for why this is data rather than a hardcoded list.
export async function saveModelDealerRuleAction(input: {
  id: string;
  modelRaw: string;
  dealerCodes: string;
  displayName: string;
  tfNote: string;
  brokerNote: string;
  enabled: boolean;
}) {
  await requireAdmin();
  const modelRaw = input.modelRaw.trim().toUpperCase();
  const displayName = input.displayName.trim();
  const codes = parseDealerCodes(input.dealerCodes);
  if (!modelRaw) return { ok: false as const, error: "Model is required." };
  if (!displayName) return { ok: false as const, error: "Give it a name to show instead." };
  // An enabled rule with no dealer codes silently does nothing, which looks
  // identical to a rule that is working. Refuse it rather than let it sit
  // there looking configured.
  if (input.enabled && codes.length === 0) {
    return { ok: false as const, error: "Add at least one dealer code, or switch the rule off." };
  }
  const now = new Date();
  const row = {
    modelRaw,
    dealerCodes: formatDealerCodes(codes),
    displayName,
    tfNote: input.tfNote.trim() || null,
    brokerNote: input.brokerNote.trim() || null,
    enabled: input.enabled,
    updatedAt: now,
  };
  await db
    .insert(stockModelDealerRules)
    .values({ id: input.id, ...row })
    .onConflictDoUpdate({ target: stockModelDealerRules.id, set: row });
  reval();
  return { ok: true as const };
}

export async function deleteModelDealerRuleAction(id: string) {
  await requireAdmin();
  await db.delete(stockModelDealerRules).where(eq(stockModelDealerRules.id, id));
  reval();
  return { ok: true as const };
}
