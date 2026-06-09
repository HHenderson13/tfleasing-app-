import { describe, expect, it } from "vitest";
import { computePricing, hasFullPricing } from "./broker-pricing";

// Numbers below mirror the Ranger Wildtrak 3.0L row from the Stock List
// Generator pricing sheet so we know we're following Ford's intent.
const WILDTRAK_3L = {
  retailPriceGbp: 39350,
  deliveryGbp: 828,
  pdiPlatesGbp: 135,
  firstRegFeeGbp: 55,
  rflGbp: 335,
  tradingMarginPct: 8.75,
  standardsPct: 2,
  vetsPct: 0.8,
  oneFDiscountPct: 2,
  dealerProfitGbp: 500,
};

describe("computePricing", () => {
  it("1N: only trading + standards + VETS feed the discount pool", () => {
    const b = computePricing(WILDTRAK_3L, "1n");
    // Pool = 39350 × 11.55% = 4544.93
    expect(b.marginPoolPct).toBeCloseTo(11.55, 2);
    expect(b.marginPoolGbp).toBeCloseTo(4544.93, 1);
    // Discount = pool − £500 dealer profit
    expect(b.customerDiscountGbp).toBeCloseTo(4044.93, 1);
    expect(b.netVehicleGbp).toBeCloseTo(35305.07, 1);
    // OTR = net + (828 + 135 + 55 + 335)
    expect(b.deliveryCostsGbp).toBeCloseTo(1353, 1);
    expect(b.otrGbp).toBeCloseTo(36658.07, 1);
  });

  it("1F: extra discount % from the 1F programme joins the pool", () => {
    const b = computePricing(WILDTRAK_3L, "1f");
    // Pool = 39350 × 13.55% = 5331.93
    expect(b.marginPoolPct).toBeCloseTo(13.55, 2);
    expect(b.marginPoolGbp).toBeCloseTo(5331.93, 1);
    expect(b.customerDiscountGbp).toBeCloseTo(4831.93, 1);
    expect(b.otrGbp).toBeCloseTo(35871.07, 1);
  });

  it("1F always lands at or below 1N OTR (or matches when oneFDiscountPct = 0)", () => {
    const oneN = computePricing(WILDTRAK_3L, "1n");
    const oneF = computePricing(WILDTRAK_3L, "1f");
    expect(oneF.otrGbp).toBeLessThanOrEqual(oneN.otrGbp);
  });

  it("dealer profit floor: customer discount can't go negative", () => {
    const b = computePricing(
      { ...WILDTRAK_3L, tradingMarginPct: 0, standardsPct: 0, vetsPct: 0, oneFDiscountPct: 0, dealerProfitGbp: 500 },
      "1n",
    );
    expect(b.customerDiscountGbp).toBe(0);
    expect(b.netVehicleGbp).toBe(WILDTRAK_3L.retailPriceGbp);
  });
});

describe("hasFullPricing", () => {
  it("returns true when every component is numeric", () => {
    expect(hasFullPricing(WILDTRAK_3L)).toBe(true);
  });
  it("returns false when any single component is null", () => {
    expect(hasFullPricing({ ...WILDTRAK_3L, retailPriceGbp: null })).toBe(false);
    expect(hasFullPricing({ ...WILDTRAK_3L, dealerProfitGbp: null })).toBe(false);
  });
  it("accepts zeros — only nulls disqualify", () => {
    expect(hasFullPricing({ ...WILDTRAK_3L, oneFDiscountPct: 0, dealerProfitGbp: 0 })).toBe(true);
  });
  it("returns false on null", () => {
    expect(hasFullPricing(null)).toBe(false);
  });
});
