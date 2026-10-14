import { describe, expect, it } from "vitest";
import {
  LITRES_PER_UK_GALLON, compare, effectivePence, mpgFromCo2, normaliseMix, testCycleFor, verdict, type ComparisonInput,
} from "./fuel-calc";

const base: ComparisonInput = {
  annualMiles: 12000,
  termMonths: 48,
  customer: "private",
  ice: { fuel: "diesel", mpg: 39.2, pricePence: 200 },
  ev: {
    milesPerKwh: 2.8,
    mix: { home_overnight: 80, home_standard: 10, depot: 0, public_rapid: 10 },
    pricesPence: { home_overnight: 8, home_standard: 26, depot: 28, public_rapid: 79 },
  },
};

describe("running costs", () => {
  it("costs petrol and diesel by the UK gallon", () => {
    const r = compare(base);
    // 4.54609 ÷ 39.2 = 0.11597 L a mile × 200p = 23.19p a mile
    expect(r.ice.litresPerMile).toBeCloseTo(LITRES_PER_UK_GALLON / 39.2, 6);
    expect(r.ice.pencePerMile).toBeCloseTo(23.194, 2);
    expect(r.ice.annual).toBeCloseTo(2783.3, 0);
    expect(r.ice.monthly).toBeCloseTo(231.94, 1);
    expect(r.ice.overTerm).toBeCloseTo(231.94 * 48, 0);
  });

  it("costs electric from a blended price over miles per kWh", () => {
    const r = compare(base);
    // 0.8×8 + 0.1×26 + 0.1×79 = 16.9p a kWh ÷ 2.8 = 6.036p a mile
    expect(r.ev.blendedPence).toBeCloseTo(16.9, 6);
    expect(r.ev.pencePerMile).toBeCloseTo(6.0357, 3);
    expect(r.ev.monthly).toBeCloseTo(60.36, 1);
    expect(r.saving.monthly).toBeCloseTo(231.94 - 60.36, 1);
  });

  it("matches the old calculator's worked case", () => {
    // Old tool: 10,000 miles, 39.2 mpg at 144.39p; 2.8 mi/kWh at 80/10/10 of 8p/27p/76p.
    const r = compare({ ...base, annualMiles: 10000, ice: { fuel: "diesel", mpg: 39.2, pricePence: 144.39 },
      ev: { ...base.ev, pricesPence: { home_overnight: 8, home_standard: 27, depot: 0, public_rapid: 76 } } });
    // 833.3 miles × 0.059643 £/mile = £49.70, which the old tool showed as £50.
    expect(Math.round(r.ice.monthly)).toBe(140);
    expect(Math.round(r.ev.monthly)).toBe(50);
  });

  it("is honest when electric costs more", () => {
    const r = compare({ ...base, ice: { fuel: "petrol", mpg: 60, pricePence: 140 }, ev: { ...base.ev, mix: { home_overnight: 0, home_standard: 0, depot: 0, public_rapid: 100 } } });
    expect(r.saving.monthly).toBeLessThan(0);
    expect(verdict(r, "petrol")).toMatchObject({ tone: "cost", headline: expect.stringMatching(/^Electric costs £\d+ a month more than petrol$/) });
    expect(verdict(compare(base), "diesel")).toEqual({ tone: "saving", headline: "Electric saves £172 a month" });
  });

  it("asks for both vehicles rather than inventing a figure", () => {
    expect(compare({ ...base, ice: { ...base.ice, mpg: 0 } }).valid).toBe(false);
    expect(verdict(compare({ ...base, ev: { ...base.ev, milesPerKwh: 0 } }), "diesel").headline).toBe("Fill in both vehicles to compare");
  });
});

describe("VAT", () => {
  it("shows a private customer prices with VAT, as published", () => {
    expect(effectivePence("diesel", 200, "private")).toBe(200);
    expect(effectivePence("depot", 28, "private")).toBeCloseTo(33.6, 6); // published ex VAT
  });
  it("takes reclaimable VAT off for a business, but not on home electricity", () => {
    expect(effectivePence("diesel", 200, "business")).toBeCloseTo(166.667, 3);
    expect(effectivePence("public_rapid", 79, "business")).toBeCloseTo(65.833, 3);
    expect(effectivePence("depot", 28, "business")).toBe(28);
    expect(effectivePence("home_overnight", 8, "business")).toBe(8);
  });
});

