// 10 at 10 — parsing rules for the Dealerweb order list.
//
// Pure, like ten-at-ten.ts. The order list is the "ag-grid" export Pole
// Position reads for Order Take:
//   B SE (exec) · D Customer · E Order Date · F Vehicle Details ·
//   R Finance Type ("HP 60 Nov 31234.50") · AH Total Gross (profit) ·
//   AK Delivery Date ("9 Oct 2026 Dlv" / "30 Nov 2026 Est")
// It ends in a totals block ("NEW TOTALS", "29 Units", "AVERAGE"), which
// is skipped. The delivered list has the same columns; uploading it is
// harmless, as its rows are the same orders keyed the same way.

import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { dayKey, parseExportTimestamp } from "./business-hours";
import { isEnquiryLogHeader, isExcludedExec, vehicleOf } from "./ten-at-ten";
import type { Segment } from "./ten-at-ten-report";

export type { Segment };

const COL = {
  exec: 1,          // B  SE
  customer: 3,      // D
  orderDate: 4,     // E
  vehicle: 5,       // F  Vehicle Details
  finance: 17,      // R  Finance Type
  profit: 33,       // AH Total Gross
  delivery: 36,     // AK Delivery Date
} as const;

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const letters = (s: unknown) => norm(s).toLowerCase().replace(/[^a-z]/g, "");

// ─── Vehicle and segment ───────────────────────────────────────────────────

// Dealerweb appends a stray character to some descriptions — "…5 Seat 1",
// "…5 Door n", "…5 Seat ." — which would split one vehicle into four.
export function cleanVehicle(raw: unknown): string {
  return norm(raw).replace(/(\s+[1nN.])+$/, "").trim();
}

const VAN_MODELS = new Set([
  "Transit Custom", "Transit E-Custom", "Transit Courier", "Transit E-Courier", "Transit Connect",
  "Transit City", "Transit", "E-Transit", "Ranger", "Explorer Van",
  "Tourneo Custom", "Tourneo Courier", "Tourneo Connect",
]);
const BEV_CAR_MODELS = new Set(["Capri", "Explorer", "Puma Gen-E", "Mustang Mach-E"]);

/**
 * ICE Car, BEV Car or Van. Vans are the Transit family, Ranger and the
 * Explorer Van whatever their fuel. A car is BEV when the model only comes
 * electric or the description says so (kWh, Electric); everything else —
 * Puma mild hybrid, Kuga PHEV, Focus — is ICE.
 */
export function segmentOf(model: string, text: string): Segment {
  if (VAN_MODELS.has(model)) return "Van";
  const t = text.toLowerCase();
  if (model === "Not specified" && /\b(van|pick ?up|transit|ranger)\b/.test(t)) return "Van";
  if (BEV_CAR_MODELS.has(model) || /\d\s*kwh\b|\belectric\b|\bbev\b/.test(t)) return "BEV Car";
  return "ICE Car";
}

// ─── Finance (column R) ────────────────────────────────────────────────────
//
// "HP 60 Nov 31234.50", "Contract Hire 48 ALD 29274.16", "Cash", or just an
// amount. Funder codes are Dealerweb's three-letter abbreviations.

const FUNDERS: Record<string, string> = { ald: "ALD", lex: "Lex", nov: "Novuna", arv: "Arval", for: "Ford Credit" };

export interface Finance { product: string; termMonths: number | null; funder: string }

export function parseFinance(raw: unknown): Finance {
  const s = norm(raw);
  const none: Finance = { product: "Not stated", termMonths: null, funder: "Not stated" };
  if (!s || /^-?[\d.,]+$/.test(s)) return none;
  if (/^non\s*opp/i.test(s)) return { product: "Non-opportunity", termMonths: null, funder: "Not stated" };
  const m = s.match(/^([A-Za-z][A-Za-z ]*?)\s*(?:(\d{1,2})\s+([A-Za-z]+))?(?:\s+-?[\d.,]+)?$/);
  if (!m) return none;
  const productRaw = m[1].trim().toLowerCase();
  const product = productRaw === "hp" ? "HP" : productRaw === "cash" ? "Cash"
    : productRaw === "contract hire" ? "Contract Hire" : m[1].trim();
  const termMonths = m[2] ? Number(m[2]) : null;
  const code = (m[3] ?? "").toLowerCase();
  const funder = code ? FUNDERS[code] ?? m[3] : product === "Cash" ? "Cash" : "Not stated";
  return { product, termMonths: termMonths && termMonths >= 6 ? termMonths : null, funder };
}

export function deliveryOf(raw: unknown): "Delivered" | "Awaiting delivery" | "Not stated" {
  const s = norm(raw).toLowerCase();
  if (/\bdlv\b/.test(s)) return "Delivered";
  if (/\best\b/.test(s)) return "Awaiting delivery";
  return "Not stated";
}

