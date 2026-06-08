// Pure finance math for the broker portal's PCP / HP / HP+Balloon
// quotes. Lives outside `server-only` so the same numbers drive the
// live preview on the client form and the server-side save.
//
// Convention: APR (annual percentage rate) → monthly rate via
//   r_monthly = (1 + APR/100)^(1/12) - 1
// which is the standard UK consumer-credit compounding. At APR = 0
// we degenerate to a flat divide, identical to a zero-interest
// instalment plan.
//
// The customer pays:
//   • the deposit at time 0 (cash up-front)
//   • N monthly payments of `monthly`
//   • the balloon (PCP/HP+Bal) at month N
//
// We solve for `monthly` such that the present value of the cash
// flows equals the principal:
//   monthly × annuity_factor + balloon / (1+r)^N = principal
// where principal = vehicle_price_after_all_discounts - deposit - depositAllowance.

export interface FinanceInput {
  // Cash price the customer would have paid outright, AFTER every
  // applicable cash discount (business, stock-turn, EV cash, trade-in,
  // test-drive). The form computes this before calling.
  effectiveCashGbp: number;
  // Cash deposit the customer puts down.
  depositGbp: number;
  // Manufacturer deposit allowance — Ford money applied at signing.
  // Reduces the principal alongside the customer's own deposit.
  depositAllowanceGbp: number;
  // Term in months.
  termMonths: number;
  // Annual rate as a percentage (e.g. 5.9 for 5.9%). Already inclusive
  // of any business APR uplift the caller wants to apply.
  annualAprPct: number;
  // Balloon at end of term. 0 for HP. For PCP / HP+Balloon, looked up
  // from the OFP table on the server.
  balloonGbp: number;
}

export interface FinanceTotals {
  effectiveCashGbp: number;
  depositGbp: number;
  depositAllowanceGbp: number;
  principalGbp: number;        // amount actually financed
  balloonGbp: number;
  termMonths: number;
  annualAprPct: number;
  monthlyGbp: number;
  totalPaymentsGbp: number;    // monthly × term (excludes deposit + balloon)
  totalPayableGbp: number;     // deposit + monthly × term + balloon
  amountOfCreditGbp: number;   // principal
  totalChargeForCreditGbp: number; // totalPayable - effectiveCash + depositAllowance
}

export function computeFinance(input: FinanceInput): FinanceTotals {
  const effectiveCash = max0(round2(input.effectiveCashGbp));
  const deposit = max0(round2(input.depositGbp));
  const depositAllowance = max0(round2(input.depositAllowanceGbp));
  const balloon = max0(round2(input.balloonGbp));
  const n = Math.max(1, Math.round(input.termMonths || 0));
  const apr = max0(input.annualAprPct);

  // Principal to finance = price - deposit - manufacturer deposit allowance.
  // Cap at the price so a misconfigured allowance can't drive it negative.
  const principal = round2(Math.max(0, effectiveCash - deposit - depositAllowance));

  // Balloon larger than principal would imply the customer pays nothing
  // monthly and a positive sum at the end — nonsensical for car finance.
  // Cap balloon at principal (rare edge case from bad data).
  const balloonCapped = Math.min(balloon, principal);

  let monthly: number;
  if (apr === 0) {
    // Zero-interest: equal split of (principal − balloon) over the term.
    monthly = round2((principal - balloonCapped) / n);
  } else {
    const r = Math.pow(1 + apr / 100, 1 / 12) - 1;
    // PV of the deferred balloon: balloon / (1+r)^N
    const pvBalloon = balloonCapped / Math.pow(1 + r, n);
    // Annuity factor for N monthly payments: (1 - (1+r)^-N) / r
    const annuityFactor = (1 - Math.pow(1 + r, -n)) / r;
    const monthlyRaw = (principal - pvBalloon) / annuityFactor;
    monthly = round2(monthlyRaw);
  }
  monthly = Math.max(0, monthly);

  const totalPayments = round2(monthly * n);
  const totalPayable = round2(deposit + totalPayments + balloonCapped);
  // "Total charge for credit" in UK finance = total payable minus the
  // cash price of the goods. We treat the manufacturer deposit allowance
  // as reducing the cash price the customer is effectively paying for.
  const totalCharge = round2(totalPayable - (effectiveCash - depositAllowance));

  return {
    effectiveCashGbp: effectiveCash,
    depositGbp: deposit,
    depositAllowanceGbp: depositAllowance,
    principalGbp: principal,
    balloonGbp: balloonCapped,
    termMonths: n,
    annualAprPct: apr,
    monthlyGbp: monthly,
    totalPaymentsGbp: totalPayments,
    totalPayableGbp: totalPayable,
    amountOfCreditGbp: principal,
    totalChargeForCreditGbp: totalCharge,
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
function max0(n: number): number {
  return Math.max(0, Number.isFinite(n) ? n : 0);
}
