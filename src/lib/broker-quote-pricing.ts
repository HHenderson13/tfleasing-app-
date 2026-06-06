// Pure pricing helpers for broker quotes. Kept out of the server-only
// directory so the same numbers can drive the live preview on the
// client form and the server-side save action.

const VAT_RATE = 0.2;

export interface OutrightInput {
  vehicleCashGbp: number;
  commissionExVatGbp: number;
  // Optional stock-turn bonus that reduces the cash price the customer
  // pays. Cap at the cash value so a misconfigured rule can't drive the
  // total negative.
  stockTurnBonusGbp?: number;
}

export interface OutrightTotals {
  vehicleCashGbp: number;
  stockTurnBonusGbp: number;
  effectiveCashGbp: number;     // cash minus bonus, floored at 0
  commissionExVatGbp: number;
  commissionVatGbp: number;
  customerTotalGbp: number;
}

// Customer pays (vehicle cash − stock-turn bonus) + commission ex VAT
// + VAT on commission. VAT is on the commission only because the vehicle
// is sold by the dealer to the customer directly — the broker invoices
// the customer for the commission and that invoice carries VAT.
export function computeOutright(input: OutrightInput): OutrightTotals {
  const cash = Math.max(0, round2(input.vehicleCashGbp));
  const bonus = Math.max(0, round2(input.stockTurnBonusGbp ?? 0));
  const effectiveCash = round2(Math.max(0, cash - bonus));
  const commissionEx = Math.max(0, round2(input.commissionExVatGbp));
  const commissionVat = round2(commissionEx * VAT_RATE);
  const customerTotal = round2(effectiveCash + commissionEx + commissionVat);
  return {
    vehicleCashGbp: cash,
    stockTurnBonusGbp: bonus,
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