describe("charging mix", () => {
  it("scales a mix that doesn't add to 100", () => {
    const { shares, total } = normaliseMix({ home_overnight: 60, home_standard: 0, depot: 0, public_rapid: 20 });
    expect(total).toBe(80);
    expect(shares.home_overnight).toBeCloseTo(0.75, 6);
    expect(shares.public_rapid).toBeCloseTo(0.25, 6);
  });
  it("treats an empty mix as all overnight rather than free", () => {
    expect(normaliseMix({ home_overnight: 0, home_standard: 0, depot: 0, public_rapid: 0 }).shares.home_overnight).toBe(1);
  });
});

describe("MPG from the V5C's CO₂", () => {
  it("gives back the official figure", () => {
    expect(mpgFromCo2(182, "diesel", "nedc")!).toBeCloseTo(40.9, 1);   // 2018 Transit Custom 2.0 130
    expect(mpgFromCo2(122, "petrol", "wltp")!).toBeCloseTo(52.3, 1);   // Puma 1.0 EcoBoost 125 mHEV
    expect(mpgFromCo2(190, "diesel", "wltp")!).toBeCloseTo(39.1, 1);
    expect(mpgFromCo2(0, "diesel", "wltp")).toBeNull();
  });
  it("knows which test the figure came from", () => {
    expect(testCycleFor("car", "2018-08")).toBe("nedc");
    expect(testCycleFor("car", "2018-09")).toBe("wltp");
    expect(testCycleFor("van", "2019-06")).toBe("nedc");
    expect(testCycleFor("van", "2019-09")).toBe("wltp");
  });
});

describe("workings", () => {
  it("lays out every step with the numbers the answer came from", async () => {
    const { workings } = await import("./fuel-calc");
    const r = compare(base);
    const w = workings(base, r, { iceFuel: "diesel", chargeLabels: { home_overnight: "Home overnight", home_standard: "Home daytime", depot: "Depot", public_rapid: "Public rapid" } });
    const all = w.flatMap((s) => s.lines).join("\n");
    expect(w.map((s) => s.title)).toEqual(["Miles", "Diesel", "Electric", "Cost"]);
    expect(all).toContain("12,000 miles a year ÷ 12 = 1,000 miles a month");
    expect(all).toContain("4.54609 litres a gallon ÷ 39.2 MPG = 0.11597 litres a mile");
    expect(all).toContain("0.11597 × 200.00p = 23.194p a mile");
    expect(all).toContain("Diesel: 1,000 miles × 23.194p = £231.94 a month");
    expect(all).toContain("Blended price: 80% × 8.00p + 10% × 26.00p + 10% × 79.00p = 16.900p a kWh");
    expect(all).toContain("Difference: £171.59 a month");
    expect(all).not.toContain("Depot"); // a source with no share isn't listed
    expect(all).toContain("£2,059.03 a year and £8,236.14 over 48 months, in favour of electric");
  });

  it("never prints a dash the customer would read as a pause", async () => {
    const { workings, verdict, PRICE_META } = await import("./fuel-calc");
    const r = compare(base);
    const text = [
      ...workings(base, r, { iceFuel: "diesel", chargeLabels: { home_overnight: "a", home_standard: "b", depot: "c", public_rapid: "d" } }).flatMap((s) => [s.title, ...s.lines]),
      verdict(r, "diesel").headline,
      ...Object.values(PRICE_META).flatMap((m) => [m.label, m.short]),
    ].join("\n");
    expect(text).not.toMatch(/[—–]/);
  });
});

