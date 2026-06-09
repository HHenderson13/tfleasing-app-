import "server-only";
import { db } from "@/db";
import { brokerVehicleCashValues } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  computePricing,
  hasFullPricing,
  type FinanceProgramme,
  type MaybePricingComponents,
  type PricingBreakdown,
} from "./broker-pricing";

export interface VehicleKey {
  bucket: string;
  variant: string;
  derivative: string | null;
  modelYear: string | null;
}

export interface CashValueLookup {
  // Legacy fields — populated for rows that haven't been migrated to the
  // component-driven pricing yet. cashGbp is the flat customer OTR.
  cashGbp: number;
  marginGbp: number | null;
  marginPct: number | null;
  capCode: string | null;
  capId: string | null;
  notes: string | null;
  // Phase 7 — pricing components. All null on legacy rows. When all are
  // set, the quote engine computes per-programme OTRs from them; otherwise
  // it falls back to cashGbp above.
  pricing: MaybePricingComponents;
}

// Strict-match lookup. The cash-value row is keyed exactly on the broker-
// visible attributes — bucket / variant / derivative / model year — so
// the quote form can pre-fill the moment those four fields uniquely
// resolve. derivative and modelYear are nullable; we match nulls
// explicitly so an "unset" admin row pairs with "no derivative on the
// stock vehicle".
export async function findCashValue(key: VehicleKey): Promise<CashValueLookup | null> {
  // Equality on NULL doesn't match in SQL, so we branch the WHERE for
  // each combination. Cheap — only 4 variants and brokerVehicleCashValues
  // is indexed on the same columns.
  const whereClauses = [
    eq(brokerVehicleCashValues.bucket, key.bucket),
    eq(brokerVehicleCashValues.variant, key.variant),
    key.derivative === null ? undefined : eq(brokerVehicleCashValues.derivative, key.derivative),
    key.modelYear === null ? undefined : eq(brokerVehicleCashValues.modelYear, key.modelYear),
  ].filter((c): c is NonNullable<typeof c> => !!c);

  const rows = await db
    .select()
    .from(brokerVehicleCashValues)
    .where(and(...whereClauses));
  const exact = rows.find((r) =>
    (r.derivative ?? null) === key.derivative &&
    (r.modelYear ?? null) === key.modelYear,
  );
  if (!exact) return null;
  return {
    cashGbp: exact.cashGbp,
    marginGbp: exact.marginGbp,
    marginPct: exact.marginPct,
    capCode: exact.capCode,
    capId: exact.capId,
    notes: exact.notes,
    pricing: {
      retailPriceGbp: exact.retailPriceGbp,
      deliveryGbp: exact.deliveryGbp,
      pdiPlatesGbp: exact.pdiPlatesGbp,
      firstRegFeeGbp: exact.firstRegFeeGbp,
      rflGbp: exact.rflGbp,
      tradingMarginPct: exact.tradingMarginPct,
      standardsPct: exact.standardsPct,
      vetsPct: exact.vetsPct,
      oneFDiscountPct: exact.oneFDiscountPct,
      dealerProfitGbp: exact.dealerProfitGbp,
    },
  };
}

// Resolves the cash OTR a quote should use. When the row has full pricing
// components set, the breakdown is the source of truth and the legacy
// cashGbp is ignored. Otherwise we fall back to cashGbp (which is the
// same for both programmes).
export interface ResolvedProgrammePrice {
  programme: FinanceProgramme;
  cashGbp: number;
  breakdown: PricingBreakdown | null;   // null when fallback was used
}

export function resolveProgrammePrice(value: CashValueLookup, programme: FinanceProgramme): ResolvedProgrammePrice {
  if (hasFullPricing(value.pricing)) {
    const breakdown = computePricing(value.pricing, programme);
    return { programme, cashGbp: breakdown.otrGbp, breakdown };
  }
  return { programme, cashGbp: value.cashGbp, breakdown: null };
}
