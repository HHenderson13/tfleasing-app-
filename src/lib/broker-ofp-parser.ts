// Parser for the Ford quarterly OFP workbooks. Two products — Commercial
// Vehicles (CV) and Passenger Vehicles (PV) — each shipped as its own
// .xlsx with two sheets:
//
//   CV workbook:
//     sheet 1 ("CV Options" or similar) — PCP terminals
//     sheet 2 ("CV Balloon HP")          — HP-with-Balloon terminals
//   PV workbook:
//     sheet 1 ("TCM")                    — PCP terminals
//     sheet 2 ("BHP")                    — HP-with-Balloon terminals
//
// Each sheet has 3 junk rows at the top, header in row 4 (we don't need
// to read it — column-to-term mapping is fixed per spec), then 3000+
// data rows. Column A is metadata we ignore; B = vehicle description;
// C = model year; the rest is a (term × mileage) grid of balloon values.
//
// Column maps below come straight from the supplied spec. New quarters
// can add columns at the end (more terms / more mileage bands) — that
// just means extending these arrays and re-uploading.

import * as XLSX from "xlsx";

export type VehicleClass = "cv" | "pv";
export type OfpRoute = "pcp" | "hp_balloon";

export interface OfpColumn {
  /** Zero-based column index in the sheet. */
  col: number;
  termMonths: number;
  annualMileage: number;
}

// Column-letter helpers (A=0, Z=25, AA=26, …) — only used internally
// when constructing the maps below so the maps read like the source spec.
function colLetterToIndex(letter: string): number {
  let n = 0;
  for (let i = 0; i < letter.length; i++) {
    n = n * 26 + (letter.charCodeAt(i) - 64);
  }
  return n - 1;
}

// Generate a contiguous run of OFP columns: starting at `from`, ending at
// `to` inclusive, for a single term across the given mileages in order.
function run(from: string, to: string, termMonths: number, mileages: number[]): OfpColumn[] {
  const start = colLetterToIndex(from);
  const end = colLetterToIndex(to);
  const span = end - start + 1;
  if (span !== mileages.length) {
    throw new Error(`OFP column run ${from}:${to} expected ${span} mileages, got ${mileages.length}`);
  }
  return mileages.map((mileage, i) => ({ col: start + i, termMonths, annualMileage: mileage }));
}

// ─── CV ─────────────────────────────────────────────────────────────────────

// CV PCP (sheet 1). D:I = 24m at 9k/12k/18k/24k/30k/36k; J:L = 36m at 9k/12k/18k;
// M:O = 48m at 9k/12k/18k.
const CV_PCP_COLS: OfpColumn[] = [
  ...run("D", "I", 24, [9000, 12000, 18000, 24000, 30000, 36000]),
  ...run("J", "L", 36, [9000, 12000, 18000]),
  ...run("M", "O", 48, [9000, 12000, 18000]),
];

// CV HP-Balloon (sheet 2). D:I = 24m; J:O = 36m; P:U = 48m. All at the
// full 9k–36k mileage set.
const CV_HP_BALLOON_COLS: OfpColumn[] = [
  ...run("D", "I", 24, [9000, 12000, 18000, 24000, 30000, 36000]),
  ...run("J", "O", 36, [9000, 12000, 18000, 24000, 30000, 36000]),
  ...run("P", "U", 48, [9000, 12000, 18000, 24000, 30000, 36000]),
];

// ─── PV ─────────────────────────────────────────────────────────────────────

