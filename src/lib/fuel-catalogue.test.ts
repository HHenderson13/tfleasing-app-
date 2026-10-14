import { describe, expect, it } from "vitest";
import {
  engineLabel, enginesFor, fromLibrary, fromReference, likeliest, makesFor, modelsFor, searchCatalogue, versionsFor, yearsFor, yearsOf,
  type PickVehicle,
} from "./fuel-catalogue";
import { decodeReference } from "./fuel-reference";

const ref = decodeReference({
  source: "test",
  built: "2026-10-14",
  makes: ["Ford", "Volkswagen"],
  rows: [
    [1, 0, "Transit Custom", "TRANSIT CUSTOM 290 TREND ECOBLUE", 1, 2, 2016, 2018, 182, 0, 1200],
    [1, 0, "Transit Custom", "TRANSIT CUSTOM 300 LIMITED ECOBLUE", 1, 2, 2019, 2020, 199, 1, 800],
    [1, 0, "Transit Custom", "TRANSIT CUSTOM 340 ECOBOOST HEV", 2, 1, 2020, 2020, 210, 1, 40],
    [0, 1, "Golf", "GOLF LIFE TSI EVO", 0, 1.5, 2020, 2022, 122, 1, 900],
  ],
}).map(fromReference);
const lib = [
  fromLibrary({ id: "a", powertrain: "ice", segment: "van", make: "Ford", model: "Transit Custom", derivative: "320L Trend 2.0L EcoBlue 136PS 6MT FWD", fuel: "diesel", efficiency: 39.2, source: "Ford WLTP combined" }),
  fromLibrary({ id: "e", powertrain: "ev", segment: "van", make: "Ford", model: "E-Transit Custom", derivative: "320S Trend", fuel: "electric", efficiency: 2.8, source: null }),
];
const list = [...ref, ...lib.filter((v): v is PickVehicle => v != null)];

describe("the library and the reference, side by side", () => {
  it("keeps electric vehicles out of the current-vehicle list", () => {
    expect(lib[1]).toBeNull();
  });
  it("reads the engine off a library derivative and calls it a current model", () => {
    const v = lib[0]!;
    expect(engineLabel(v)).toBe("2.0 diesel");
    expect(yearsOf(v)).toBe("Current model");
    expect(v.source).toBe("Ford WLTP combined");
  });
  it("says where a reference MPG came from", () => {
    expect(ref[0].source).toBe("Official NEDC figure, from 182 g/km CO₂");
    expect(yearsOf(ref[0])).toBe("2016 to 2018");
  });
});

describe("the dropdowns", () => {
  const f = { segment: "van" as const, make: "Ford", model: "Transit Custom" };
  it("narrows make, then model, within cars or vans", () => {
    expect(makesFor(list, "van")).toEqual(["Ford"]);
    expect(makesFor(list, "car")).toEqual(["Volkswagen"]);
    expect(modelsFor(list, "van", "Ford")).toEqual(["Transit Custom"]);
  });
  it("offers current model first, then every year registered, newest first", () => {
    expect(yearsFor(list, f)).toEqual(["current", "2020", "2019", "2018", "2017", "2016"]);
  });
  it("offers the engines for the year chosen", () => {
    expect(enginesFor(list, { ...f, year: "2017" })).toEqual(["2.0 diesel"]);
    expect(enginesFor(list, { ...f, year: "2020" })).toEqual(["1.0 petrol hybrid", "2.0 diesel"]);
  });
  it("lists the versions left, current model first", () => {
    expect(versionsFor(list, f).map((v) => v.current)).toEqual([true, false, false, false]);
    expect(versionsFor(list, { ...f, year: "current" })).toHaveLength(1);
    expect(versionsFor(list, { ...f, year: "2020", engine: "2.0 diesel" }).map((v) => v.yearFrom)).toEqual([2019]);
  });
  it("starts on the version most often registered", () => {
    expect(likeliest(versionsFor(list, f))?.registrations).toBe(1200);
  });
});

describe("searching", () => {
  it("matches every word, and a year after the data ends finds current models", () => {
    expect(searchCatalogue(list, "transit custom 2.0", "van")).toHaveLength(3);
    expect(searchCatalogue(list, "transit 2017", "van").map((v) => v.yearFrom)).toEqual([2016]);
    expect(searchCatalogue(list, "transit 2025", "van").map((v) => v.current)).toEqual([true]);
    expect(searchCatalogue(list, "golf", "van")).toEqual([]);
  });
});
