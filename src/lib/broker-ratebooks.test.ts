import { describe, expect, it } from "vitest";
import {
  IRM_OUTPUT,
  buildBrokerRows,
  expandIrms,
  mergePerSlot,
  type InterestRateMap,
  type MergedSlot,
  type SourceRow,
} from "./broker-ratebooks";

// Minimal fixture builder. The fields we test against (capCode, term, mileage,
// isMaintained, rental, maintenance, funderId/Name) are the only ones that
// affect the math; the rest are filler.
function row(over: Partial<SourceRow> & {
  funderId: string;
  capCode: string;
  termMonths: number;
  annualMileage: number;
  isMaintained: boolean;
  monthlyRental: number;
  monthlyMaintenance?: number;
}): SourceRow {
  return {
    funderName: over.funderId.toUpperCase(),
    capId: null,
    monthlyMaintenance: 0,
    model: "Focus",
    derivative: "Titanium",
    isVan: false,
    fuelType: "Petrol",
    listPriceNet: 20000,
    excessMileage: null,
    manufacturer: "Ford",
    ...over,
  } as SourceRow;
}

const NO_RATES: InterestRateMap = new Map(); // forces DEFAULT_ANNUAL_RATE = 7%

function slot(over: Partial<MergedSlot> = {}): MergedSlot {
  return {
    capCode: "X",
    capId: null,
    manufacturer: "Ford",
    model: "Focus",
    derivative: "Titanium",
    termMonths: 36,
    annualMileage: 8000,
    excessMileage: null,
    isVan: false,
    fuelType: "Petrol",
    bareRental: 300,
    rentalFunderId: "ald",
    rentalFunderName: "ALD",
    maintenance: 30,
    maintenanceFunderId: "ald",
    maintenanceFunderName: "ALD",
    ...over,
  };
}

describe("expandIrms — base math (no commission, no rate)", () => {
  // From the original spec: rental £300/mo on 3-year (term 36, followOns 35)
  // with 6× upfront means total = (6 + 35) × 300 = £12,300, which redistributes:
  //   1× upfront →  12,300 / (1 + 35) = 341.67
  //  12× upfront →  12,300 / (12 + 35) = 261.70
  it("redistributes the total contract cost across upfront options", () => {
    const rates: InterestRateMap = new Map([["ald|35", 0]]); // override rate to zero
    const rows = expandIrms(slot({ bareRental: 300, termMonths: 36, maintenance: 0 }), 0, rates);

    const irm = (n: number) => rows.find((r) => r.initialRentalMultiplier === n)!;
    expect(irm(1).monthlyRental).toBeCloseTo(341.67, 2);
    expect(irm(6).monthlyRental).toBeCloseTo(300.00, 2); // sanity: 6× returns the bare rental
    expect(irm(12).monthlyRental).toBeCloseTo(261.70, 2);
  });

  it("emits exactly one row per published IRM", () => {
    const rows = expandIrms(slot(), 0, NO_RATES);
    expect(rows).toHaveLength(IRM_OUTPUT.length);
    expect(new Set(rows.map((r) => r.initialRentalMultiplier))).toEqual(new Set(IRM_OUTPUT));
  });
});

describe("expandIrms — commission amortization", () => {
  it("at rate=0, commission collapses to a flat per-payment split", () => {
    // £750 commission over 9+23 = 32 payments → £750 / 32 = £23.4375
    const rates: InterestRateMap = new Map([["ald|23", 0]]);
    const rows = expandIrms(slot({ termMonths: 24, bareRental: 300, maintenance: 0 }), 750, rates);

    const at9 = rows.find((r) => r.initialRentalMultiplier === 9)!;
    // Bare-at-9 = (6+23)*300 / (9+23) = 8700/32 = 271.875
    // Plus 750/32 = 23.4375 → 295.31
    expect(at9.monthlyRental).toBeCloseTo(295.31, 2);
  });

  it("at rate>0, more upfront → smaller per-month addition", () => {
    // Sanity check the directionality the user asked for: higher deposit
    // spreads the financed commission over more payments → smaller addition.
    const rates: InterestRateMap = new Map([["ald|35", 0.07]]);
    const rows = expandIrms(slot({ termMonths: 36, bareRental: 300, maintenance: 0 }), 750, rates);

    const at1  = rows.find((r) => r.initialRentalMultiplier === 1)!;
    const at12 = rows.find((r) => r.initialRentalMultiplier === 12)!;
    // The commission share is rental − bare share; bare share differs too, so
    // compare commission contribution directly.
    const bareAt1 = (6 + 35) * 300 / (1 + 35);
    const bareAt12 = (6 + 35) * 300 / (12 + 35);
    const commAt1 = at1.monthlyRental - bareAt1;
    const commAt12 = at12.monthlyRental - bareAt12;
    expect(commAt1).toBeGreaterThan(commAt12);
    // With non-zero rate, commission addition exceeds the flat split.
    expect(commAt1).toBeGreaterThan(750 / (1 + 35));
    expect(commAt12).toBeGreaterThan(750 / (12 + 35));
  });

  it("falls back to the DEFAULT 7% rate when no rate is configured for (funder, term)", () => {
    // Same input but no rate map entry — DEFAULT_ANNUAL_RATE applies (7%).
    const rows = expandIrms(slot({ termMonths: 36, bareRental: 300, maintenance: 0 }), 300, NO_RATES);
    const at6 = rows.find((r) => r.initialRentalMultiplier === 6)!;
    // 7% annuity-due over 41 months on PV=300 yields a positive PMT > flat 300/41.
    const commContribution = at6.monthlyRental - 300;
    expect(commContribution).toBeGreaterThan(300 / 41);
  });

  it("preserves the maintenance figure unchanged across IRMs", () => {
    const rows = expandIrms(slot({ maintenance: 42.5 }), 0, NO_RATES);
    for (const r of rows) expect(r.monthlyMaintenance).toBe(42.5);
  });
});

