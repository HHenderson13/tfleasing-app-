import { db } from "@/db";
import {
  forecastDealbookLines,
  forecastDealbookUploads,
  forecastActuals,
  forecastInputs,
  forecastConfig,
  forecastVehicles,
  forecastVehicleBonuses,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import type { SheetKey } from "@/app/forecast/line-definitions";
import { parseVehicle, type ParsedVehicle } from "@/lib/forecast-classify";

// Re-export client-safe pieces so existing server callers see the same
// surface. Anything that touches the DB lives below; anything pure lives
// in src/app/forecast/{sources,rollup}.ts so client components can import
// it without dragging in `db`.
export { DEALBOOK_SOURCES, DEALBOOK_SOURCE_LABELS, type DealbookSource } from "@/app/forecast/sources";
export { rollupDealbookLines, type DealbookRollup } from "@/app/forecast/rollup";

// ── Dealbook CSV parsing ──────────────────────────────────────────────────
// The dealbook export comes out as CSV with quoted fields and a header
// row. The column layout is fixed for now (matches Dealbook_Extract_*.csv)
// — if it changes we'll add a column-mapping admin tab.

interface ParsedDealbookRow {
  branch: string | null;
  vehicleType: string | null;
  salesType: string | null;
  salesSubType: string | null;
  customerName: string | null;
  model: string | null;
  orderDate: string | null;
  regDate: string | null;
  delivDate: string | null;
  invoiceDate: string | null;
  delivStatus: string | null;
  vin: string | null;
  regNo: string | null;
  customerExternalId: string | null;
  financeCo: string | null;
  chassisProfit: number;
  addBonus: number;
  metalSubsidy: number;
  reconCost: number;
  oallowDiscount: number;
  accessoryProfit: number;
  warrantyCost: number;
  totalVehicleProfit: number;
  financeIncome: number;
  financeMb: number;
  tyreInsIncome: number;
  financeSubsidy: number;
  cpiIncome: number;
  smartRepair: number;
  gapRtiIncome: number;
  paintProtection: number;
  warranty: number;
  totalFiIncome: number;
  totalGrossProfit: number;
}

export interface ParsedDealbook {
  rows: ParsedDealbookRow[];
  warnings: string[];
}

// Minimal CSV reader — handles quoted fields with embedded commas and
// escaped quotes ("") inside quoted strings. The dealbook export uses CRLF
// line endings, so we normalise before splitting.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') { inQuotes = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  // DD/MM/YYYY → YYYY-MM-DD
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // ISO already
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return t;
  return null;
}

