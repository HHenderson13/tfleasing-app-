import "server-only";
import { db } from "@/db";
import {
  brokerBusinessDiscounts,
  brokerEvOffers,
  brokerTestDriveOffers,
  brokerTradeInOffers,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export type CustomerType = "retail" | "business";
export type FundingRouteAll = "outright" | "pcp" | "hp" | "hp_balloon" | "contract_hire";
export type VehicleClass = "car" | "van";

export interface IncentiveContext {
  vehicleClass: VehicleClass;
  bucket: string;
  customerType: CustomerType;
  customerIsVatBusiness: boolean;
  fundingRoute: FundingRouteAll;
  isEv: boolean;
}

export interface EvOfferOption {
  id: string;
  label: string;
  cashAlternativeGbp: number;
  wallboxLabel: string;
}

export interface TradeInOption {
  id: string;
  label: string;
  amountGbp: number;
  termsText: string;
}

export interface TestDriveOption {
  id: string;
  label: string;
  amountGbp: number;
  termsText: string | null;
}

export interface BusinessDiscountOption {
  id: string;
  label: string;
  extraDiscountPct: number;
  aprUpliftPct: number;
  notes: string | null;
}

function inWindow<T extends { validFrom: Date | null; validUntil: Date | null }>(r: T, now = Date.now()): boolean {
  if (r.validFrom && r.validFrom.getTime() > now) return false;
  if (r.validUntil && r.validUntil.getTime() < now) return false;
  return true;
}

function matchesClass(rowClass: string | null, ctx: { vehicleClass: VehicleClass }): boolean {
  if (!rowClass || rowClass === "all") return true;
  return rowClass === ctx.vehicleClass;
}

function matchesBucket(rowBucket: string | null, ctx: { bucket: string }): boolean {
  if (!rowBucket) return true;
  return rowBucket === ctx.bucket;
}

// ─── EV ─────────────────────────────────────────────────────────────────────

export async function findEvOffer(ctx: IncentiveContext): Promise<EvOfferOption | null> {
  if (!ctx.isEv) return null;
  const rows = await db.select().from(brokerEvOffers).where(eq(brokerEvOffers.active, true));
  const valid = rows.filter(inWindow);
  // Pick the most-recently-updated active offer — admin stages future
  // quarters by adding a new row and disabling the old one when it
  // expires. Latest-edited wins ties on the rare overlap.
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const best = valid[0];
  return {
    id: best.id,
    label: best.label,
    cashAlternativeGbp: best.cashAlternativeGbp,
    wallboxLabel: best.wallboxLabel,
  };
}

export async function findEvOfferById(id: string): Promise<EvOfferOption | null> {
  const [row] = await db.select().from(brokerEvOffers).where(eq(brokerEvOffers.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    cashAlternativeGbp: row.cashAlternativeGbp,
    wallboxLabel: row.wallboxLabel,
  };
}

// ─── Trade-in ───────────────────────────────────────────────────────────────

export async function findTradeInOffers(ctx: IncentiveContext): Promise<TradeInOption[]> {
  const rows = await db.select().from(brokerTradeInOffers).where(eq(brokerTradeInOffers.active, true));
  return rows
    .filter(inWindow)
    .filter((r) => matchesClass(r.vehicleClass, ctx))
    .filter((r) => matchesBucket(r.bucket, ctx))
    .sort((a, b) => b.amountGbp - a.amountGbp)
    .map((r) => ({ id: r.id, label: r.label, amountGbp: r.amountGbp, termsText: r.termsText }));
}

export async function findTradeInOfferById(id: string): Promise<TradeInOption | null> {
  const [row] = await db.select().from(brokerTradeInOffers).where(eq(brokerTradeInOffers.id, id)).limit(1);
  if (!row) return null;
  return { id: row.id, label: row.label, amountGbp: row.amountGbp, termsText: row.termsText };
}

// ─── Test drive ─────────────────────────────────────────────────────────────

export async function findTestDriveOffers(ctx: IncentiveContext): Promise<TestDriveOption[]> {
  const rows = await db.select().from(brokerTestDriveOffers).where(eq(brokerTestDriveOffers.active, true));
  return rows
    .filter(inWindow)
    .filter((r) => matchesClass(r.vehicleClass, ctx))
    .filter((r) => matchesBucket(r.bucket, ctx))
    .sort((a, b) => b.amountGbp - a.amountGbp)
    .map((r) => ({ id: r.id, label: r.label, amountGbp: r.amountGbp, termsText: r.termsText }));
}

export async function findTestDriveOfferById(id: string): Promise<TestDriveOption | null> {
  const [row] = await db.select().from(brokerTestDriveOffers).where(eq(brokerTestDriveOffers.id, id)).limit(1);
  if (!row) return null;
  return { id: row.id, label: row.label, amountGbp: row.amountGbp, termsText: row.termsText };
}

// ─── Business discount ──────────────────────────────────────────────────────

// Business discount only applies to customers flagged as VAT-registered
// business. Returns null when not applicable. For outright purchases,
// the apr_uplift_pct is captured for audit but has no effect — for
// finance routes (Phase 5) it boosts the APR on top of the base rate.
export async function findBusinessDiscount(ctx: IncentiveContext): Promise<BusinessDiscountOption | null> {
  if (ctx.customerType !== "business" || !ctx.customerIsVatBusiness) return null;
  const rows = await db.select().from(brokerBusinessDiscounts).where(eq(brokerBusinessDiscounts.active, true));
  const valid = rows
    .filter(inWindow)
    .filter((r) => matchesClass(r.vehicleClass, ctx))
    .filter((r) => matchesBucket(r.bucket, ctx))
    .filter((r) => !r.fundingRoute || r.fundingRoute === ctx.fundingRoute);
  if (valid.length === 0) return null;
  // Most specific match wins: bucket-specific > class-specific > generic.
  valid.sort((a, b) => {
    const aSpec = (a.bucket ? 4 : 0) + (a.vehicleClass ? 2 : 0) + (a.fundingRoute ? 1 : 0);
    const bSpec = (b.bucket ? 4 : 0) + (b.vehicleClass ? 2 : 0) + (b.fundingRoute ? 1 : 0);
    return bSpec - aSpec || b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const best = valid[0];
  return {
    id: best.id,
    label: best.label,
    extraDiscountPct: best.extraDiscountPct,
    aprUpliftPct: best.aprUpliftPct,
    notes: best.notes,
  };
}

export async function findBusinessDiscountById(id: string): Promise<BusinessDiscountOption | null> {
  const [row] = await db.select().from(brokerBusinessDiscounts).where(eq(brokerBusinessDiscounts.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    extraDiscountPct: row.extraDiscountPct,
    aprUpliftPct: row.aprUpliftPct,
    notes: row.notes,
  };
}
