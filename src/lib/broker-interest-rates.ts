import "server-only";
import { db } from "@/db";
import { brokerInterestRates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { FinanceProgramme } from "./broker-pricing";

export type VehicleClass = "car" | "van" | "all";
export type CustomerTypeRate = "retail" | "business";
export type FinanceRoute = "pcp" | "hp" | "hp_balloon";

export interface InterestRateContext {
  vehicleClass: VehicleClass;
  bucket: string;
  customerType: CustomerTypeRate;
  financeProgramme: FinanceProgramme;       // '1n' | '1f'
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
  // candidates without re-doing the ranking. Higher = more specific.
  // We score on (bucket vs class vs all) × (programme-exact vs programme-null).
  specificity: number;
}

function inWindow(rule: typeof brokerInterestRates.$inferSelect, now = Date.now()): boolean {
  if (rule.validFrom && rule.validFrom.getTime() > now) return false;
  if (rule.validUntil && rule.validUntil.getTime() < now) return false;
  return true;
}

// Returns the single best-matching rate for a given vehicle / customer
// / programme / route / term.
//
// Specificity layers (most specific wins):
//   • bucket match    (+4) vs class match (+2) vs 'all' match (+1)
//   • programme exact (+10) vs programme null/legacy (+0)
//
// Programme exact beats bucket — a 1N-only Focus rate trumps an
// all-programmes any-Focus rate, because the programme dimension is
// the financial choice the customer is committing to. Legacy rows
// (financeProgramme = null) still apply but rank below any explicit
// programme-keyed row.
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

  const ranked: { row: typeof candidates[number]; specificity: number }[] = [];
  for (const r of candidates) {
    let score = 0;
    // Vehicle scope
    if (r.vehicleClass === ctx.vehicleClass && r.bucket && r.bucket === ctx.bucket) score += 4;
    else if (r.vehicleClass === ctx.vehicleClass && !r.bucket) score += 2;
    else if (r.vehicleClass === "all" && !r.bucket) score += 1;
    else continue; // scope doesn't match at all
    // Programme dimension
    if (r.financeProgramme === ctx.financeProgramme) score += 10;
    else if (r.financeProgramme === null) score += 0;
    else continue; // explicit different programme — disqualified
    ranked.push({ row: r, specificity: score });
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
      brokerInterestRates.financeProgramme,
      brokerInterestRates.fundingRoute,
      brokerInterestRates.termMonths,
    );
}
