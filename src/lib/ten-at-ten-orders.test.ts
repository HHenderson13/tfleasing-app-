import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  NotAnOrderListError,
  classifyDealbook,
  cleanVehicle,
  deliveryOf,
  deliveryStatusOf,
  detectTenAtTenFile,
  parseFinance,
  parseOrderWorkbook,
  segmentOf,
} from "./ten-at-ten-orders";
import { avgProfit, budgetLines, budgetMonths, decodeOrders, encodeOrders, groupOrders, orderStatsOf, profitBand, rangeFor } from "./ten-at-ten-report";

const HEADER = ["Status", "SE", "Sales Type", "Customer", "Order Date", "Vehicle Details", ...new Array(11).fill("x"), "Finance Type",
  ...new Array(15).fill("x"), "Total Gross", "DMS Total Gross", "Difference", "Delivery Date"];

function order(se: unknown, customer: string | null, date: string | null, vehicle: string, finance: string, profit: unknown, delivery = ""): unknown[] {
  const r: unknown[] = new Array(37).fill(null);
  r[1] = se; r[3] = customer; r[4] = date; r[5] = vehicle; r[17] = finance; r[33] = profit; r[36] = delivery;
  return r;
}

function workbook(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "ag-grid");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("vehicle and segment", () => {
  it("drops the stray character Dealerweb appends", () => {
    expect(cleanVehicle("Explorer 210kW 77kWh Premium 5 Door 5 Seat 1")).toBe("Explorer 210kW 77kWh Premium 5 Door 5 Seat");
    expect(cleanVehicle("Puma Gen-E 123kW Select 43kWh Auto 5 Door n")).toBe("Puma Gen-E 123kW Select 43kWh Auto 5 Door");
    expect(cleanVehicle("Explorer 210kW 77kWh Select 5 Door 5 Seat .")).toBe("Explorer 210kW 77kWh Select 5 Door 5 Seat");
  });

  it("splits ICE cars, BEV cars and vans", () => {
    expect(segmentOf("Explorer", "Explorer 210kW 79kWh Style")).toBe("BEV Car");
    expect(segmentOf("Puma Gen-E", "Puma Electric Gen-E Hatch 124kW")).toBe("BEV Car");
    expect(segmentOf("Puma", "Puma 1.0 EcoBoost Hybrid mHEV 125 St-Line")).toBe("ICE Car");
    expect(segmentOf("Kuga", "Kuga 2.5 Duratec 243 Phev St-Line")).toBe("ICE Car");
    expect(segmentOf("Transit Custom", "Transit Custom 320L1 2.0TDCi")).toBe("Van");
    expect(segmentOf("Transit E-Custom", "E-Transit Custom")).toBe("Van");
    expect(segmentOf("Ranger", "Ranger Double Cab Pick Up 2.3 EcoBoost Phev")).toBe("Van");
    expect(segmentOf("Explorer Van", "Explorer Electric 210KW Select Van")).toBe("Van");
  });
});

describe("finance and delivery", () => {
  it("reads product, term and funder from column R", () => {
    expect(parseFinance("HP 60 Nov 31234.50")).toEqual({ product: "HP", termMonths: 60, funder: "Novuna" });
    expect(parseFinance("Contract Hire 48 ALD 29274.16")).toEqual({ product: "Contract Hire", termMonths: 48, funder: "ALD" });
    expect(parseFinance("HP 60 Arv 1")).toMatchObject({ funder: "Arval" });
    expect(parseFinance("Contract Hire 60 Lex 35268.20")).toMatchObject({ funder: "Lex" });
    expect(parseFinance("HP 60 For 2")).toMatchObject({ funder: "Ford Credit" });
    expect(parseFinance("Cash")).toEqual({ product: "Cash", termMonths: null, funder: "Cash" });
    expect(parseFinance("12345.67")).toEqual({ product: "Not stated", termMonths: null, funder: "Not stated" });
    expect(parseFinance("NON OPP")).toMatchObject({ product: "Non-opportunity" });
  });

  it("reads delivered or awaiting from column AK", () => {
    expect(deliveryOf("9 Oct 2026 Dlv")).toBe("Delivered");
    expect(deliveryOf("30 Nov 2026 Est")).toBe("Awaiting delivery");
    expect(deliveryOf("")).toBe("Not stated");
  });
});

