import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseOfpWorkbook } from "./broker-ofp-parser";

// Build a fake workbook whose layout matches the spec the user supplied
// for each class. Validates the column maps point at the right cells.
function buildWorkbook(spec: "cv" | "pv"): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  if (spec === "cv") {
    // PCP sheet — D:I 24m (6 mileages), J:L 36m (3), M:O 48m (3) = 12 cells/row.
    const headerRow = Array(15).fill("");
    const dataRow = Array(15).fill(null);
    dataRow[0] = "OPTIONS";
    dataRow[1] = "Focus ST-Line";
    dataRow[2] = 2026;
    // Fill D..O with sequential numbers so we can verify column order.
    for (let i = 3; i <= 14; i++) dataRow[i] = (i - 2) * 1000;
    const aoa = [headerRow, headerRow, headerRow, headerRow, dataRow];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "CV Options");

    // HP-Balloon sheet — D:I 24m, J:O 36m, P:U 48m = 18 cells/row.
    const dataRow2 = Array(21).fill(null);
    dataRow2[0] = "HP-Bal";
    dataRow2[1] = "Transit Custom Limited";
    dataRow2[2] = "2025.5";
    for (let i = 3; i <= 20; i++) dataRow2[i] = (i - 2) * 100;
    const aoa2 = [headerRow, headerRow, headerRow, headerRow, dataRow2];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa2), "CV Balloon HP");
  } else {
    // PV PCP (TCM) — D:I 24m (6), J:O 26m (6), P:U 36m (6), V:AA 38m (6),
    // AB:AF 48m (5), AG:AJ 60m (4) = 33 cells/row.
    const headerRow = Array(36).fill("");
    const dataRow = Array(36).fill(null);
    dataRow[0] = "OPT";
    dataRow[1] = "Focus ST-Line";
    dataRow[2] = 2026;
    for (let i = 3; i <= 35; i++) dataRow[i] = (i - 2) * 10;
    const aoa = [headerRow, headerRow, headerRow, headerRow, dataRow];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "TCM");

    // PV BHP — same as TCM but 48m & 60m are full 6 mileages = 36 cells/row.
    const dataRow2 = Array(39).fill(null);
    dataRow2[0] = "HP-Bal";
    dataRow2[1] = "Focus Vignale";
    dataRow2[2] = 2026;
    for (let i = 3; i <= 38; i++) dataRow2[i] = (i - 2) * 5;
    const aoa2 = [headerRow, headerRow, headerRow, headerRow, dataRow2];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa2), "BHP");
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return buf as ArrayBuffer;
}

describe("CV OFP parser", () => {
  const result = parseOfpWorkbook(buildWorkbook("cv"), "cv");

  it("produces the expected cell counts per sheet", () => {
    const summary = Object.fromEntries(result.sheetSummary.map((s) => [s.route, s.cellsAttributed]));
    expect(summary.pcp).toBe(12);
    expect(summary.hp_balloon).toBe(18);
  });

  it("maps PCP columns to the right (term, mileage) pairs", () => {
    const pcp = result.rows.filter((r) => r.fundingRoute === "pcp");
    const terms = new Set(pcp.map((r) => r.termMonths));
    expect(terms).toEqual(new Set([24, 36, 48]));
    // 24m has 6 mileages, 36m has 3, 48m has 3 — total 12.
    expect(pcp.filter((r) => r.termMonths === 24).length).toBe(6);
    expect(pcp.filter((r) => r.termMonths === 36).length).toBe(3);
    expect(pcp.filter((r) => r.termMonths === 48).length).toBe(3);
  });

  it("maps HP-Balloon columns through to the 48m × 36k slot", () => {
    const hpBal = result.rows.filter((r) => r.fundingRoute === "hp_balloon");
    expect(hpBal.filter((r) => r.termMonths === 24).length).toBe(6);
    expect(hpBal.filter((r) => r.termMonths === 36).length).toBe(6);
    expect(hpBal.filter((r) => r.termMonths === 48).length).toBe(6);
    expect(hpBal.find((r) => r.termMonths === 48 && r.annualMileage === 36000)).toBeTruthy();
  });
});

describe("PV OFP parser", () => {
  const result = parseOfpWorkbook(buildWorkbook("pv"), "pv");

  it("handles the irregular 48m / 60m truncation on the TCM sheet", () => {
    const pcp = result.rows.filter((r) => r.fundingRoute === "pcp");
    expect(pcp.filter((r) => r.termMonths === 24).length).toBe(6);
    expect(pcp.filter((r) => r.termMonths === 26).length).toBe(6);
    expect(pcp.filter((r) => r.termMonths === 36).length).toBe(6);
    expect(pcp.filter((r) => r.termMonths === 38).length).toBe(6);
    // 48m only goes to 18k — five mileages.
    expect(pcp.filter((r) => r.termMonths === 48).length).toBe(5);
    expect(pcp.find((r) => r.termMonths === 48 && r.annualMileage === 24000)).toBeUndefined();
    // 60m only goes to 15k — four mileages.
    expect(pcp.filter((r) => r.termMonths === 60).length).toBe(4);
  });

  it("BHP sheet has the full six-mileage set at every term including 60m", () => {
    const hpBal = result.rows.filter((r) => r.fundingRoute === "hp_balloon");
    expect(hpBal.filter((r) => r.termMonths === 60).length).toBe(6);
    expect(hpBal.find((r) => r.termMonths === 60 && r.annualMileage === 24000)).toBeTruthy();
  });
});
