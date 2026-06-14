import { describe, expect, it } from "vitest";
import { calculateReverseCommission } from "./reverse-commission";

describe("calculateReverseCommission", () => {
  it("matches the worked example from the spec", () => {
    // Broker £400, TF £350, upfront 6 + term 35 → 41 payments,
    // upsold £2,050, interest @ 7% over 41/12yr = £2,050 × 0.07 × 3.4166 =
    // £490.29, commission = £2,050 − £490.29 = £1,559.71.
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
    expect(out.interestGbp).toBeCloseTo(490.29, 1);
    expect(out.commissionInclVat).toBeCloseTo(1559.71, 1);
    // Ex-VAT and VAT components should sum back to inc-VAT.
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
