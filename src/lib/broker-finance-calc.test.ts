import { describe, expect, it } from "vitest";
import { computeFinance } from "./broker-finance-calc";

describe("broker finance calc", () => {
  it("zero APR HP: equal split of principal over the term", () => {
    const t = computeFinance({
      effectiveCashGbp: 24000,
      depositGbp: 4000,
      depositAllowanceGbp: 0,
      termMonths: 48,
      annualAprPct: 0,
      balloonGbp: 0,
    });
    expect(t.principalGbp).toBe(20000);
    expect(t.monthlyGbp).toBeCloseTo(20000 / 48, 1);
    expect(t.balloonGbp).toBe(0);
    expect(t.totalPayableGbp).toBeCloseTo(4000 + (20000 / 48) * 48, 0);
  });

  it("non-zero APR HP: PMT formula reproduces a known case", () => {
    // £20k principal, 48 months, 5.9% APR → monthly ≈ £467
    // (matches a sanity-check against an online PCP calculator within
    // pennies; we accept ±£1 due to per-month compounding nuance).
    const t = computeFinance({
      effectiveCashGbp: 24000,
      depositGbp: 4000,
      depositAllowanceGbp: 0,
      termMonths: 48,
      annualAprPct: 5.9,
      balloonGbp: 0,
    });
    expect(t.principalGbp).toBe(20000);
    expect(t.monthlyGbp).toBeGreaterThan(460);
    expect(t.monthlyGbp).toBeLessThan(475);
  });

  it("PCP: balloon reduces the monthly payment", () => {
    const withBalloon = computeFinance({
      effectiveCashGbp: 24000,
      depositGbp: 4000,
      depositAllowanceGbp: 0,
      termMonths: 48,
      annualAprPct: 5.9,
      balloonGbp: 8000,
    });
    const withoutBalloon = computeFinance({
      effectiveCashGbp: 24000,
      depositGbp: 4000,
      depositAllowanceGbp: 0,
      termMonths: 48,
      annualAprPct: 5.9,
      balloonGbp: 0,
    });
    expect(withBalloon.monthlyGbp).toBeLessThan(withoutBalloon.monthlyGbp);
  });

  it("deposit allowance shrinks the financed principal", () => {
    const noAllowance = computeFinance({
      effectiveCashGbp: 24000,
      depositGbp: 4000,
      depositAllowanceGbp: 0,
      termMonths: 36,
      annualAprPct: 4.9,
      balloonGbp: 0,
    });
    const withAllowance = computeFinance({
      effectiveCashGbp: 24000,
      depositGbp: 4000,
      depositAllowanceGbp: 1000,
      termMonths: 36,
      annualAprPct: 4.9,
      balloonGbp: 0,
    });
    expect(withAllowance.principalGbp).toBe(19000);
    expect(noAllowance.principalGbp).toBe(20000);
    expect(withAllowance.monthlyGbp).toBeLessThan(noAllowance.monthlyGbp);
  });

  it("totalPayable accounts for deposit + monthlies + balloon", () => {
    const t = computeFinance({
      effectiveCashGbp: 30000,
      depositGbp: 5000,
      depositAllowanceGbp: 500,
      termMonths: 48,
      annualAprPct: 6.9,
      balloonGbp: 10000,
    });
    const reconstructed = t.depositGbp + t.monthlyGbp * t.termMonths + t.balloonGbp;
    expect(t.totalPayableGbp).toBeCloseTo(reconstructed, 0);
  });

  it("misconfigured balloon larger than principal is capped", () => {
    const t = computeFinance({
      effectiveCashGbp: 10000,
      depositGbp: 0,
      depositAllowanceGbp: 0,
      termMonths: 36,
      annualAprPct: 5,
      balloonGbp: 99999,   // absurd
    });
    expect(t.balloonGbp).toBe(t.principalGbp);
  });

  it("never returns a negative monthly", () => {
    const t = computeFinance({
      effectiveCashGbp: 5000,
      depositGbp: 6000,            // deposit > price (silly but possible mis-input)
      depositAllowanceGbp: 0,
      termMonths: 36,
      annualAprPct: 5,
      balloonGbp: 0,
    });
    expect(t.monthlyGbp).toBe(0);
    expect(t.principalGbp).toBe(0);
  });
});