function parseNumber(s: string | undefined): number {
  if (!s) return 0;
  const t = s.trim().replace(/,/g, "");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function parseDealbookCsv(text: string): ParsedDealbook {
  const warnings: string[] = [];
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], warnings: ["File is empty"] };

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const indexOf = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  // Build a name → index map for the columns we care about. Missing
  // columns are tolerated (value treated as null/0) but a warning is
  // surfaced so the admin knows their CSV export shape drifted.
  const want = {
    branch: indexOf("Branch"),
    newUsed: indexOf("New/Used"),
    customer: indexOf("Customer"),
    model: indexOf("Model"),
    orderDate: indexOf("Order Date"),
    se: indexOf("SE"),
    delivDate: indexOf("Deliv Date"),
    delivStatus: indexOf("Deliv Status"),
    actChassisProfit: indexOf("ACT Chassis Profit"),
    actAddBonus: indexOf("ACT Add. Bonus"),
    actMetalSubsidy: indexOf("ACT Metal Subsidy"),
    actReconCost: indexOf("ACT Recon/Other Costs"),
    actOallowDiscount: indexOf("ACT Oallow /Discount"),
    actAccessoryProfit: indexOf("ACT Accessory Profit"),
    actWarrantyCost: indexOf("ACT Warranty Cost"),
    actTotalVehicleProfit: indexOf("ACT Total Vehicle Profit"),
    actFinanceIncome: indexOf("ACT Finance Income"),
    actFinanceMb: indexOf("ACT Finance MB"),
    actTyreInsIncome: indexOf("ACT Tyre Ins. Income"),
    actFinanceSubsidy: indexOf("ACT Finance Subsidy"),
    actCpiIncome: indexOf("ACT CPI Income"),
    actSmartRepair: indexOf("ACT Smart Repair"),
    actGapRtiIncome: indexOf("ACT GAP/RTI Income"),
    actPaintProtection: indexOf("ACT Paint Protection"),
    actWarranty: indexOf("ACT Warranty"),
    actTotalFiIncome: indexOf("ACT Total F & I Income"),
    actTotalGrossProfit: indexOf("ACT Total Gross Profit"),
    financeCo: indexOf("Finance Co"),
    customerId: indexOf("Customer Id"),
    registeredDate: indexOf("Registered Date"),
    invoiceDate: indexOf("Invoice Date"),
    salesType: indexOf("Sales Type"),
    salesSubType: indexOf("Sales Sub-Type"),
    vehicleType: indexOf("Vehicle Type"),
    vin: indexOf("VIN"),
    regNo: indexOf("Reg No"),
  };
  for (const [name, idx] of Object.entries(want)) {
    if (idx === -1) warnings.push(`Column "${name}" not found in CSV header`);
  }

  const rows: ParsedDealbookRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (k: keyof typeof want): string | null => {
      const idx = want[k];
      if (idx < 0 || idx >= cells.length) return null;
      const v = cells[idx]?.trim();
      return v ? v : null;
    };
    const num = (k: keyof typeof want) => parseNumber(get(k) ?? undefined);
    rows.push({
      branch: get("branch"),
      vehicleType: get("vehicleType"),
      salesType: get("salesType"),
      salesSubType: get("salesSubType"),
      customerName: get("customer"),
      model: get("model"),
      orderDate: parseDate(get("orderDate") ?? undefined),
      regDate: parseDate(get("registeredDate") ?? undefined),
      delivDate: parseDate(get("delivDate") ?? undefined),
      invoiceDate: parseDate(get("invoiceDate") ?? undefined),
      delivStatus: get("delivStatus"),
      vin: get("vin"),
      regNo: get("regNo"),
      customerExternalId: get("customerId"),
      financeCo: get("financeCo"),
      chassisProfit: num("actChassisProfit"),
      addBonus: num("actAddBonus"),
      metalSubsidy: num("actMetalSubsidy"),
      reconCost: num("actReconCost"),
      oallowDiscount: num("actOallowDiscount"),
      accessoryProfit: num("actAccessoryProfit"),
      warrantyCost: num("actWarrantyCost"),
      totalVehicleProfit: num("actTotalVehicleProfit"),
      financeIncome: num("actFinanceIncome"),
      financeMb: num("actFinanceMb"),
      tyreInsIncome: num("actTyreInsIncome"),
      financeSubsidy: num("actFinanceSubsidy"),
      cpiIncome: num("actCpiIncome"),
      smartRepair: num("actSmartRepair"),
      gapRtiIncome: num("actGapRtiIncome"),
      paintProtection: num("actPaintProtection"),
      warranty: num("actWarranty"),
      totalFiIncome: num("actTotalFiIncome"),
      totalGrossProfit: num("actTotalGrossProfit"),
    });
  }
  return { rows, warnings };
}

// Default month a dealbook line lands in is the upload's target month.
// Reg date is still captured on the row so we can later filter bonuses
// that only count for units registered in the right quarter — but the
// unit itself stays in the upload month unless the admin reassigns it
// via the per-row dropdown in the review window.
export function deriveDefaultMonth(_row: ParsedDealbookRow, uploadMonth: string): string {
  return uploadMonth;
}

// ── DB queries ────────────────────────────────────────────────────────────

export async function listForecastUploads() {
  return db
    .select()
    .from(forecastDealbookUploads)
    .orderBy(desc(forecastDealbookUploads.uploadedAt));
}

export async function listForecastLinesForMonth(monthYyyymm: string) {
  return db
    .select()
    .from(forecastDealbookLines)
    .where(eq(forecastDealbookLines.effectiveMonth, monthYyyymm));
}

export async function listForecastLinesForUpload(uploadId: string) {
  return db
    .select()
    .from(forecastDealbookLines)
    .where(eq(forecastDealbookLines.uploadId, uploadId));
}

export async function loadForecastActuals(monthYyyymm: string) {
  return db
    .select()
    .from(forecastActuals)
    .where(eq(forecastActuals.monthYyyymm, monthYyyymm));
}

export async function loadForecastInputs(monthYyyymm: string) {
  return db
    .select()
    .from(forecastInputs)
    .where(eq(forecastInputs.monthYyyymm, monthYyyymm));
}

export async function loadForecastConfig() {
  return db.select().from(forecastConfig).orderBy(forecastConfig.category, forecastConfig.sortOrder);
}

export async function loadForecastVehicles(): Promise<ParsedVehicle[]> {
  const rows = await db.select().from(forecastVehicles).orderBy(forecastVehicles.sortOrder, forecastVehicles.name);
  return rows.map((r) => parseVehicle({
    id: r.id,
    name: r.name,
    kind: r.kind,
    keywords: r.keywords,
    sortOrder: r.sortOrder,
  }));
}

export async function loadVehicleBonuses() {
  return db.select().from(forecastVehicleBonuses);
}

export async function findForecastActual(monthYyyymm: string, sheet: SheetKey, lineKey: string) {
  const rows = await db
    .select()
    .from(forecastActuals)
    .where(and(
      eq(forecastActuals.monthYyyymm, monthYyyymm),
      eq(forecastActuals.sheet, sheet),
      eq(forecastActuals.lineKey, lineKey),
    ))
    .limit(1);
  return rows[0] ?? null;
}