describe("mergePerSlot", () => {
  const baseSlot = { capCode: "FORD-FOCUS-1", termMonths: 36, annualMileage: 8000 };

  it("picks the cheapest non-maintained funder for the rental, ignoring maintained ones", () => {
    const rows = [
      row({ ...baseSlot, funderId: "ald",    isMaintained: false, monthlyRental: 350 }),
      row({ ...baseSlot, funderId: "novuna", isMaintained: false, monthlyRental: 330 }),
      row({ ...baseSlot, funderId: "arval",  isMaintained: false, monthlyRental: 340 }),
      // A cheaper maintained rental does NOT influence the bare-rental side.
      row({ ...baseSlot, funderId: "lex",    isMaintained: true,  monthlyRental: 320, monthlyMaintenance: 28 }),
    ];
    const [merged] = mergePerSlot(rows);
    expect(merged.bareRental).toBe(330);
    expect(merged.rentalFunderId).toBe("novuna");
    expect(merged.maintenance).toBe(28);
    expect(merged.maintenanceFunderId).toBe("lex");
  });

  it("drops slots with no maintained funder at all", () => {
    const rows = [
      row({ ...baseSlot, funderId: "ald", isMaintained: false, monthlyRental: 350 }),
    ];
    expect(mergePerSlot(rows)).toHaveLength(0);
  });

  it("falls back to the cheapest maintained rental when no non-maintained quote exists", () => {
    const rows = [
      row({ ...baseSlot, funderId: "ald",    isMaintained: true, monthlyRental: 320, monthlyMaintenance: 30 }),
      row({ ...baseSlot, funderId: "novuna", isMaintained: true, monthlyRental: 310, monthlyMaintenance: 35 }),
    ];
    const [merged] = mergePerSlot(rows);
    expect(merged.bareRental).toBe(310);
    expect(merged.rentalFunderId).toBe("novuna");
    // Maintenance side independently picks the cheapest maintenance figure.
    expect(merged.maintenance).toBe(30);
    expect(merged.maintenanceFunderId).toBe("ald");
  });

  it("keys uniquely by (capCode, term, mileage)", () => {
    const rows = [
      row({ ...baseSlot, funderId: "ald", isMaintained: false, monthlyRental: 300 }),
      row({ ...baseSlot, funderId: "ald", isMaintained: true,  monthlyRental: 300, monthlyMaintenance: 30 }),
      row({ ...baseSlot, annualMileage: 12000, funderId: "ald", isMaintained: false, monthlyRental: 320 }),
      row({ ...baseSlot, annualMileage: 12000, funderId: "ald", isMaintained: true,  monthlyRental: 320, monthlyMaintenance: 32 }),
    ];
    expect(mergePerSlot(rows)).toHaveLength(2);
  });
});

describe("buildBrokerRows", () => {
  it("sorts rows for stable output", () => {
    const rows = [
      row({ capCode: "Z", termMonths: 36, annualMileage: 8000, funderId: "ald", isMaintained: false, monthlyRental: 300 }),
      row({ capCode: "Z", termMonths: 36, annualMileage: 8000, funderId: "ald", isMaintained: true,  monthlyRental: 300, monthlyMaintenance: 30 }),
      row({ capCode: "A", termMonths: 36, annualMileage: 8000, funderId: "ald", isMaintained: false, monthlyRental: 300, model: "Fiesta", derivative: "ST" }),
      row({ capCode: "A", termMonths: 36, annualMileage: 8000, funderId: "ald", isMaintained: true,  monthlyRental: 300, monthlyMaintenance: 30, model: "Fiesta", derivative: "ST" }),
    ];
    const out = buildBrokerRows(rows, 0, NO_RATES);
    // First row should be the alphabetically-first model.
    expect(out[0].model).toBe("Fiesta");
    expect(out[0].capCode).toBe("A");
  });
});
