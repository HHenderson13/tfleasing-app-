// Ford pricing model — derives the customer's cash OTR from the
// per-derivative components TF admin maintains, for both finance
// programmes (1N / Retail vs 1F / Business VAT Registered).
//
// Background (FCE Broker Calculator + Stock List Generator):
// Ford prices a vehicle as:
//   RETAIL_PRICE (manufacturer RRP)
//     − customer discount drawn from a margin pool
//     + DELIVERY + PDI_PLATES + 1ST_REG_FEE + RFL
//
// The margin pool is the sum of TRADING_MARGIN, STANDARDS, VETS, and —
// only when the customer takes 1F finance — the 1F discount %. TF
// retains DEAL_PROFIT as the floor of its margin; everything left in
// the pool passes to the customer as a price reduction. The 1F
// programme therefore gives a cheaper vehicle but typically with a
// higher APR; 1N is the opposite.

export type FinanceProgramme = "1n" | "1f";

export const FINANCE_PROGRAMME_LABELS: Record<FinanceProgramme, string> = {
  "1n": "Retail (1N)",
  "1f": "Business VAT Registered (1F)",
};

export const FINANCE_PROGRAMME_SHORT: Record<FinanceProgramme, string> = {
  "1n": "1N",
  "1f": "1F",
};

export interface PricingComponents {
  retailPriceGbp: number;
  deliveryGbp: number;
  pdiPlatesGbp: number;
  firstRegFeeGbp: number;
  rflGbp: number;
  tradingMarginPct: number;
  standardsPct: number;
  vetsPct: number;
  oneFDiscountPct: number;
  dealerProfitGbp: number;
}

// Mirror of brokerVehicleCashValues columns: every component nullable so
// we can detect "this row hasn't been fully migrated yet".
export interface MaybePricingComponents {
  retailPriceGbp: number | null;
  deliveryGbp: number | null;
  pdiPlatesGbp: number | null;
  firstRegFeeGbp: number | null;
  rflGbp: number | null;
  tradingMarginPct: number | null;
  standardsPct: number | null;
  vetsPct: number | null;
  oneFDiscountPct: number | null;
  dealerProfitGbp: number | null;
}

export interface PricingBreakdown {
  programme: FinanceProgramme;
  retailPriceGbp: number;
  marginPoolPct: number;            // total pool %, including 1F when programme = 1f
  marginPoolGbp: number;
  dealerProfitGbp: number;
  customerDiscountGbp: number;      // margin pool − dealer profit, floor 0
  netVehicleGbp: number;            // retail − discount
  deliveryCostsGbp: number;         // delivery + PDI + 1st reg + RFL
  otrGbp: number;                   // net + delivery costs — the "cash" the customer pays
}

// Retail price + delivery costs only. Used when admin hasn't filled in
// the discount stack yet — the cash field on the row remains
// authoritative until they do.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function hasFullPricing(c: MaybePricingComponents | null | undefined): c is PricingComponents & MaybePricingComponents {
  if (!c) return false;
  return (
    c.retailPriceGbp !== null && Number.isFinite(c.retailPriceGbp) &&
    c.deliveryGbp !== null && Number.isFinite(c.deliveryGbp) &&
    c.pdiPlatesGbp !== null && Number.isFinite(c.pdiPlatesGbp) &&
    c.firstRegFeeGbp !== null && Number.isFinite(c.firstRegFeeGbp) &&
    c.rflGbp !== null && Number.isFinite(c.rflGbp) &&
    c.tradingMarginPct !== null && Number.isFinite(c.tradingMarginPct) &&
    c.standardsPct !== null && Number.isFinite(c.standardsPct) &&
    c.vetsPct !== null && Number.isFinite(c.vetsPct) &&
    c.oneFDiscountPct !== null && Number.isFinite(c.oneFDiscountPct) &&
    c.dealerProfitGbp !== null && Number.isFinite(c.dealerProfitGbp)
  );
}

export function computePricing(p: PricingComponents, programme: FinanceProgramme): PricingBreakdown {
  const oneFPct = programme === "1f" ? p.oneFDiscountPct : 0;
  const marginPoolPct = p.tradingMarginPct + p.standardsPct + p.vetsPct + oneFPct;
  const marginPool = round2(p.retailPriceGbp * marginPoolPct / 100);
  const customerDiscount = Math.max(0, round2(marginPool - p.dealerProfitGbp));
  const netVehicle = round2(p.retailPriceGbp - customerDiscount);
  const deliveryCosts = round2(p.deliveryGbp + p.pdiPlatesGbp + p.firstRegFeeGbp + p.rflGbp);
  const otr = round2(netVehicle + deliveryCosts);
  return {
    programme,
    retailPriceGbp: round2(p.retailPriceGbp),
    marginPoolPct,
    marginPoolGbp: marginPool,
    dealerProfitGbp: round2(p.dealerProfitGbp),
    customerDiscountGbp: customerDiscount,
    netVehicleGbp: netVehicle,
    deliveryCostsGbp: deliveryCosts,
    otrGbp: otr,
  };
}
