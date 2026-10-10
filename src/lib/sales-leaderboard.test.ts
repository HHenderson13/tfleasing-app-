import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  applyPoints,
  attributeReportRows,
  currentYearMonth,
  enquiryInbound,
  enquirySales,
  formatConversion,
  formatMonthLabel,
  isInboundSource,
  isSaleStatus,
  parseEnquiryLog,
  parseOrderList,
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

  it("a 0% conversion takes no podium place", () => {
    // Everyone has enquiries; only one converts. The other two used to tie
    // for 2nd on 0% and take 2 points each for converting nothing.
    const a = makeRow("a", 0, 0, 0, 10, 5);
    const b = makeRow("b", 0, 0, 0, 10, 0);
    const c = makeRow("c", 0, 0, 0, 10, 0);
    applyPoints([a, b, c]);
    expect(a.metricRanks.conversion).toBe(1);
    expect(a.metricPoints.conversion).toBe(3);
    expect(b.metricRanks.conversion).toBeNull();
    expect(c.metricRanks.conversion).toBeNull();
    expect(b.totalPoints).toBe(0);
  });

  it("zero never earns a podium on any metric", () => {
    // Two execs with orders; the rest are on 0 and must not share 3rd.
    const rows = [makeRow("a", 10), makeRow("b", 5), makeRow("c", 0), makeRow("d", 0)];
    applyPoints(rows);
    expect(rows[1].metricRanks.orders).toBe(2);
    expect(rows[2].metricRanks.orders).toBeNull();
    expect(rows[3].metricRanks.orders).toBeNull();
    expect(rows[2].totalPoints).toBe(0);
    expect(rows[3].totalPoints).toBe(0);
  });

  it("no enquiries means no conversion rank, even beside orders", () => {
    const withOrders = makeRow("a", 4, 0, 0, 0, 0);
    const converter = makeRow("b", 1, 0, 0, 18, 1);
    applyPoints([withOrders, converter]);
    expect(withOrders.metricRanks.conversion).toBeNull();
    expect(converter.metricRanks.conversion).toBe(1);
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

// Build an in-memory XLSX shaped like a Dealerweb export: header row, then
// data with the exec code in column B.
function workbook(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "ag-grid");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

// Enquiry log row with SE in B, Source in E (index 4) and Status in Q (index 16).
function enquiry(se: string, status: string, source = "MotorComplete Lead"): unknown[] {
  const r: unknown[] = new Array(17).fill(null);
  r[1] = se;
  r[4] = source;
  r[16] = status;
  return r;
}

describe("enquiry sale statuses", () => {
  it("counts every post-order status as a sale", () => {
    expect(isSaleStatus("Ordered")).toBe(true);
    expect(isSaleStatus("Handover Arranged")).toBe(true);
    expect(isSaleStatus("Delivered")).toBe(true);
    expect(isSaleStatus(" handover  arranged ")).toBe(true);
    expect(isSaleStatus("Live")).toBe(false);
    expect(isSaleStatus("Lost Sale")).toBe(false);
    expect(isSaleStatus("")).toBe(false);
  });

  it("parseEnquiryLog counts Handover Arranged and keeps the status tally", () => {
    // October 2026: DoJa's only converted enquiry had moved on to Handover
    // Arranged, and the board showed 0% beside their order.
    const header = new Array(17).fill("h");
    const { rows } = parseEnquiryLog(workbook([
      header,
      enquiry("DoJa", "Live"),
      enquiry("DoJa", "Handover Arranged"),
      enquiry("DoJa", "Lost Sale"),
      enquiry("LoBa", "Ordered"),
    ]));
    const doja = rows.find((r) => r.reportCode === "DoJa")!;
    expect(doja.enquiryCount).toBe(3);
    expect(doja.salesCount).toBe(1);
    expect(doja.statusCounts).toEqual({ Live: 1, "Handover Arranged": 1, "Lost Sale": 1 });
  });

  it("enquirySales re-applies the current rules from the stored tally", () => {
    // Stored before Handover Arranged counted: salesCount was frozen at 0.
    const stored = { reportCode: "DoJa", enquiryCount: 2, salesCount: 0, statusCounts: { Live: 1, "Handover Arranged": 1 } };
    expect(enquirySales(stored)).toBe(1);
    // Legacy upload with no tally: nothing to re-derive from.
    expect(enquirySales({ reportCode: "X", enquiryCount: 5, salesCount: 2 })).toBe(2);
  });
});

describe("inbound conversion", () => {
  it("counts every MotorComplete source as inbound, and nothing else", () => {
    // The four sources in the September and October 2026 logs.
    expect(isInboundSource("MotorComplete Lead")).toBe(true);
    expect(isInboundSource("MotorComplete - Leasing.com")).toBe(true);
    expect(isInboundSource("MotorComplete - LeaseLoco")).toBe(true);
    expect(isInboundSource("MotorComplete - carwow")).toBe(true);
    // A future MotorComplete feed counts without a code change.
    expect(isInboundSource(" motorcomplete - autotrader ")).toBe(true);
    expect(isInboundSource("Customer")).toBe(false);
    expect(isInboundSource("Broker Introduction")).toBe(false);
    expect(isInboundSource("FRoLLeasing.com")).toBe(false);
    expect(isInboundSource("FR Website")).toBe(false);
    expect(isInboundSource("")).toBe(false);
  });

  it("parseEnquiryLog keeps a source → status tally and derives inbound from it", () => {
    // October 2026: LoBa's five sales were all Customer or Broker leads, and
    // none of their MotorComplete enquiries had converted.
    const { rows } = parseEnquiryLog(workbook([
      new Array(17).fill("h"),
      enquiry("LoBa", "Ordered", "Customer"),
      enquiry("LoBa", "Delivered", "Broker Introduction"),
      enquiry("LoBa", "Live", "MotorComplete - Leasing.com"),
      enquiry("DoJa", "Handover Arranged", "MotorComplete - carwow"),
      enquiry("DoJa", "Lost Sale", "MotorComplete Lead"),
    ]));
    const loba = rows.find((r) => r.reportCode === "LoBa")!;
    expect(loba.enquiryCount).toBe(3);
    expect(enquirySales(loba)).toBe(2);
    expect(enquiryInbound(loba)).toEqual({ enquiries: 1, sales: 0 });
    expect(loba.sourceStatusCounts?.["Customer"]).toEqual({ Ordered: 1 });
    expect(enquiryInbound(rows.find((r) => r.reportCode === "DoJa")!)).toEqual({ enquiries: 2, sales: 1 });
  });

  it("has no inbound figure for an upload parsed before sources were read", () => {
    expect(enquiryInbound({ reportCode: "X", enquiryCount: 5, salesCount: 2, statusCounts: { Ordered: 2, Live: 3 } })).toBeNull();
  });
});

describe("report parsing", () => {
  it("skips the numeric totals block at the foot of the order list", () => {
    const order = (se: unknown) => ["Red", se, "R", "Customer", "1 Oct 2026", "Transit"];
    const { rows, summary } = parseOrderList(workbook([
      ["Status", "SE", "Sales Type", "Customer", "Order Date", "Vehicle Details"],
      order("OlMa"),
      order("OlMa"),
      [null, null, null, null, null, "NEW TOTALS"],
      ["R", 42, null, null, null, "112 Units"],
      ["M", 0, null, null, null, "AVERAGE"],
      ["F", 1, null, null, null, "PENETRATION"],
    ]));
    expect(rows.map((r) => r.reportCode)).toEqual(["OlMa"]);
    expect(rows[0].orderCount).toBe(2);
    expect(summary.rowsAttributed).toBe(2);
  });
});

describe("attribution", () => {
  const map = new Map([["MiHo", "e1"], ["MHo", "e1"], ["LoBa", "e2"], ["Gone", "e9"]]);
  const participants = new Set(["e1", "e2", "e3"]);

  it("sums every report code mapped to the same exec", () => {
    // Previously the second code overwrote the first.
    const { byExec } = attributeReportRows("enquiry", [
      { reportCode: "MiHo", enquiryCount: 18, salesCount: 1 },
      { reportCode: "MHo", enquiryCount: 4, salesCount: 0 },
    ], map, participants);
    expect(byExec.get("e1")).toMatchObject({ enquiryCount: 22, salesCount: 1 });
  });

  it("zero-fills participants, skips non-participants, reports unmapped codes", () => {
    const { byExec, matched, unmapped } = attributeReportRows("orders", [
      { reportCode: "LoBa", orderCount: 6, latestVehicle: "Ranger" },
      { reportCode: "Gone", orderCount: 3, latestVehicle: null },
      { reportCode: "ZzZz", orderCount: 2, latestVehicle: null },
    ], map, participants);
    expect(byExec.get("e2")?.orderCount).toBe(6);
    expect(byExec.get("e3")?.orderCount).toBe(0);
    expect(byExec.has("e9")).toBe(false);
    expect(matched).toBe(1);
    expect(unmapped).toEqual([{ reportCode: "ZzZz", count: 1 }]);
  });

  it("sums inbound across codes, and leaves it null without source data", () => {
    const withSources = attributeReportRows("enquiry", [
      { reportCode: "MiHo", enquiryCount: 3, salesCount: 2, sourceStatusCounts: { "MotorComplete Lead": { Ordered: 1, Live: 1 }, Customer: { Ordered: 1 } } },
      { reportCode: "MHo", enquiryCount: 1, salesCount: 1, sourceStatusCounts: { "MotorComplete - carwow": { Delivered: 1 } } },
    ], map, participants);
    expect(withSources.byExec.get("e1")).toMatchObject({ enquiryCount: 4, salesCount: 3, inboundEnquiryCount: 3, inboundSalesCount: 2 });
    // Participants missing from the report are a true zero, not unknown.
    expect(withSources.byExec.get("e3")).toMatchObject({ inboundEnquiryCount: 0, inboundSalesCount: 0 });

    const legacy = attributeReportRows("enquiry", [
      { reportCode: "MiHo", enquiryCount: 3, salesCount: 2, statusCounts: { Ordered: 2, Live: 1 } },
    ], map, participants);
    expect(legacy.byExec.get("e1")).toMatchObject({ enquiryCount: 3, salesCount: 2, inboundEnquiryCount: null, inboundSalesCount: null });
  });

  it("derives enquiry sales from the status tally", () => {
    const { byExec } = attributeReportRows("enquiry", [
      { reportCode: "LoBa", enquiryCount: 2, salesCount: 0, statusCounts: { "Handover Arranged": 1, Live: 1 } },
    ], map, participants);
    expect(byExec.get("e2")?.salesCount).toBe(1);
  });
});

describe("formatConversion", () => {
  it("shows a dash, not 0%, when there were no enquiries", () => {
    expect(formatConversion({ enquiryCount: 0, conversionPct: 0 })).toBe("—");
    expect(formatConversion({ enquiryCount: 19, conversionPct: 0 })).toBe("0.0%");
    expect(formatConversion({ enquiryCount: 18, conversionPct: 100 / 18 })).toBe("5.6%");
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
