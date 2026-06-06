import "server-only";
import { db } from "@/db";
import { brokerStockTurnRules } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface StockTurnContext {
  bucket: string;
  modelYear: string | null;
  gateRelease: string | null;  // ISO string from MappedStockRow
}

export interface StockTurnRule {
  id: string;
  label: string;
  bucket: string | null;
  modelYear: string | null;
  gateReleaseFrom: string | null;
  gateReleaseTo: string | null;
  mustRegisterBy: string;
  bonusGbp: number;
  notes: string | null;
  active: boolean;
}

function ruleApplies(rule: StockTurnRule, ctx: StockTurnContext): boolean {
  if (!rule.active) return false;
  // Already past the registration deadline → ineligible.
  if (new Date(rule.mustRegisterBy).getTime() < Date.now()) return false;
  if (rule.bucket && rule.bucket !== ctx.bucket) return false;
  if (rule.modelYear && rule.modelYear !== ctx.modelYear) return false;
  // Gate-release window applies only when the rule sets one. If the rule
  // has a window but the vehicle has no gate release date, treat as
  // inapplicable — broker can still add the rule manually if they know
  // it qualifies on other grounds.
  if (rule.gateReleaseFrom || rule.gateReleaseTo) {
    if (!ctx.gateRelease) return false;
    const t = new Date(ctx.gateRelease).getTime();
    if (rule.gateReleaseFrom && t < new Date(rule.gateReleaseFrom).getTime()) return false;
    if (rule.gateReleaseTo && t > new Date(rule.gateReleaseTo).getTime()) return false;
  }
  return true;
}

function toRule(row: typeof brokerStockTurnRules.$inferSelect): StockTurnRule {
  return {
    id: row.id,
    label: row.label,
    bucket: row.bucket,
    modelYear: row.modelYear,
    gateReleaseFrom: row.gateReleaseFrom ? row.gateReleaseFrom.toISOString() : null,
    gateReleaseTo: row.gateReleaseTo ? row.gateReleaseTo.toISOString() : null,
    mustRegisterBy: row.mustRegisterBy.toISOString(),
    bonusGbp: row.bonusGbp,
    notes: row.notes,
    active: row.active,
  };
}

// Returns every rule whose criteria match the vehicle, sorted by bonus
// descending so the broker sees the largest first. Phase 5 may stack
// rules; Phase 4 lets the broker pick one or none.
export async function findApplicableStockTurnRules(ctx: StockTurnContext): Promise<StockTurnRule[]> {
  const rows = await db.select().from(brokerStockTurnRules).where(eq(brokerStockTurnRules.active, true));
  return rows
    .map(toRule)
    .filter((r) => ruleApplies(r, ctx))
    .sort((a, b) => b.bonusGbp - a.bonusGbp);
}

export async function findRuleById(id: string): Promise<StockTurnRule | null> {
  const [row] = await db.select().from(brokerStockTurnRules).where(eq(brokerStockTurnRules.id, id)).limit(1);
  return row ? toRule(row) : null;
}
