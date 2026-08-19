import { describe, expect, it } from "vitest";
import { buildPeriod, canStep, clampAnchor, inPeriod, isDayKey, shiftAnchor } from "./period";

// Aug 2026: 1st is a Sat. Mon 10th, Sun 16th, Mon 17th, Wed 19th.
describe("buildPeriod", () => {
  it("day covers exactly one date", () => {
    const p = buildPeriod("day", "2026-08-13");
    expect([p.startDay, p.endDay]).toEqual(["2026-08-13", "2026-08-13"]);
    expect(p.label).toBe("Thu 13 Aug 2026");
  });

  it("week runs Monday to Sunday", () => {
    const p = buildPeriod("week", "2026-08-13"); // a Thursday
    expect([p.startDay, p.endDay]).toEqual(["2026-08-10", "2026-08-16"]);
    expect(p.label).toBe("10 – 16 Aug 2026");
  });

  it("week anchored on the Monday or Sunday gives the same week", () => {
    expect(buildPeriod("week", "2026-08-10").startDay).toBe("2026-08-10");
    expect(buildPeriod("week", "2026-08-16").startDay).toBe("2026-08-10");
    expect(buildPeriod("week", "2026-08-17").startDay).toBe("2026-08-17");
  });

  it("week spanning a month boundary shows both months", () => {
    const p = buildPeriod("week", "2026-09-02");
    expect([p.startDay, p.endDay]).toEqual(["2026-08-31", "2026-09-06"]);
    expect(p.label).toBe("31 Aug – 6 Sept 2026");
  });

  it("month covers the whole calendar month", () => {
    const p = buildPeriod("month", "2026-08-19");
    expect([p.startDay, p.endDay]).toEqual(["2026-08-01", "2026-08-31"]);
    expect(p.label).toBe("August 2026");
  });

  it("handles February in a leap year", () => {
    const p = buildPeriod("month", "2028-02-10");
    expect([p.startDay, p.endDay]).toEqual(["2028-02-01", "2028-02-29"]);
  });
});

describe("shiftAnchor", () => {
  it("steps a day", () => {
    expect(shiftAnchor("day", "2026-08-13", 1)).toBe("2026-08-14");
    expect(shiftAnchor("day", "2026-08-01", -1)).toBe("2026-07-31");
  });

  it("steps a week", () => {
    expect(buildPeriod("week", shiftAnchor("week", "2026-08-13", -1)).startDay).toBe("2026-08-03");
  });

  it("steps months without skidding on month length", () => {
    // From 31 Mar, stepping back must land in February, not 3 March.
    expect(buildPeriod("month", shiftAnchor("month", "2026-03-31", -1)).startDay)
      .toBe("2026-02-01");
    expect(buildPeriod("month", shiftAnchor("month", "2026-12-15", 1)).startDay)
      .toBe("2027-01-01");
  });
});

describe("bounds", () => {
  it("clamps an anchor into the held range", () => {
    expect(clampAnchor("2026-07-01", "2026-08-01", "2026-08-16")).toBe("2026-08-01");
    expect(clampAnchor("2026-09-01", "2026-08-01", "2026-08-16")).toBe("2026-08-16");
    expect(clampAnchor("2026-08-05", "2026-08-01", "2026-08-16")).toBe("2026-08-05");
    expect(clampAnchor("2026-08-05", null, null)).toBeNull();
  });

  it("stops stepping once the period leaves the data", () => {
    const min = "2026-08-01", max = "2026-08-16";
    expect(canStep("month", "2026-08-10", -1, min, max)).toBe(false);
    expect(canStep("month", "2026-08-10", 1, min, max)).toBe(false);
    expect(canStep("week", "2026-08-13", -1, min, max)).toBe(true);
    expect(canStep("day", "2026-08-16", 1, min, max)).toBe(false);
    expect(canStep("day", "2026-08-15", 1, min, max)).toBe(true);
  });
});

describe("inPeriod + isDayKey", () => {
  const rows = [
    { enquiryDay: "2026-08-09" }, { enquiryDay: "2026-08-10" },
    { enquiryDay: "2026-08-16" }, { enquiryDay: "2026-08-17" },
  ];
  it("filters inclusively on both ends", () => {
    expect(inPeriod(rows, buildPeriod("week", "2026-08-13")).map((r) => r.enquiryDay))
      .toEqual(["2026-08-10", "2026-08-16"]);
  });
  it("validates day keys", () => {
    expect(isDayKey("2026-08-13")).toBe(true);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("nope")).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });
});
