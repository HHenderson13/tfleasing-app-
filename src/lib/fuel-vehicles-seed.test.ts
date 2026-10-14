import { describe, expect, it } from "vitest";
import { EV_SEED, RETIRED_EV_SEED, milesPerKwhFrom } from "./fuel-vehicles-seed";

describe("electric vehicles from the price lists", () => {
  it("converts each list's own unit to miles per kWh", () => {
    expect(milesPerKwhFrom({ value: 13.0, per: "100km" })).toBe(4.78);   // Puma Gen-E Select
    expect(milesPerKwhFrom({ value: 38.3, per: "100mi" })).toBe(2.61);   // Transit City SWB
    expect(milesPerKwhFrom({ milesPerKwh: 2.9 })).toBe(2.9);             // E-Transit Custom
  });
  it("uses the E-Transit Courier's consumption at the plug, not range over battery", () => {
    const courier = EV_SEED.find((v) => v.model === "E-Transit Courier")!;
    expect(courier.efficiency).toBe(3.51);
    expect(courier.source).toContain("17.7 kWh/100km");
  });
  it("carries battery, range and rapid charging for every version", () => {
    expect(EV_SEED).toHaveLength(50);
    for (const v of EV_SEED) {
      expect(v.batteryKwh).toBeGreaterThan(40);
      expect(v.rangeMiles).toBeGreaterThan(130);
      // Official efficiency at the plug is always below range ÷ battery: charging losses.
      expect(v.efficiency).toBeLessThan(v.rangeMiles! / v.batteryKwh!);
      expect(v.efficiency).toBeGreaterThan(1.8);
    }
    expect(EV_SEED.filter((v) => v.dcMinutes == null).map((v) => v.model)).toEqual(["E-Transit Courier", "E-Transit Courier"]);
  });
  it("retires only the earlier model year it replaces", () => {
    const names = new Set(EV_SEED.map((v) => `${v.model}|${v.derivative}`));
    expect(RETIRED_EV_SEED.some((v) => names.has(`${v.model}|${v.derivative}`))).toBe(false);
  });
});
