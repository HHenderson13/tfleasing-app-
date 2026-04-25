import * as XLSX from "xlsx";

export interface ParsedRatebookRow {
  capCode: string;
  initialRentalMultiplier: number;
  termMonths: number;
  annualMileage: number;
  isBusiness: boolean;
  isMaintained: boolean;
  monthlyRental: number;
  monthlyMaintenance: number;
}

export interface ParsedVehicle {
  capCode: string;
  model: string | null;
  derivative: string | null;
  fuelType: string | null;
  listPriceNet: number | null;
}

export interface ParseResult {
  rows: ParsedRatebookRow[];
  vehicles: ParsedVehicle[];
  warnings: string[];
  diagnostics?: ColumnDiagnostics;
}

export interface ColumnDiagnostics {
  sheetName: string;
  totalRows: number;
  headersAtExpectedCols: Record<string, string | null>;
  headerIdxFoundAt: Record<string, number>;
  firstDataRowSample: Record<string, string | null>;
}

const normCap = (s: string) => s.trim().replace(/\s+/g, " ");
const asStr = (v: any) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const asBool = (v: any) => v === true || v === 1 || v === "1" || /^true$/i.test(String(v ?? ""));
const asNum = (v: any) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[£,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Zero-based column indices for vehicle metadata (consistent across all funder ratebook files).
const COL = {
  capCode: 5,    // F
  model: 35,     // AJ
  fuelType: 46,  // AU
  derivative: 50, // AY
  listPriceNet: 55, // BD
};

/**
 * Parse a ratebook file (xlsx or csv). Rate columns are matched by header name;
 * vehicle metadata (model/derivative/fuel/BLP) is read by fixed column letter.
 */
export function parseRatebookBuffer(buf: ArrayBuffer | Buffer, filename: string): ParseResult {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], vehicles: [], warnings: [`No sheet in ${filename}`] };

  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, blankrows: false });
  if (aoa.length < 2) return { rows: [], vehicles: [], warnings: [`No data rows in ${filename}`] };

  const header = aoa[0].map((h) => (h == null ? "" : String(h)));
  const normHeader = (s: string) => s.trim().toLowerCase().replace(/[\s_-]/g, "");
  const findIdx = (keys: string[]) => {
    for (let i = 0; i < header.length; i++) {
      if (keys.includes(normHeader(header[i]))) return i;
    }
    return -1;
  };
  const idx = {
    cap: findIdx(["capcode"]),
    mi: findIdx(["annualmileage", "mileage"]),
    irm: findIdx(["initialrentalmultiplier", "initialrental", "upfront"]),
    term: findIdx(["termlength", "term", "termmonths"]),
    biz: findIdx(["isbusiness", "business"]),
    maint: findIdx(["ismaintained", "maintained"]),
    mo: findIdx(["monthlyrentalprice", "monthlyrental", "rental"]),
    moMaint: findIdx(["monthlymaintenanceprice", "monthlymaintenance", "maintenance"]),
    // Header-name fallbacks for vehicle metadata (used if the fixed cell letter is blank).
    model: findIdx(["model", "modelname", "rangedescription", "range"]),
    derivative: findIdx(["derivative", "trim", "variant", "description", "shortdescription"]),
    fuelType: findIdx(["fueltype", "fuel", "fueldescription"]),
    listPriceNet: findIdx(["listpricenet", "listprice", "blp", "basiclistprice", "pricebasenet", "basepricenet", "p11d", "otr"]),
  };
  const warnings: string[] = [];

  // Build diagnostics so callers can verify column mapping without guesswork.
  const firstData = aoa[1] ?? [];
  const colName = (i: number) => {
    if (i < 0) return "(not found)";
    if (i < 26) return String.fromCharCode(65 + i);
    return String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
  };
  const diagnostics: ColumnDiagnostics = {
    sheetName,
    totalRows: aoa.length - 1,
    headersAtExpectedCols: {
      "F(capCode)": header[COL.capCode] || null,
      "AJ(model)": header[COL.model] || null,
      "AU(fuelType)": header[COL.fuelType] || null,
      "AY(derivative)": header[COL.derivative] || null,
      "BD(listPriceNet)": header[COL.listPriceNet] || null,
    },
    headerIdxFoundAt: {
      capCode: idx.cap,
      model: idx.model,
      fuelType: idx.fuelType,
      derivative: idx.derivative,
      listPriceNet: idx.listPriceNet,
      monthlyRental: idx.mo,
      termMonths: idx.term,
      annualMileage: idx.mi,
    },
    firstDataRowSample: {
      [`col-F[${COL.capCode}]`]: asStr(firstData[COL.capCode]),
      [`col-AJ[${COL.model}]`]: asStr(firstData[COL.model]),
      [`col-AU[${COL.fuelType}]`]: asStr(firstData[COL.fuelType]),
      [`col-AY[${COL.derivative}]`]: asStr(firstData[COL.derivative]),
      [`col-BD[${COL.listPriceNet}]`]: asStr(firstData[COL.listPriceNet]),
      [`headerFound-capCode(col${colName(idx.cap)})[${idx.cap}]`]: asStr(firstData[idx.cap]),
      [`headerFound-model(col${colName(idx.model)})[${idx.model}]`]: asStr(firstData[idx.model]),
    },
  };

  if (idx.cap < 0 || idx.mi < 0 || idx.irm < 0 || idx.term < 0 || idx.mo < 0) {
    warnings.push(`Missing required rate columns in ${filename}`);
    return { rows: [], vehicles: [], warnings, diagnostics };
  }

  const rows: ParsedRatebookRow[] = [];
  const vehicleMap = new Map<string, ParsedVehicle>();

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;

    const capCodeRaw = row[idx.cap] ?? row[COL.capCode];
    const capCode = normCap(String(capCodeRaw ?? ""));
    if (!capCode) continue;

    const monthly = asNum(row[idx.mo]);
    const term = asNum(row[idx.term]);
    const mileage = asNum(row[idx.mi]);
    const irm = asNum(row[idx.irm]);
    if (!Number.isFinite(monthly) || !Number.isFinite(term) || !Number.isFinite(mileage) || !Number.isFinite(irm)) continue;

    rows.push({
      capCode,
      initialRentalMultiplier: irm,
      termMonths: term,
      annualMileage: mileage,
      isBusiness: idx.biz >= 0 ? asBool(row[idx.biz]) : true,
      isMaintained: idx.maint >= 0 ? asBool(row[idx.maint]) : false,
      monthlyRental: monthly,
      monthlyMaintenance: idx.moMaint >= 0 ? asNum(row[idx.moMaint]) || 0 : 0,
    });

    const pickStr = (fixedCol: number, headerIdx: number) =>
      asStr(row[fixedCol]) ?? (headerIdx >= 0 ? asStr(row[headerIdx]) : null);
    const pickNum = (fixedCol: number, headerIdx: number) => {
      const a = asNum(row[fixedCol]);
      if (Number.isFinite(a)) return a;
      if (headerIdx >= 0) {
        const b = asNum(row[headerIdx]);
        if (Number.isFinite(b)) return b;
      }
      return null;
    };
    const vehicle: ParsedVehicle = {
      capCode,
      model: pickStr(COL.model, idx.model),
      derivative: pickStr(COL.derivative, idx.derivative),
      fuelType: pickStr(COL.fuelType, idx.fuelType),
      listPriceNet: pickNum(COL.listPriceNet, idx.listPriceNet),
    };
    const prev = vehicleMap.get(capCode);
    if (!prev) {
      vehicleMap.set(capCode, vehicle);
    } else {
      // Carry forward any values this row has that a prior row for the same cap code was missing.
      prev.model ??= vehicle.model;
      prev.derivative ??= vehicle.derivative;
      prev.fuelType ??= vehicle.fuelType;
      prev.listPriceNet ??= vehicle.listPriceNet;
    }
  }

  if (rows.length === 0) warnings.push(`No recognisable rows in ${filename}`);
  return { rows, vehicles: Array.from(vehicleMap.values()), warnings, diagnostics };
}
