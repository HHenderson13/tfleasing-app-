import { describe, expect, it } from "vitest";
import { calculateReverseCommission } from "./reverse-commission";

describe("calculateReverseCommission", () => {
  it("matches the worked example using annuity-due math (xlsx parity)", () => {
    // Broker £400, TF £350, upfront 6 + term 35 → 41 payments, gross
    // uplift £2,050. With APR 7% the broker commission is the present
    // value of that stream amortised annuity-due over 35 periods.
    // Total paid £2,050 / 35 ≈ £58.57 PMT_due, PV factor at 7%/12 over
    // 35 months ≈ 31.769 → PV ≈ £1,860.20, interest ≈ £189.80.
    const out = calculateReverseCommission({
      brokerRentalGbp: 400,
      tfRentalGbp: 350,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    expect(out.totalPayments).toBe(41);
    expect(out.diffPerMonth).toBe(50);
    expect(out.upsoldTotal).toBe(2050);
    expect(out.interestGbp).toBeCloseTo(189.80, 1);
    expect(out.commissionInclVat).toBeCloseTo(1860.20, 1);
    expect(out.commissionExVat + out.vat).toBeCloseTo(out.commissionInclVat, 6);
  });

  it("returns 0 interest when broker rental matches TF rental", () => {
    const out = calculateReverseCommission({
      brokerRentalGbp: 350,
      tfRentalGbp: 350,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    expect(out.upsoldTotal).toBe(0);
    expect(out.interestGbp).toBe(0);
    expect(out.commissionInclVat).toBe(0);
  });

  it("returns the gross when the rate is zero", () => {
    const out = calculateReverseCommission({
      brokerRentalGbp: 400,
      tfRentalGbp: 350,
      upfront: 6,
      term: 35,
      annualRatePct: 0,
    });
    expect(out.commissionInclVat).toBe(2050);
    expect(out.interestGbp).toBe(0);
  });

  it("returns a negative commission when TF rental is higher than broker", () => {
    // Negative upsell: no interest gets layered on top of an already-negative
    // figure, because there's no upsold balance to charge a finance cost on.
    const out = calculateReverseCommission({
      brokerRentalGbp: 300,
      tfRentalGbp: 350,
      upfront: 6,
      term: 35,
      annualRatePct: 7,
    });
    expect(out.diffPerMonth).toBe(-50);
    expect(out.upsoldTotal).toBe(-2050);
    expect(out.interestGbp).toBe(0);
    expect(out.commissionInclVat).toBe(-2050);
  });
});
