import { db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { ratebook, vehicles, modelDiscounts, funders, funderCommission } from "@/db/schema";
import { defaultDiscountKey } from "./discount-map";

export type Contract = "PCH" | "BCH";
export type Maintenance = "customer" | "maintained";

export interface QuoteInput {
  contract: Contract;
  model: string;
  derivative: string;
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier?: number;
  maintenance: Maintenance;
  wallbox?: boolean;
}

export interface FunderQuote {
  funderId: string;
  funderName: string;
  monthlyRental: number;
  monthlyMaintenance: number;
  totalMonthly: number;
  discountPct: number | null;
  commissionGbp: number;
  novunaChipPct: number;
  rank: number;
}

export interface MissingFunder {
  funderId: string;
  funderName: string;
  discountPct: number | null;
  commissionGbp: number;
}

export interface QuoteResult {
  capCode: string;
  model: string;
  derivative: string;
  listPriceNet: number | null;
  discountId: string | null;
  discountLabel: string | null;
  grantText: string | null;
  customerSavingGbp: number | null;
  wallboxAvailable: boolean;
  wallboxIncluded: boolean;
  funders: FunderQuote[];
  missing: MissingFunder[];
}

export async function getQuote(input: QuoteInput): Promise<QuoteResult> {
  const irm = input.initialRentalMultiplier ?? 6;
  // Ratebook is BCH-only; PCH = BCH × 1.2 (VAT).
  const vatMultiplier = input.contract === "PCH" ? 1.2 : 1;
  const isMaintained = input.maintenance === "maintained";

  const v = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.model, input.model), eq(vehicles.derivative, input.derivative)))
    .limit(1);

  if (!v.length) {
    return {
      capCode: "", model: input.model, derivative: input.derivative,
      listPriceNet: null, discountId: null, discountLabel: null,
      grantText: null, customerSavingGbp: null,
      wallboxAvailable: false, wallboxIncluded: false,
      funders: [], missing: [],
    };
  }
  const vehicle = v[0];

  // Resolve discount: stored key on vehicle, else fall back to heuristic map.
  const discountId = vehicle.discountKey ?? defaultDiscountKey(vehicle.model);
  const md = discountId
    ? (await db.select().from(modelDiscounts).where(eq(modelDiscounts.id, discountId)).limit(1))[0]
    : undefined;
  const baseDiscount = md ? md.termsPct + md.dealerPct : null;
  const additionalDiscountsGbp = md?.additionalDiscountsGbp ?? 0;
  const novunaChip = input.termMonths === 36
    ? (md?.novunaChip3Yr ?? 0)
    : input.termMonths === 48
      ? (md?.novunaChip4Yr ?? 0)
      : 0;

  // Wallbox option: only on passenger EVs (non-van) that have a customer saving.
  // When wallbox is chosen, the customer saving isn't given as a discount — it's
  // spent on the wallbox — so the monthly rental rises by saving / payment count,
  // where payment count is IRM + (term - 1) (e.g. 6+35 for 36m at 6×).
  const wallboxAvailable = !vehicle.isVan && (md?.customerSavingGbp ?? 0) > 0;
  const wallboxIncluded = !!input.wallbox && wallboxAvailable;
  const paymentCount = input.termMonths + irm - 1;
  const savingPerMonth = wallboxIncluded && md?.customerSavingGbp
    ? md.customerSavingGbp / paymentCount
    : 0;
  const savingPct = wallboxIncluded && md?.customerSavingGbp && vehicle.listPriceNet && vehicle.listPriceNet > 0
    ? md.customerSavingGbp / vehicle.listPriceNet
    : 0;

  const allFunders = await db.select().from(funders);
  const results: FunderQuote[] = [];
  const missing: MissingFunder[] = [];

  for (const f of allFunders) {
    const comm = await db
      .select()
      .from(funderCommission)
      .where(and(
        eq(funderCommission.funderId, f.id),
        eq(funderCommission.contract, input.contract),
        eq(funderCommission.maintenance, input.maintenance),
      ))
      .limit(1);
    const commissionGbp = comm[0]?.commissionGbp ?? 0;
    // Per-funder effective discount: base Terms+Dealer % plus (commission + additional £) / BLP.
    // BLP may be null; if so £ terms cannot be converted to % so we omit them.
    let discountPct: number | null = null;
    if (baseDiscount !== null) {
      const blp = vehicle.listPriceNet;
      const extrasPct = blp && blp > 0 ? (commissionGbp + additionalDiscountsGbp) / blp : 0;
      const chipPct = f.id === "novuna" ? novunaChip : 0;
      discountPct = baseDiscount + extrasPct + chipPct - savingPct;
    }

    const rb = await db
      .select()
      .from(ratebook)
      .where(and(
        eq(ratebook.funderId, f.id),
        eq(ratebook.capCode, vehicle.capCode),
        eq(ratebook.termMonths, input.termMonths),
        eq(ratebook.annualMileage, input.annualMileage),
        eq(ratebook.initialRentalMultiplier, irm),
        eq(ratebook.isBusiness, true),
        eq(ratebook.isMaintained, isMaintained),
      ))
      .limit(1);
    if (!rb.length) {
      missing.push({ funderId: f.id, funderName: f.name, discountPct, commissionGbp });
      continue;
    }
    const row = rb[0];
    const monthlyRental = row.monthlyRental * vatMultiplier + savingPerMonth;
    const monthlyMaintenance = row.monthlyMaintenance * vatMultiplier;
    results.push({
      funderId: f.id,
      funderName: f.name,
      monthlyRental,
      monthlyMaintenance,
      totalMonthly: monthlyRental + monthlyMaintenance,
      discountPct,
      commissionGbp,
      novunaChipPct: f.id === "novuna" ? novunaChip : 0,
      rank: 0,
    });
  }

  // Rank by cheapest total monthly rental first.
  results.sort((a, b) => a.totalMonthly - b.totalMonthly);
  results.forEach((r, i) => (r.rank = i + 1));

  return {
    capCode: vehicle.capCode,
    model: vehicle.model,
    derivative: vehicle.derivative,
    listPriceNet: vehicle.listPriceNet,
    discountId: md?.id ?? null,
    discountLabel: md?.label ?? null,
    grantText: md?.grantText ?? null,
    customerSavingGbp: wallboxIncluded ? null : (md?.customerSavingGbp ?? null),
    wallboxAvailable,
    wallboxIncluded,
    funders: results,
    missing,
  };
}

export async function listModels(): Promise<string[]> {
  const rows = await db.all<{ model: string }>(sql`
    SELECT DISTINCT v.model FROM vehicles v
    WHERE v.model != 'Unknown'
      AND EXISTS (SELECT 1 FROM ratebook r WHERE r.cap_code = v.cap_code)
    ORDER BY v.model
  `);
  return rows.map((r) => r.model);
}
export async function listDerivatives(model: string): Promise<string[]> {
  const rows = await db.all<{ derivative: string }>(sql`
    SELECT DISTINCT v.derivative FROM vehicles v
    WHERE v.model = ${model}
      AND EXISTS (SELECT 1 FROM ratebook r WHERE r.cap_code = v.cap_code)
    ORDER BY v.derivative
  `);
  return rows.map((r) => r.derivative);
}
