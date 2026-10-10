import { describe, expect, it } from "vitest";
import {
  conversionPct,
  decodeReport,
  encodeReport,
  groupRows,
  previousRange,
  rangeFor,
  statsOf,
  timeBuckets,
  type StoredRow,
} from "./ten-at-ten-report";

function stored(over: Partial<StoredRow>): StoredRow {
  return {
    enquiryDay: "2026-10-01", exec: "DoJa", source: "TF Lead", model: "Ranger", derivative: null, derivativeKey: null,
    status: "Live", outcome: "live", financeType: "Business", termMonths: 36, annualMileage: 10000, ...over,
  };
}

describe("encode / decode", () => {
  it("round-trips rows, naming execs and labelling each derivative by its commonest spelling", () => {
    const rows = decodeReport(encodeReport([
      stored({ derivative: "Ford Ranger Diesel Pick Up Double Cab XLT", derivativeKey: "Ranger|xlt", outcome: "order", status: "Ordered" }),
      stored({ derivative: "Ford Ranger Diesel Pick Up Double Cab XLT", derivativeKey: "Ranger|xlt" }),
      stored({ derivative: "Ford Ranger Pick Up Double Cab XLT", derivativeKey: "Ranger|xlt", exec: "MiHo" }),
      stored({ model: "Capri", termMonths: null, annualMileage: null, financeType: null }),
    ], new Map([["DoJa", "Dominic Jarvis"]])));
    expect(rows[0]).toMatchObject({ day: "2026-10-01", exec: "Dominic Jarvis", outcome: "order", status: "Ordered", term: "36 months", mileage: "10,000 miles" });
    expect(new Set(rows.slice(0, 3).map((r) => r.derivative))).toEqual(new Set(["Ford Ranger Diesel Pick Up Double Cab XLT"]));
    expect(rows[2].exec).toBe("MiHo"); // no name known: the code stands
    expect(rows[3]).toMatchObject({ derivative: "Capri (model only)", term: "Not stated", mileage: "Not stated", financeType: "Not stated" });
  });
});

describe("stats and grouping", () => {
  const rows = decodeReport(encodeReport([
    stored({ source: "TF Lead", model: "Ranger", outcome: "order" }),
    stored({ source: "TF Lead", model: "Capri", outcome: "lost" }),
    stored({ source: "TF Lead", model: "Capri", outcome: "live" }),
    stored({ source: "CarWow", model: "Capri", outcome: "order" }),
  ]));

  it("conversion is orders ÷ enquiries, and blank with no enquiries", () => {
    const s = statsOf(rows);
    expect(s).toEqual({ enquiries: 4, orders: 2, live: 1, lost: 1 });
    expect(conversionPct(s)).toBe(50);
    expect(conversionPct(statsOf([]))).toBeNull();
  });

  it("stacks source then model, each level carrying its share of the one above", () => {
    const g = groupRows(rows, ["source", "model"]);
    expect(g.map((x) => [x.label, x.stats.enquiries, x.share])).toEqual([["TF Lead", 3, 75], ["CarWow", 1, 25]]);
    const capri = g[0].children.find((c) => c.label === "Capri")!;
    expect(capri.stats).toEqual({ enquiries: 2, orders: 0, live: 1, lost: 1 });
    expect(capri.share).toBeCloseTo(66.67, 1);
  });

  it("sorts sources in their fixed order when sorted by name", () => {
    expect(groupRows(rows, ["source"], "label").map((x) => x.label)).toEqual(["TF Lead", "CarWow"]);
  });
});

describe("periods", () => {
  it("builds calendar quarters and steps back a quarter for the comparison", () => {
    const q = rangeFor("quarter", "2026-11-14", { from: "", to: "" });
    expect([q.startDay, q.endDay]).toEqual(["2026-10-01", "2026-12-31"]);
    const p = previousRange("quarter", "2026-11-14", { from: "", to: "" });
    expect([p.startDay, p.endDay]).toEqual(["2026-07-01", "2026-09-30"]);
  });

  it("compares a period in progress with the same stretch of the previous one", () => {
    const p = previousRange("month", "2026-10-10", { from: "", to: "" }, "2026-10-10");
    expect([p.startDay, p.endDay]).toEqual(["2026-09-01", "2026-09-10"]);
    // 31 March in progress compares with all of February, not beyond it.
    const q = previousRange("month", "2026-03-31", { from: "", to: "" }, "2026-03-30");
    expect([q.startDay, q.endDay]).toEqual(["2026-02-01", "2026-02-28"]);
    // A finished period compares whole.
    const r = previousRange("month", "2026-09-15", { from: "", to: "" }, "2026-10-10");
    expect([r.startDay, r.endDay]).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("compares a custom range with the same number of days just before it", () => {
    const p = previousRange("custom", "2026-10-10", { from: "2026-10-05", to: "2026-10-09" });
    expect([p.startDay, p.endDay]).toEqual(["2026-09-30", "2026-10-04"]);
  });

  it("buckets by day up to two months and by week beyond", () => {
    const rows = decodeReport(encodeReport([stored({ enquiryDay: "2026-10-01" }), stored({ enquiryDay: "2026-10-02" })]));
    const daily = timeBuckets(rows, { startDay: "2026-10-01", endDay: "2026-10-31", label: "" });
    expect(daily).toHaveLength(31);
    expect(daily[0].stats.enquiries).toBe(1);
    const weekly = timeBuckets(rows, { startDay: "2026-07-01", endDay: "2026-12-31", label: "" });
    expect(weekly.length).toBeLessThan(30);
    expect(weekly.reduce((n, b) => n + b.stats.enquiries, 0)).toBe(2);
    expect(timeBuckets(rows, { startDay: "2026-10-01", endDay: "2026-10-01", label: "" })).toEqual([]);
  });
});