function money(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// ─── Identity ──────────────────────────────────────────────────────────────
//
// Order date + customer + vehicle, plus which occurrence it is within the
// file: one customer ordering three identical vans on the same day is three
// orders (DEA Gate Automation, 9 Oct 2026), and they must stay three — and
// line up with the same three when the next export is uploaded. The exec is
// left out of the key, as for enquiries, so a reassigned order overwrites.
//
// Line-by-line merging can't see an order that disappears from a later
// export (a cancellation): its stored line stays until the data is cleared.

export function makeOrderKey(orderAt: number, customer: string, vehicle: string, occurrence: number): string {
  return createHash("sha1")
    .update(`${orderAt}|${norm(customer).toLowerCase()}|${cleanVehicle(vehicle).toLowerCase()}|${occurrence}`)
    .digest("hex")
    .slice(0, 20);
}

// ─── Parse ─────────────────────────────────────────────────────────────────

export interface TenAtTenOrder {
  id: string;
  orderedAt: number;
  orderDay: string;
  exec: string;
  customer: string;
  vehicleRaw: string;
  model: string;
  derivative: string | null;
  derivativeKey: string | null;
  segment: Segment;
  product: string;
  termMonths: number | null;
  funder: string;
  delivery: string;
  profit: number | null;
}

export interface OrderParse {
  rows: TenAtTenOrder[];
  rowsInFile: number;
  skippedExcluded: number;
  skippedUnreadable: number;
  excludedIds: string[];
}

const REQUIRED_HEADERS: [number, string][] = [
  [COL.exec, "se"],
  [COL.customer, "customer"],
  [COL.orderDate, "orderdate"],
  [COL.vehicle, "vehicledetails"],
  [COL.profit, "totalgross"],
];

export class NotAnOrderListError extends Error {
  constructor(found: string) {
    super(`That isn't the Dealerweb order list — its columns are laid out differently (found ${found}).`);
    this.name = "NotAnOrderListError";
  }
}

export function isOrderListHeader(header: readonly unknown[]): boolean {
  return REQUIRED_HEADERS.every(([i, want]) => letters(header[i]) === want);
}

/**
 * Which 10 at 10 report a file is, from its header row: the enquiry log
 * and the order list are both "ag-grid" exports but lay their columns out
 * differently. null for anything else.
 */
export function detectTenAtTenFile(buf: ArrayBuffer | Buffer): "enquiries" | "orders" | null {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array", sheetRows: 1 });
  const ws = wb.Sheets[wb.SheetNames.includes("ag-grid") ? "ag-grid" : wb.SheetNames[0]];
  if (!ws) return null;
  const header = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })[0] ?? [];
  if (isEnquiryLogHeader(header)) return "enquiries";
  if (isOrderListHeader(header)) return "orders";
  return null;
}

export function parseOrderWorkbook(buf: ArrayBuffer | Buffer): OrderParse {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.includes("ag-grid") ? "ag-grid" : wb.SheetNames[0]];
  const out: OrderParse = { rows: [], rowsInFile: 0, skippedExcluded: 0, skippedUnreadable: 0, excludedIds: [] };
  if (!ws) return out;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
  const header = Array.isArray(grid[0]) ? grid[0] : [];
  if (!isOrderListHeader(header)) {
    const found = REQUIRED_HEADERS.map(([i]) => `${i > 25 ? "A" + String.fromCharCode(65 + i - 26) : String.fromCharCode(65 + i)}=${JSON.stringify(norm(header[i]) || null)}`).join(", ");
    throw new NotAnOrderListError(found);
  }

  const seen = new Map<string, number>();
  for (const raw of grid.slice(1)) {
    if (!Array.isArray(raw)) continue;
    const exec = norm(raw[COL.exec]);
    // The totals block puts numbers in B ("29", "0") and labels in F.
    if (!exec || /^[\d.,\s-]+$/.test(exec)) continue;
    out.rowsInFile++;
    const customer = norm(raw[COL.customer]);
    const orderedAt = parseExportTimestamp(raw[COL.orderDate]);
    const vehicleRaw = cleanVehicle(raw[COL.vehicle]);
    if (!customer || orderedAt == null) { out.skippedUnreadable++; continue; }

    const base = `${orderedAt}|${customer.toLowerCase()}|${vehicleRaw.toLowerCase()}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const id = makeOrderKey(orderedAt, customer, vehicleRaw, occurrence);

    if (isExcludedExec(exec)) { out.skippedExcluded++; out.excludedIds.push(id); continue; }

    const { model, derivative, derivativeKey } = vehicleOf(vehicleRaw);
    const finance = parseFinance(raw[COL.finance]);
    out.rows.push({
      id,
      orderedAt,
      orderDay: dayKey(orderedAt),
      exec,
      customer,
      vehicleRaw,
      model,
      derivative,
      derivativeKey,
      segment: segmentOf(model, vehicleRaw),
      product: finance.product,
      termMonths: finance.termMonths,
      funder: finance.funder,
      delivery: deliveryOf(raw[COL.delivery]),
      profit: money(raw[COL.profit]),
    });
  }
  return out;
}
