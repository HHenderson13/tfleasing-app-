import { describe, expect, it } from "vitest";
import { solveAnnualRate, solveAllTerms } from "./interest-rate-solver";

describe("solveAnnualRate", () => {
  // From the original Python solver's docstring: 1+23=£1646.16 and 12+23=£1104.53
  // is given as an exemplar. The exact rate isn't published in the docstring,
  // but the system is well-defined so we re-solve and pin against round-trip
  // consistency (see below) plus a known seeded ALD 23m rate.
  it("recovers a known small-rate example exactly", () => {
    // Construct a synthetic exact pair using the formula so the answer is
    // independent of any external table:
    //   rental_1  × A(r, sub, 1)  = rental_12 × A(r, sub, 12)
    // Pick r=0.07/12 (monthly), sub=23. Compute the implied rental ratio.
    const monthly = 0.07 / 12;
    const sub = 23;
    const aDue = (adv: number) => adv + (1 - Math.pow(1 + monthly, -sub)) / monthly;
    const ratio = aDue(12) / aDue(1); // rental_1 / rental_12
    const rental12 = 1000;
    const rental1 = rental12 * ratio;

    const solved = solveAnnualRate(sub, rental1, rental12);
    // Allow micro tolerance for bisection precision.
    expect(solved).toBeCloseTo(0.07, 4);
  });

  it("rejects rental pairs where 12-adv is not cheaper", () => {
    expect(() => solveAnnualRate(23, 100, 110)).toThrow(/must be lower/);
    expect(() => solveAnnualRate(23, 100, 100)).toThrow(/must be lower/);
  });

  it("rejects pairs whose implied rate is outside the search bracket", () => {
    // Almost-equal rentals imply a near-zero rate, which the bisection
    // accepts. We test the opposite: an implausibly large gap.
    expect(() => solveAnnualRate(23, 10_000, 100)).toThrow();
  });

  it("survives a long 47-month term at typical ALD rates", () => {
    const monthly = 0.0684 / 12; // close to seeded ALD 47 rate
    const sub = 47;
    const aDue = (adv: number) => adv + (1 - Math.pow(1 + monthly, -sub)) / monthly;
    const rental12 = 250;
    const rental1 = rental12 * (aDue(12) / aDue(1));
    const solved = solveAnnualRate(sub, rental1, rental12);
    expect(solved).toBeCloseTo(0.0684, 4);
  });
});

describe("solveAllTerms", () => {
  it("returns null rate (no error) when both quotes are absent", () => {
    const rows = solveAllTerms({});
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.annualRate).toBeNull();
      expect(r.error).toBeNull();
    }
  });

  it("flags errors per-term without failing the whole solve", () => {
    const rows = solveAllTerms({
      23: { rental1Adv: 100, rental12Adv: 110 }, // bad: 12+ >= 1+
      35: { rental1Adv: 0, rental12Adv: 0 },     // skipped: zeros are falsy
    });
    const r23 = rows.find((r) => r.termFollowOns === 23)!;
    expect(r23.annualRate).toBeNull();
    expect(r23.error).toMatch(/must be lower/);

    const r35 = rows.find((r) => r.termFollowOns === 35)!;
    expect(r35.annualRate).toBeNull();
    expect(r35.error).toBeNull(); // zero-input rows are skipped silently
  });

  it("computes per-month and per-term saving when both quotes are present", () => {
    const rows = solveAllTerms({
      23: { rental1Adv: 1646.16, rental12Adv: 1104.53 },
    });
    const r = rows.find((x) => x.termFollowOns === 23)!;
    expect(r.savingPerMonth).toBeCloseTo(541.63, 2);
    // Total: (1+23)*1646.16 − (12+23)*1104.53 = 39507.84 − 38658.55 = 849.29
    expect(r.savingOverTerm).toBeCloseTo(849.29, 2);
    // And the rate must be > 0 (small but positive).
    expect(r.annualRate).not.toBeNull();
    expect(r.annualRate!).toBeGreaterThan(0);
  });
});