describe("parseOrderWorkbook", () => {
  const file = workbook([
    HEADER,
    order("DeDu", "DEA GATE AUTOMATION LTD", "9 Oct 2026", "Transit Custom Double Cab In 320L2 2.0TDCi 136 EcoBlue Limited 2 Door 3 Seat ", "Contract Hire 60 Nov 31000", "-1101.9", "30 Nov 2026 Est"),
    order("DeDu", "DEA GATE AUTOMATION LTD", "9 Oct 2026", "Transit Custom Double Cab In 320L2 2.0TDCi 136 EcoBlue Limited 2 Door 3 Seat 1", "Contract Hire 60 Nov 31000", "-1101.9", "30 Nov 2026 Est"),
    order("OlMa", "Jo Jos holiday lettings limited", "1 Oct 2026", "Capri 140kW 58kWh Premium Auto 5 Door 5 Seat ", "HP 60 Lex 30000", "1403.96", "9 Oct 2026 Dlv"),
    order("JoRu", "Someone", "2 Oct 2026", "Kuga 2.5 Duratec 243 Phev St-Line Auto 5 Door 5 Seat", "Cash", "500"),
    order(null, null, null, "NEW TOTALS", "", "-3667.17"),
    order(29, "(+0 NON OP S, +0 NON OPP)", null, "29 Units(0 Unconf.)", "", null),
    order(0, null, null, "AVERAGE", "", "-126.45"),
  ]);

  it("keeps identical same-day orders as separate units and skips the totals block", () => {
    const p = parseOrderWorkbook(file);
    expect(p.rowsInFile).toBe(4);
    expect(p.rows).toHaveLength(3);
    const dea = p.rows.filter((r) => r.customer.startsWith("DEA"));
    expect(dea).toHaveLength(2);
    expect(new Set(dea.map((r) => r.id)).size).toBe(2);
    expect(dea[0]).toMatchObject({ segment: "Van", model: "Transit Custom", funder: "Novuna", product: "Contract Hire", termMonths: 60, profit: -1101.9, delivery: "Awaiting delivery", orderDay: "2026-10-09" });
    expect(p.rows.find((r) => r.exec === "OlMa")).toMatchObject({ segment: "BEV Car", profit: 1403.96, delivery: "Delivered" });
  });

  it("gives the same keys when the same file is uploaded again", () => {
    expect(parseOrderWorkbook(file).rows.map((r) => r.id)).toEqual(parseOrderWorkbook(file).rows.map((r) => r.id));
  });

  it("strips HaHe and JoRu", () => {
    const p = parseOrderWorkbook(file);
    expect(p.skippedExcluded).toBe(1);
    expect(p.excludedIds).toHaveLength(1);
    expect(p.rows.some((r) => r.exec === "JoRu")).toBe(false);
  });

  it("tells the order list from the enquiry log by its header", () => {
    expect(detectTenAtTenFile(file)).toBe("dealbook");
    const enquiryHeader = ["Date Time", "SE", "Dealer Location", "Customer", "Source", "NU", "Model", ...new Array(9).fill("x"), "Status"];
    expect(detectTenAtTenFile(workbook([enquiryHeader]))).toBe("enquiries");
    const motorComplete = ["Dealer", "Created By", "Customer", "Customer Id", "Date Raised", "Type", ...new Array(9).fill("x"), "Date Transferred"];
    expect(detectTenAtTenFile(workbook([motorComplete]))).toBe("response");
    expect(detectTenAtTenFile(workbook([["Created By", "Customer"]]))).toBeNull();
    expect(() => parseOrderWorkbook(workbook([["Created By", "Customer"]]))).toThrow(NotAnOrderListError);
  });
});

describe("order stats", () => {
  const rows = decodeOrders(encodeOrders([
    { orderDay: "2026-10-01", exec: "DeDu", customer: "A", model: "Transit Custom", derivative: null, derivativeKey: null, segment: "Van", product: "HP", termMonths: 60, funder: "Novuna", delivery: "Delivered", profit: -1000 },
    { orderDay: "2026-10-02", exec: "DeDu", customer: "B", model: "Capri", derivative: null, derivativeKey: null, segment: "BEV Car", product: "HP", termMonths: 60, funder: "Lex", delivery: "Delivered", profit: 3000 },
    { orderDay: "2026-10-03", exec: "OlMa", customer: "C", model: "Capri", derivative: null, derivativeKey: null, segment: "BEV Car", product: "Cash", termMonths: null, funder: "Cash", delivery: "Awaiting delivery", profit: null },
  ], new Map([["DeDu", "Declan Dunn"]])));

  it("averages profit over the units that carry a figure", () => {
    const s = orderStatsOf(rows);
    expect(s).toEqual({ orders: 3, profit: 2000, priced: 2, loss: 1 });
    expect(avgProfit(s)).toBe(1000);
    expect(avgProfit(orderStatsOf([]))).toBeNull();
  });

  it("groups by segment in fixed order and bands profit", () => {
    const segs = groupOrders(rows, ["segment"], "label");
    expect(segs.map((g) => g.label)).toEqual(["BEV Car", "Van"]);
    // Each group carries its orders, for the customer drill-down.
    expect(segs[0].rows.map((r) => r.customer).sort()).toEqual(["B", "C"]);
    expect(groupOrders(rows, ["profitBand"], "label").map((g) => g.label)).toEqual(["−£1,000 and below", "£2,000 and above", "No profit figure"]);
    expect(rows[0]).toMatchObject({ exec: "Declan Dunn", profitBand: "−£1,000 and below", term: "60 months" });
    expect(profitBand(-1000)).toBe("−£1,000 and below");
    expect(profitBand(-999.5)).toBe("−£999 to −£500");
    expect(profitBand(-500)).toBe("−£999 to −£500");
    expect(profitBand(-0.5)).toBe("−£499 to −£1");
    expect(profitBand(0)).toBe("£0 to £499");
    expect(profitBand(1999.99)).toBe("£1,000 to £1,999");
    expect(profitBand(2000)).toBe("£2,000 and above");
    expect(profitBand(null)).toBe("No profit figure");
  });
});