// PV PCP (TCM sheet). Six 6000-stepped mileage bands at most terms; the
// 48m / 60m runs truncate at 18k / 15k respectively.
const PV_PCP_COLS: OfpColumn[] = [
  ...run("D", "I", 24, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("J", "O", 26, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("P", "U", 36, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("V", "AA", 38, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("AB", "AF", 48, [6000, 9000, 12000, 15000, 18000]),
  ...run("AG", "AJ", 60, [6000, 9000, 12000, 15000]),
];

// PV HP-Balloon (BHP sheet). Same six mileage bands all the way through —
// no truncation.
const PV_HP_BALLOON_COLS: OfpColumn[] = [
  ...run("D", "I", 24, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("J", "O", 26, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("P", "U", 36, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("V", "AA", 38, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("AB", "AG", 48, [6000, 9000, 12000, 15000, 18000, 24000]),
  ...run("AH", "AM", 60, [6000, 9000, 12000, 15000, 18000, 24000]),
];

// ─── Parser ─────────────────────────────────────────────────────────────────

export interface OfpParsedRow {
  fundingRoute: OfpRoute;
  vehicle: string;
  modelYear: string | null;
  termMonths: number;
  annualMileage: number;
  balloonGbp: number;
}

export interface OfpParseResult {
  rows: OfpParsedRow[];
  warnings: string[];
  sheetSummary: { sheetName: string; route: OfpRoute; rowsRead: number; cellsAttributed: number }[];
}

const COL_VEHICLE = 1;     // column B
const COL_MODEL_YEAR = 2;  // column C
// Data starts at row 5 (rows 1-3 are junk, row 4 is the header).
const DATA_ROW_START = 4;  // zero-indexed → row 5

function modelYearString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    // 2026 vs 2026.0 vs 2025.5 — keep one decimal when not whole, else int.
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function vehicleString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function balloonNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  // Strip £ and commas in case the export contains them.
  const cleaned = String(value).replace(/[£,\s]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseSheet(
  sheet: XLSX.WorkSheet,
  route: OfpRoute,
  columns: OfpColumn[],
): { rows: OfpParsedRow[]; rowsRead: number; cellsAttributed: number } {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const rows: OfpParsedRow[] = [];
  let rowsRead = 0;
  let cellsAttributed = 0;
  for (let r = DATA_ROW_START; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const vehicle = vehicleString(row[COL_VEHICLE]);
    if (!vehicle) continue; // skip blank trailers
    const modelYear = modelYearString(row[COL_MODEL_YEAR]);
    rowsRead++;
    for (const c of columns) {
      const value = balloonNumber(row[c.col]);
      if (value === null || value <= 0) continue;
      rows.push({
        fundingRoute: route,
        vehicle,
        modelYear,
        termMonths: c.termMonths,
        annualMileage: c.annualMileage,
        balloonGbp: value,
      });
      cellsAttributed++;
    }
  }
  return { rows, rowsRead, cellsAttributed };
}

export function parseOfpWorkbook(buffer: ArrayBuffer, vehicleClass: VehicleClass): OfpParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const warnings: string[] = [];
  const sheetSummary: OfpParseResult["sheetSummary"] = [];
  const allRows: OfpParsedRow[] = [];

  // Sheet ordering is positional — sheet[0] is PCP, sheet[1] is HP-Balloon.
  // Names vary by class ("CV Options" vs "TCM", "CV Balloon HP" vs "BHP"),
  // so we don't match on names; we just verify both sheets exist.
  const sheets = wb.SheetNames.map((n) => ({ name: n, sheet: wb.Sheets[n] }));
  if (sheets.length < 2) {
    warnings.push(`Workbook only has ${sheets.length} sheet(s); expected 2 (PCP + HP-Balloon).`);
  }

  const pcpCols = vehicleClass === "cv" ? CV_PCP_COLS : PV_PCP_COLS;
  const hpBalCols = vehicleClass === "cv" ? CV_HP_BALLOON_COLS : PV_HP_BALLOON_COLS;

  if (sheets[0]) {
    const out = parseSheet(sheets[0].sheet, "pcp", pcpCols);
    sheetSummary.push({ sheetName: sheets[0].name, route: "pcp", rowsRead: out.rowsRead, cellsAttributed: out.cellsAttributed });
    allRows.push(...out.rows);
  }
  if (sheets[1]) {
    const out = parseSheet(sheets[1].sheet, "hp_balloon", hpBalCols);
    sheetSummary.push({ sheetName: sheets[1].name, route: "hp_balloon", rowsRead: out.rowsRead, cellsAttributed: out.cellsAttributed });
    allRows.push(...out.rows);
  }
  return { rows: allRows, warnings, sheetSummary };
}
