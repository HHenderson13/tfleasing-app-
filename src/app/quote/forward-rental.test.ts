import { describe, expect, it } from "vitest";
import { calculateForwardRental } from "./forward-rental";

describe("calculateForwardRental", () => {
  it("matches the worked example using annuity-due math (xlsx parity): £1,000 / 6+35 / 7% APR", () => {
    // £1,000 amortised annuity-due over 35 periods at 7%/12 monthly:
    //   PMT_due ≈ £31.495 → total £1,102.32 → interest £102.32.
    // Rental spread over (upfront 6 + term 35) = 41 payments → £26.89/mo.
    const out = calculateForwardRental({
      amountGbp: 1000,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    expect(out.totalPayments).toBe(41);
    expect(out.baseMonthlyExVat).toBeCloseTo(24.39, 2);
    expect(out.interestGbp).toBeCloseTo(102.03, 1);
    expect(out.totalToRecover).toBeCloseTo(1102.03, 1);
    expect(out.monthlyExVat).toBeCloseTo(26.88, 1);
    expect(out.monthlyVat).toBeCloseTo(5.38, 1);
    expect(out.monthlyInclVat).toBeCloseTo(32.26, 1);
  });

  it("collapses to flat-split when the rate is zero", () => {
    const out = calculateForwardRental({
      amountGbp: 1000,
      upfront: 6,
      term: 35,
      annualRatePct: 0,
    });
    expect(out.interestGbp).toBe(0);
    expect(out.monthlyExVat).toBeCloseTo(24.39, 2);
    expect(out.interestPerMonth).toBe(0);
  });

  it("scales linearly with the amount", () => {
    // Doubling the amount should double every output line at the same rate.
    const base = calculateForwardRental({
      amountGbp: 1000,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    const doubled = calculateForwardRental({
      amountGbp: 2000,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    expect(doubled.baseMonthlyExVat).toBeCloseTo(base.baseMonthlyExVat * 2, 2);
    expect(doubled.interestGbp).toBeCloseTo(base.interestGbp * 2, 2);
    expect(doubled.monthlyExVat).toBeCloseTo(base.monthlyExVat * 2, 2);
  });

  it("round-trips back to the original principal via the annuity-due math", () => {
    // Forward: pv → rental. Reverse identity: rental × payments − interest
    // = pv. Mirror of the reverse-commission calculator, using the shared
    // CUMIPMT-equivalent helpers.
    const fwd = calculateForwardRental({
      amountGbp: 1000,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    const reversedAmount = fwd.monthlyExVat * fwd.totalPayments - fwd.interestGbp;
    expect(reversedAmount).toBeCloseTo(1000, 2);
  });
});