describe("Dealbook – Orders or Dealbook – Deliveries", () => {
  const row = (orderDay: string, deliveryDay: string | null) => ({ orderDay, deliveryDay });

  it("tells the two apart by which date sits in one month", () => {
    // export (46): October orders, deliveries spread to March.
    expect(classifyDealbook([row("2026-10-01", "2026-10-30"), row("2026-10-09", "2026-11-30"), row("2026-10-05", "2027-03-31")])).toBe("orders");
    // export (47): October deliveries, ordered back to May.
    expect(classifyDealbook([row("2026-05-14", "2026-10-02"), row("2026-09-20", "2026-10-31"), row("2026-10-12", "2026-10-31")])).toBe("deliveries");
  });

  it("asks when both dates sit in one month", () => {
    expect(classifyDealbook([row("2026-10-01", "2026-10-30"), row("2026-10-03", "2026-10-31")])).toBeNull();
  });

  it("reads delivered, arrived and due from column AK", () => {
    expect(deliveryStatusOf("9 Oct 2026 Dlv")).toBe("Delivered");
    expect(deliveryStatusOf("15 Oct 2026 Arr")).toBe("Arrived");
    expect(deliveryStatusOf("31 Oct 2026 Est")).toBe("Due");
    expect(deliveryStatusOf("")).toBe("Not stated");
  });
});

describe("deliveries vs budget", () => {
  const budgets = { "2026-10": { car: 106, cv: 40 }, "2026-11": { car: 78, cv: 32 }, "2026-12": { car: 61, cv: 20 } };
  const deliveries = decodeOrders(encodeOrders([
    ...Array.from({ length: 3 }, () => ({ status: "Delivered", segment: "BEV Car" })),
    { status: "Due", segment: "ICE Car" },
    { status: "Delivered", segment: "Van" },
    { status: "Arrived", segment: "Van" },
    { status: "Due", segment: "Van" },
  ].map((x, i) => ({
    orderDay: "2026-10-05", exec: "DoJa", customer: `C${i}`, model: "M", derivative: null, derivativeKey: null,
    segment: x.segment, product: "HP", termMonths: 60, funder: "Lex", delivery: x.status, profit: 100,
  }))));

  it("only compares whole months — budgets are monthly", () => {
    expect(budgetMonths(rangeFor("month", "2026-10-12", { from: "", to: "" }))).toEqual(["2026-10"]);
    expect(budgetMonths(rangeFor("quarter", "2026-11-02", { from: "", to: "" }))).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(budgetMonths(rangeFor("custom", "", { from: "2026-11-01", to: "2026-12-31" }))).toEqual(["2026-11", "2026-12"]);
    expect(budgetMonths(rangeFor("week", "2026-10-12", { from: "", to: "" }))).toBeNull();
    expect(budgetMonths(rangeFor("custom", "", { from: "2026-10-05", to: "2026-10-31" }))).toBeNull();
  });

  it("splits Car and CV, and combines them", () => {
    const l = budgetLines(deliveries, budgets, ["2026-10"]);
    expect(l.car).toMatchObject({ budget: 106, delivered: 3, arrived: 0, due: 1 });
    expect(l.cv).toMatchObject({ budget: 40, delivered: 1, arrived: 1, due: 1 });
    expect(l.combined).toMatchObject({ budget: 146, delivered: 4, arrived: 1, due: 2 });
    expect(budgetLines(deliveries, budgets, ["2026-10", "2026-11", "2026-12"]).combined.budget).toBe(337);
  });

  it("never treats a month without a budget as zero", () => {
    const l = budgetLines(deliveries, budgets, ["2027-01"]);
    expect(l.combined.budget).toBeNull();
    expect(l.car.missing).toEqual(["2027-01"]);
  });
});