describe("charging, a week at a time", () => {
  it("turns the annual mileage into charges, hours and rapid stops from the official figures", async () => {
    const { chargingInsight } = await import("./fuel-calc");
    // Puma Gen-E Select: 13.0 kWh/100km = 4.78 miles per kWh, 259-mile range, 192 on the motorway, 10 to 80% in 26 minutes at 100 kW.
    const c = chargingInsight(12000, 4.78, { batteryKwh: 46.8, rangeMiles: 259, motorwayMiles: 192, dcKw: 100, dcMinutes: 26 })!;
    expect(c.weeklyMiles).toBeCloseTo(230.77, 2);
    expect(c.weeklyKwh).toBeCloseTo(48.28, 2);
    expect(c.chargesPerWeek).toBeCloseTo(0.891, 3);
    expect(c.motorwayChargesPerWeek).toBeCloseTo(1.202, 3);
    expect(c.homeHours).toBeCloseTo(6.52, 2);   // 48.28 kWh ÷ 7.4 kW
    expect(c.depotHours).toBeCloseTo(4.39, 2);  // ÷ 11 kW
    expect(c.rapid).toMatchObject({ minutes: 26, kw: 100 });
    expect(c.rapid!.milesAdded).toBeCloseTo(181.3, 1);
    expect(c.rapid!.stopsPerWeek).toBeCloseTo(1.273, 3);
  });
  it("leaves out what the vehicle's figures don't support", async () => {
    const { chargingInsight } = await import("./fuel-calc");
    const c = chargingInsight(12000, 3.51, { batteryKwh: null, rangeMiles: null, motorwayMiles: null, dcKw: null, dcMinutes: null })!;
    expect(c.chargesPerWeek).toBeNull();
    expect(c.rapid).toBeNull();
    expect(c.homeHours).toBeGreaterThan(0);
    expect(chargingInsight(0, 3.5, { batteryKwh: null, rangeMiles: 200, motorwayMiles: null, dcKw: null, dcMinutes: null })).toBeNull();
  });
  it("says it the way a person would", async () => {
    const { howOften, hoursText } = await import("./fuel-calc");
    expect(howOften(0.89)).toBe("About once a week");
    expect(howOften(1.6)).toBe("About twice a week");
    expect(howOften(3.4)).toBe("About 3 times a week");
    expect(howOften(0.6)).toBe("Every week or two");
    expect(howOften(0.3)).toBe("About once every 3 weeks");
    expect(hoursText(6.52)).toBe("6h 30m");
    expect(hoursText(4.39)).toBe("4h 25m");
    expect(hoursText(0.4)).toBe("25m");
    expect(hoursText(2)).toBe("2h");
  });

  it("shows its workings", async () => {
    const { chargingInsight, chargingWorkings } = await import("./fuel-calc");
    const ev = { batteryKwh: 46.8, rangeMiles: 259, motorwayMiles: 192, dcKw: 100, dcMinutes: 26 };
    const lines = chargingWorkings(12000, 4.78, ev, chargingInsight(12000, 4.78, ev)!);
    expect(lines).toEqual([
      "12,000 miles a year ÷ 52 = 230.8 miles a week",
      "230.8 miles ÷ 4.78 miles per kWh = 48.3 kWh a week, at the plug",
      "Home: 48.3 kWh ÷ 7.4 kW = 6.52 hours a week",
      "Depot: 48.3 kWh ÷ 11 kW = 4.39 hours a week",
      "Full charges: 230.8 miles ÷ 259-mile range = 0.89 a week",
      "Rapid, 10 to 80%: 70% of 259 miles = 181.3 miles a stop, 1.27 stops a week",
    ]);
    expect(lines.join("\n")).not.toMatch(/[—–]/);
  });

  it("prints miles per kWh with the places it was published to", async () => {
    const { fmtMilesPerKwh } = await import("./fuel-calc");
    expect(fmtMilesPerKwh(2.9)).toBe("2.9");
    expect(fmtMilesPerKwh(4.78)).toBe("4.78");
    expect(fmtMilesPerKwh(4.1)).toBe("4.1");
    expect(fmtMilesPerKwh(3)).toBe("3.0");
  });
});
