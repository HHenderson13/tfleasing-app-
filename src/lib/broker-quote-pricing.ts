// Pure pricing helpers for broker quotes. Kept out of the server-only
// directory so the same numbers can drive the live preview on the
// client form and the server-side save action.

const VAT_RATE = 0.2;

export interface OutrightInput {
  vehicleCashGbp: number;
  commissionExVatGbp: number;
  // All deductions are optional. They stack additively before
  // commission is added back on top. Floored at zero so a
  // mis-configured rule can't drive the customer total negative.
  stockTurnBonusGbp?: number;
  evCashGbp?: number;
  tradeInGbp?: number;
  testDriveGbp?: number;
  // Business discount is expressed as a % off the vehicle cash for the
  // VAT-registered business customer. Applied to the pre-bonus cash
  // figure so admins can layer it on top of a stock-turn or trade-in
  // without one eating the other.
  businessDiscountPct?: number;
}

export interface OutrightTotals {
  vehicleCashGbp: number;
  businessDiscountGbp: number;
  stockTurnBonusGbp: number;
  evCashGbp: number;
  tradeInGbp: number;
  testDriveGbp: number;
  effectiveCashGbp: number;     // cash after all deductions, floored at 0
  commissionExVatGbp: number;
  commissionVatGbp: number;
  customerTotalGbp: number;
}

// Customer pays (vehicle cash − every applicable discount) + commission
// ex VAT + VAT on commission. VAT sits on the commission only because the
// vehicle is sold by the dealer to the customer directly.
export function computeOutright(input: OutrightInput): OutrightTotals {
  const cash = Math.max(0, round2(input.vehicleCashGbp));
  const businessDiscountPct = Math.max(0, input.businessDiscountPct ?? 0);
  const businessDiscount = round2(cash * (businessDiscountPct / 100));
  const stockTurn = Math.max(0, round2(input.stockTurnBonusGbp ?? 0));
  const evCash = Math.max(0, round2(input.evCashGbp ?? 0));
  const tradeIn = Math.max(0, round2(input.tradeInGbp ?? 0));
  const testDrive = Math.max(0, round2(input.testDriveGbp ?? 0));
  const totalDeductions = businessDiscount + stockTurn + evCash + tradeIn + testDrive;
  const effectiveCash = round2(Math.max(0, cash - totalDeductions));
  const commissionEx = Math.max(0, round2(input.commissionExVatGbp));
  const commissionVat = round2(commissionEx * VAT_RATE);
  const customerTotal = round2(effectiveCash + commissionEx + commissionVat);
  return {
    vehicleCashGbp: cash,
    businessDiscountGbp: businessDiscount,
    stockTurnBonusGbp: stockTurn,
    evCashGbp: evCash,
    tradeInGbp: tradeIn,
    testDriveGbp: testDrive,
    effectiveCashGbp: effectiveCash,
    commissionExVatGbp: commissionEx,
    commissionVatGbp: commissionVat,
    customerTotalGbp: customerTotal,
  };
}

export function formatGbp(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export const FUNDING_ROUTES = {
  outright: "Outright Purchase",
  pcp: "PCP",
  hp: "Hire Purchase",
  hp_balloon: "Hire Purchase with Balloon",
  contract_hire: "Contract Hire",
} as const;

export type FundingRoute = keyof typeof FUNDING_ROUTES;
