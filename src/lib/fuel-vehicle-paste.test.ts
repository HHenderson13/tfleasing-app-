import { describe, expect, it } from "vitest";
import { parseVehiclePaste } from "./fuel-vehicle-paste";

describe("pasting vehicles", () => {
  it("reads rows pasted from Excel, skipping the header", () => {
    const r = parseVehiclePaste(
      "Segment\tMake\tModel\tDerivative\tMiles per kWh\n"
      + "Car\tFord\tExplorer\tExtended Range RWD 77kWh Select\t3.9\n"
      + "Van\tFord\tE-Transit\t350 L3 H2 89kWh Trend\t2.1\n",
      "ev",
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { powertrain: "ev", segment: "car", make: "Ford", model: "Explorer", derivative: "Extended Range RWD 77kWh Select", fuel: "electric", efficiency: 3.9 },
      { powertrain: "ev", segment: "van", make: "Ford", model: "E-Transit", derivative: "350 L3 H2 89kWh Trend", fuel: "electric", efficiency: 2.1 },
    ]);
  });

  it("reads petrol and diesel rows typed with bars", () => {
    const r = parseVehiclePaste("Car | Volkswagen | Golf | 1.5 TSI Life | Petrol | 51.4\nvan|Vauxhall|Vivaro|2.0 Turbo D 145 Pro|diesel|40.9 mpg", "ice");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((v) => [v.segment, v.make, v.fuel, v.efficiency])).toEqual([["car", "Volkswagen", "petrol", 51.4], ["van", "Vauxhall", "diesel", 40.9]]);
  });

  it("names each bad row instead of guessing", () => {
    const r = parseVehiclePaste(
      "Car\tFord\tPuma\tST-Line 1.0\tPetrol\t52.3\n"
      + "Bus\tFord\tTransit\t350\tDiesel\t30\n"          // not car or van
      + "Car\tFord\tFocus\tTitanium\tLPG\t50\n"          // not petrol or diesel
      + "Car\tFord\tKuga\t2.5 FHEV\tPetrol\t5.2\n"        // l/100km, not mpg
      + "Car\tFord\tFiesta\n",                           // too few columns
      "ice",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(r.errors[2].message).toMatch(/outside 10 to 120/);
  });

  it("catches kWh per 100 miles pasted as miles per kWh", () => {
    const r = parseVehiclePaste("Car\tFord\tCapri\tExtended Range\t28", "ev");
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toMatch(/kWh per 100 miles/);
  });

  it("takes battery, range and rapid charging after the miles per kWh", () => {
    const r = parseVehiclePaste(
      "Car\tFord\tPuma Gen-E\tSelect\t4.78\t46.8\t259\t192\t100\t26\n"
      + "Car\tFord\tCapri\tStyle\t4.17\t58\t286\n"
      + "Car\tFord\tCapri\tPremium\t4.0\t58\t2860\n"
      + "Car\tFord\tCapri\tSelect\t4.5\t79\t389\t400\n",
      "ev",
    );
    expect(r.rows[0]).toMatchObject({ batteryKwh: 46.8, rangeMiles: 259, motorwayMiles: 192, dcKw: 100, dcMinutes: 26 });
    expect(r.rows[1]).toMatchObject({ batteryKwh: 58, rangeMiles: 286 });
    expect(r.rows[1].dcKw).toBeUndefined();
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
});
