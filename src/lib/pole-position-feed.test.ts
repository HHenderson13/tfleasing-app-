import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  FEED_FROM_MONTH, deliveredRowsFrom, enquiryRowsFrom, isFedMonth, orderRowsFrom, rowsFingerprint,
} from "./pole-position-feed";
import {
  attributeReportRows, countInsuranceProducts, parseDeliveredList, parseEnquiryLog, parseOrderList,
} from "./sales-leaderboard";

// A sheet the way Pole Position's own parsers read it: header row, exec in B.
function sheet(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Header"], ...rows]), "ag-grid");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}
const at = (i: number, v: unknown, width = 30) => { const r: unknown[] = Array(width).fill(null); r[i] = v; return r; };
const enquiryRow = (exec: string, source: string, status: string) => { const r = at(1, exec); r[4] = source; r[16] = status; return r; };

const codeToExec = new Map([["DeDu", "deniz"], ["MiHo", "minny"], ["LoBa", "lou"], ["XxYy", "lou"]]);
const participants = new Set(["deniz", "minny", "lou"]);

describe("fed from 10 at 10", () => {
  it("only feeds months from the cut-over; earlier months are history", () => {
    expect(FEED_FROM_MONTH).toBe("2026-10");
    expect(isFedMonth("2026-09")).toBe(false);
    expect(isFedMonth("2026-10")).toBe(true);
    expect(isFedMonth("2027-01")).toBe(true);
  });

  it("gives the board the same Inbound Conversion as the enquiry log file did", () => {
    const lines = [
      ["DeDu", "MotorComplete Lead", "Ordered"],
      ["DeDu", "MotorComplete - Leasing.com", "Live"],
      ["DeDu", "Customer", "Delivered"],
      ["MiHo", "MotorComplete - carwow", "Handover Arranged"],
      ["MiHo", "Broker Introduction", "Lost Sale"],
      ["LoBa", "MotorComplete - LeaseLoco", "Lost Sale"],
      ["XxYy", "MotorComplete Lead", "Delivered"],
      ["ZzZz", "MotorComplete Lead", "Ordered"], // unmapped
    ] as const;
    const fromFile = parseEnquiryLog(sheet(lines.map(([e, s, st]) => enquiryRow(e, s, st)))).rows;
    const fed = enquiryRowsFrom(lines.map(([exec, sourceRaw, status]) => ({ exec, sourceRaw, status })));
    const a = attributeReportRows("enquiry", fromFile, codeToExec, participants);
    const b = attributeReportRows("enquiry", fed, codeToExec, participants);
    expect([...b.byExec]).toEqual([...a.byExec]);
    expect(b.unmapped).toEqual(a.unmapped);
    expect(b.byExec.get("deniz")).toMatchObject({ inboundEnquiryCount: 2, inboundSalesCount: 1, enquiryCount: 3, salesCount: 2 });
    expect(b.byExec.get("lou")).toMatchObject({ inboundEnquiryCount: 2, inboundSalesCount: 1 }); // two codes, one exec
  });

  it("gives the board the same Deliveries and Insurance as the delivered list did", () => {
    const rows = [at(1, "DeDu"), at(1, "DeDu"), at(1, "MiHo"), at(1, "LoBa")];
    rows[0][22] = 299; rows[0][25] = 120;          // two products
    rows[1][28] = 49;                               // one
    rows[2][24] = 0; rows[2][20] = 500;             // a zero, and Finance Bonus (outside W:AC)
    rows[3][23] = "75.00";                          // text figures count
    const fromFile = parseDeliveredList(sheet(rows)).rows;
    const fed = deliveredRowsFrom(rows.map((r) => ({ exec: r[1] as string, insuranceCount: countInsuranceProducts(r) })))!;
    const a = attributeReportRows("delivered", fromFile, codeToExec, participants);
    const b = attributeReportRows("delivered", fed, codeToExec, participants);
    expect([...b.byExec]).toEqual([...a.byExec]);
    expect(b.byExec.get("deniz")).toMatchObject({ deliveryCount: 2, insuranceCount: 3 });
    expect(b.byExec.get("minny")).toMatchObject({ deliveryCount: 1, insuranceCount: 0 });
  });

  it("waits on a month whose delivery lines predate insurance being read, rather than feeding a zero", () => {
    expect(deliveredRowsFrom([{ exec: "DeDu", insuranceCount: 1 }, { exec: "MiHo", insuranceCount: null }])).toBeNull();
    expect(deliveredRowsFrom([])).toEqual([]);
  });

  it("counts Order Take per exec, with the vehicle from their latest order", () => {
    const fed = orderRowsFrom([
      { exec: "DeDu", orderedAt: 3, vehicle: "Ranger Wildtrak" },
      { exec: "DeDu", orderedAt: 9, vehicle: "Transit Custom 320L2" },
      { exec: "DeDu", orderedAt: 5, vehicle: "Puma" },
      { exec: "MiHo", orderedAt: 1, vehicle: null },
    ]);
    expect(fed).toEqual([
      { reportCode: "DeDu", orderCount: 3, latestVehicle: "Transit Custom 320L2" },
      { reportCode: "MiHo", orderCount: 1, latestVehicle: null },
    ]);
    // The same counts the order list file gave.
    const fromFile = parseOrderList(sheet([at(1, "DeDu"), at(1, "DeDu"), at(1, "DeDu"), at(1, "MiHo")])).rows;
    expect(fromFile.map((r) => [r.reportCode, r.orderCount])).toEqual(fed.map((r) => [r.reportCode, r.orderCount]));
  });

  it("fingerprints a slot the same however its rows are ordered, so an unchanged month isn't stored again", () => {
    const a = enquiryRowsFrom([{ exec: "DeDu", sourceRaw: "MotorComplete Lead", status: "Live" }, { exec: "MiHo", sourceRaw: "Customer", status: "Ordered" }]);
    const b = enquiryRowsFrom([{ exec: "MiHo", sourceRaw: "Customer", status: "Ordered" }, { exec: "DeDu", sourceRaw: "MotorComplete Lead", status: "Live" }]);
    expect(rowsFingerprint(a)).toBe(rowsFingerprint(b));
    const c = enquiryRowsFrom([{ exec: "DeDu", sourceRaw: "MotorComplete Lead", status: "Ordered" }, { exec: "MiHo", sourceRaw: "Customer", status: "Ordered" }]);
    expect(rowsFingerprint(c)).not.toBe(rowsFingerprint(a));
  });
});
