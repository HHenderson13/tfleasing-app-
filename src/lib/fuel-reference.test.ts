import { describe, expect, it } from "vitest";
import { decodeReference, prettyName, searchReference, yearsLabel, type ReferenceFile } from "./fuel-reference";

const file: ReferenceFile = {
  source: "test",
  built: "2026-10-14",
  makes: ["BMW", "Ford", "Volkswagen"],
  rows: [
    [0, 0, "3 Series", "320D M SPORT AUTO", 1, 2, 2019, 2020, 142, 1, 4535],
    [0, 2, "Golf", "GOLF LIFE TSI EVO", 0, 1.5, 2020, 2022, 122, 1, 900],
    [1, 1, "Transit Custom", "TRANSIT CUSTOM 300 LIMITED ECOBLUE", 1, 2, 2016, 2017, 182, 0, 1200],
    [0, 1, "Kuga", "KUGA ST-LINE ED EBLUE MHEV", 3, 2, 2020, 2020, 132, 1, 300],
  ],
};

describe("tidying the official names", () => {
  it("reads like the badge, keeping the makers' own spellings", () => {
    expect(prettyName("320D M SPORT AUTO")).toBe("320d M Sport Auto");
    expect(prettyName("GOLF LIFE TSI EVO")).toBe("Golf Life TSI EVO");
    expect(prettyName("TRANSIT CUSTOM 300 LIMITED ECOBLUE")).toBe("Transit Custom 300 Limited EcoBlue");
    expect(prettyName("KUGA ST-LINE  ED EBLUE MHEV")).toBe("Kuga ST-Line ED Eblue mHEV");
  });
});

describe("decoding the reference file", () => {
  const list = decodeReference(file);
  it("works MPG back from the official CO2 for the right fuel and test", () => {
    expect(list[0]).toMatchObject({ make: "BMW", model: "3 Series", fuel: "diesel", cycle: "wltp", mpg: 52.3, segment: "car" });
    expect(list[1]).toMatchObject({ fuel: "petrol", mpg: 52.3 });
    expect(list[2]).toMatchObject({ segment: "van", cycle: "nedc", mpg: 40.9 }); // 2016 Transit Custom, 182 g/km NEDC
    expect(list[3]).toMatchObject({ fuel: "diesel", hybrid: true });
  });
  it("labels the years without a dash", () => {
    expect(yearsLabel(list[0])).toBe("2019 to 2020");
    expect(yearsLabel(list[3])).toBe("2020");
  });
});

describe("searching", () => {
  const list = decodeReference(file);
  it("matches every word typed, commonest first, within cars or vans", () => {
    expect(searchReference(list, "320d", "car").map((v) => v.model)).toEqual(["3 Series"]);
    expect(searchReference(list, "diesel", "car").map((v) => v.model)).toEqual(["3 Series", "Kuga"]);
    expect(searchReference(list, "transit", "car")).toEqual([]);
    expect(searchReference(list, "transit custom 2.0", "van")).toHaveLength(1);
  });
  it("reads a year as registered across it", () => {
    expect(searchReference(list, "golf 2021", "car")).toHaveLength(1);
    expect(searchReference(list, "golf 2019", "car")).toHaveLength(0);
  });
});
