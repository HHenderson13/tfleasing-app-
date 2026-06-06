import "server-only";
import { db } from "@/db";
import { brokerInterestRates } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type VehicleClass = "car" | "van" | "all";
export type CustomerTypeRate = "retail" | "business";
export type FinanceRoute = "pcp" | "hp" | "hp_balloon";

export interface InterestRateContext {
  vehicleClass: VehicleClass;
  bucket: string;
  customerType: CustomerTypeRate;
  fundingRoute: FinanceRoute;
  termMonths: number;
}

export interface InterestRateMatch {
  id: string;
  label: string;
  annualAprPct: number;
  depositAllowanceGbp: number | null;
  notes: string | null;
  // Specificity score so the consumer can show "best match" vs other
  // candidates without re-doing the ranking.
  specificity: 3 | 2 | 1;
}

function inWindow(rule: typeof brokerInterestRates.$inferSelect, now = Date.now()): boolean {
  if (rule.validFrom && rule.validFrom.getTime() > now) return false;
  if (rule.validUntil && rule.validUntil.getTime() < now) return false;
  return true;
}

// Returns the single best-matching rate for a given vehicle / customer
// / route / term. Precedence:
//   1. Exact bucket match within the right class (specificity 3)
//   2. Class match with no specific bucket  (specificity 2)
//   3. vehicle_class = 'all'                (specificity 1)
//
// Within each tier we sort by updatedAt desc so the most recently
// edited row wins ties — admins typically edit the live programme last.
export async function findBestInterestRate(ctx: InterestRateContext): Promise<InterestRateMatch | null> {
  const rows = await db
    .select()
    .from(brokerInterestRates)
    .where(and(
      eq(brokerInterestRates.active, true),
      eq(brokerInterestRates.customerType, ctx.customerType),
      eq(brokerInterestRates.fundingRoute, ctx.fundingRoute),
      eq(brokerInterestRates.termMonths, ctx.termMonths),
    ));
  const candidates = rows.filter(inWindow);

  const ranked: { row: typeof candidates[number]; specificity: 3 | 2 | 1 }[] = [];
  for (const r of candidates) {
    if (r.vehicleClass === ctx.vehicleClass && r.bucket && r.bucket === ctx.bucket) {
      ranked.push({ row: r, specificity: 3 });
    } else if (r.vehicleClass === ctx.vehicleClass && !r.bucket) {
      ranked.push({ row: r, specificity: 2 });
    } else if (r.vehicleClass === "all" && !r.bucket) {
      ranked.push({ row: r, specificity: 1 });
    }
  }
  if (ranked.length === 0) return null;
  ranked.sort((a, b) =>
    b.specificity - a.specificity ||
    b.row.updatedAt.getTime() - a.row.updatedAt.getTime(),
  );
  const best = ranked[0];
  return {
    id: best.row.id,
    label: best.row.label,
    annualAprPct: best.row.annualAprPct,
    depositAllowanceGbp: best.row.depositAllowanceGbp,
    notes: best.row.notes,
    specificity: best.specificity,
  };
}

export async function listInterestRates() {
  return db
    .select()
    .from(brokerInterestRates)
    .orderBy(
      brokerInterestRates.vehicleClass,
      brokerInterestRates.bucket,
      brokerInterestRates.customerType,
      brokerInterestRates.fundingRoute,
      brokerInterestRates.termMonths,
    );
}
