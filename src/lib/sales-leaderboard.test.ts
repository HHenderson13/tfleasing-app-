import { describe, expect, it } from "vitest";
import {
  applyPoints,
  currentYearMonth,
  formatMonthLabel,
  type ExecMonthStats,
  type LeaderboardMetric,
} from "./sales-leaderboard";

function makeRow(
  salesExecId: string,
  orderCount = 0,
  deliveryCount = 0,
  insuranceCount = 0,
  enquiryCount = 0,
  salesCount = 0,
): ExecMonthStats {
  return {
    salesExecId,
    name: salesExecId,
    photoUrl: null,
    orderCount,
    deliveryCount,
    insuranceCount,
    enquiryCount,
    salesCount,
    conversionPct: enquiryCount > 0 ? (salesCount / enquiryCount) * 100 : 0,
    latestVehicle: null,
    metricPoints: { orders: 0, deliveries: 0, insurance: 0, conversion: 0 },
    totalPoints: 0,
    metricRanks: { orders: null, deliveries: null, insurance: null, conversion: null },
  };
}

describe("sales-leaderboard scoring", () => {
  it("awards 3/2/1 for the top three on a single metric", () => {
    const rows = [
      makeRow("a", 10),
      makeRow("b", 7),
      makeRow("c", 5),
      makeRow("d", 2),
    ];
    applyPoints(rows);
    expect(rows[0].metricPoints.orders).toBe(3);
    expect(rows[1].metricPoints.orders).toBe(2);
    expect(rows[2].metricPoints.orders).toBe(1);
    expect(rows[3].metricPoints.orders).toBe(0);
    expect(rows[0].metricRanks.orders).toBe(1);
    expect(rows[3].metricRanks.orders).toBe(4);
  });

  it("ties share the rank and points; next rank skips positions", () => {
    const rows = [
      makeRow("a", 10),
      makeRow("b", 10),       // tied 1st
      makeRow("c", 7),        // shifts to rank 3
      makeRow("d", 5),
    ];
    applyPoints(rows);
    expect(rows[0].metricPoints.orders).toBe(3);
    expect(rows[1].metricPoints.orders).toBe(3);
    expect(rows[2].metricRanks.orders).toBe(3);
    expect(rows[2].metricPoints.orders).toBe(1);
    expect(rows[3].metricPoints.orders).toBe(0);
  });

  it("awards no points when every value is zero on that metric", () => {
    const rows = [makeRow("a"), makeRow("b"), makeRow("c")];
    applyPoints(rows);
    for (const r of rows) {
      for (const k of ["orders", "deliveries", "insurance", "conversion"] as LeaderboardMetric[]) {
        expect(r.metricPoints[k]).toBe(0);
        expect(r.metricRanks[k]).toBeNull();
      }
    }
  });

  it("conversion uses enquiry presence as the meaningful flag", () => {
    // Everyone has enquiries; only one converts. They should rank first.
    const a = makeRow("a", 0, 0, 0, 10, 5);
    const b = makeRow("b", 0, 0, 0, 10, 0);
    const c = makeRow("c", 0, 0, 0, 10, 0);
    applyPoints([a, b, c]);
    expect(a.metricRanks.conversion).toBe(1);
    expect(a.metricPoints.conversion).toBe(3);
    expect(b.metricRanks.conversion).toBe(2);
    expect(c.metricRanks.conversion).toBe(2);
  });

  it("totalPoints sums across all four metrics", () => {
    const a = makeRow("a", 10, 10, 10, 10, 10); // 1st in everything → 3+3+3+3
    const b = makeRow("b", 5,  5,  5,  10, 5);  // 2nd in everything
    const c = makeRow("c", 1,  1,  1,  10, 1);  // 3rd in everything
    applyPoints([a, b, c]);
    expect(a.totalPoints).toBe(12);
    expect(b.totalPoints).toBe(8);
    expect(c.totalPoints).toBe(4);
  });
});

describe("date helpers", () => {
  it("formats month labels readably", () => {
    expect(formatMonthLabel("2026-06")).toBe("June 2026");
    expect(formatMonthLabel("2026-01")).toBe("January 2026");
  });

  it("currentYearMonth returns YYYY-MM in UK time", () => {
    const ym = currentYearMonth(new Date("2026-06-15T10:00:00Z"));
    expect(ym).toBe("2026-06");
  });
});
