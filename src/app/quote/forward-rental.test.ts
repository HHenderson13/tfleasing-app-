import { describe, expect, it } from "vitest";
import { calculateForwardRental } from "./forward-rental";

describe("calculateForwardRental", () => {
  it("matches the worked example: £1,000 / 6+35 / 7% APR", () => {
    // £1,000 over 41 payments without interest = £24.39 per month.
    // 7% APR over 41/12 = 3.4167 yr → £239.17 interest.
    // Total £1,239.17 ÷ 41 = £30.22 +VAT per month.
    const out = calculateForwardRental({
      amountGbp: 1000,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    expect(out.totalPayments).toBe(41);
    expect(out.baseMonthlyExVat).toBeCloseTo(24.39, 2);
    expect(out.interestGbp).toBeCloseTo(239.17, 2);
    expect(out.totalToRecover).toBeCloseTo(1239.17, 2);
    expect(out.monthlyExVat).toBeCloseTo(30.22, 2);
    expect(out.monthlyVat).toBeCloseTo(6.04, 2);
    expect(out.monthlyInclVat).toBeCloseTo(36.27, 2);
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

  it("uses the simple-interest model that mirrors the reverse calc", () => {
    // Reverse: rentals diff × payments − interest = commission
    // Forward: amount + interest = total / payments = uplifted monthly
    // Same math seen from the other direction. With £24.39 base monthly
    // → £1,000 amount, 7% APR over 41/12 = +£239.17 interest = £1,239.17
    // total ÷ 41 = £30.22 monthly. Sanity-checking the round-trip.
    const fwd = calculateForwardRental({
      amountGbp: 1000,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    // Reverse of forward: monthly × payments − interest = original amount
    const reversedAmount = fwd.monthlyExVat * fwd.totalPayments - fwd.interestGbp;
    expect(reversedAmount).toBeCloseTo(1000, 2);
  });
});
