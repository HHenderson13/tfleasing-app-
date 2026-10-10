// 10 at 10 — parsing rules for the Dealerweb enquiry log.
//
// Pure: no DB, no "server-only", so vitest imports it directly. The store
// (ingest + load) lives in ten-at-ten-store.ts; the client-side slicing and
// grouping lives in ten-at-ten-report.ts.
//
// The enquiry log is the same "ag-grid" export Pole Position reads:
//   A Date Time · B SE (exec code) · D Customer · E Source · G Model ·
//   I First Contact Details (finance type, term, mileage…) · Q Status

import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { dayKey, parseExportTimestamp } from "./business-hours";
import type { Outcome, SourceName } from "./ten-at-ten-report";

export type { Outcome, SourceName };

const COL = {
  enquiredAt: 0,   // A  Date Time
  exec: 1,         // B  SE
  customer: 3,     // D
  source: 4,       // E
  vehicle: 6,      // G  Model — anything from "Ford" to a full derivative
  firstContact: 8, // I  First Contact Details
  status: 16,      // Q
} as const;

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const letters = (s: unknown) => norm(s).toLowerCase().replace(/[^a-z]/g, "");

// ─── Sources ───────────────────────────────────────────────────────────────
//
// The four MotorComplete feeds are real inbound enquiries and get their own
// names. Everything else in column E — Customer, Broker Introduction, FR
// website, TF.co.uk — is grouped as Broker / Prospect (user's rule,
// 2026-10-10). Matched on letters only so spacing and case drift can't
// split a source in two.

const SOURCE_BY_LETTERS: Record<string, SourceName> = {
  motorcompletelead: "TF Lead",
  motorcompleteleasingcom: "Leasing.com",
  motorcompleteleaseloco: "LeaseLoco",
  motorcompletecarwow: "CarWow",
};

export function sourceName(raw: unknown): SourceName {
  return SOURCE_BY_LETTERS[letters(raw)] ?? "Broker / Prospect";
}

// ─── Status ────────────────────────────────────────────────────────────────
//
// Ordered, Delivered and Handover Arranged are all orders: Dealerweb walks
// a converted enquiry through them in turn. Live is still being worked;
// Lost Sale is no longer an opportunity. Conversion is always orders ÷
// enquiries.

export function outcomeOf(status: unknown): Outcome {
  const s = norm(status).toLowerCase();
  if (s === "ordered" || s === "delivered" || s === "handover arranged") return "order";
  if (s === "live") return "live";
  if (s === "lost sale") return "lost";
  return "other";
}

// When one export lists the same enquiry twice, keep the row furthest
// along: an Ordered copy must not be overwritten by a Lost Sale duplicate.
const OUTCOME_RANK: Record<Outcome, number> = { order: 3, live: 2, lost: 1, other: 0 };

// ─── Excluded execs ────────────────────────────────────────────────────────
//
// Enquiries identified as duplicates are moved onto HaHe and JoRu in
// Dealerweb. Anything under those codes is stripped from every figure.

const EXCLUDED_EXECS = new Set(["hahe", "joru"]);

export function isExcludedExec(code: unknown): boolean {
  return EXCLUDED_EXECS.has(letters(code));
}

// ─── Vehicle ───────────────────────────────────────────────────────────────
//
// Column G is free text. It can be just "Ford", a range ("Ford Ranger",
// "Ford Explorer EV") or a full derivative ("Ford Ranger Pick Up Double
// Cab XLT 3.0 EcoBlue V6 240 Auto"). The model is recognised from it; the
// derivative is the full text, kept only when it says more than the model.

// First match wins, so the specific names sit above the general ones.
const MODEL_RULES: [RegExp, string][] = [
  [/tourneo\s*custom/, "Tourneo Custom"],
  [/tourneo\s*courier/, "Tourneo Courier"],
  [/tourneo\s*connect/, "Tourneo Connect"],
  [/e-?\s*transit\s*custom|transit\s*custom\s*e-|transit\s*custom.*electric/, "Transit E-Custom"],
  [/transit\s*custom/, "Transit Custom"],
  [/e-?\s*transit\s*courier|transit\s*courier\s*e-|transit\s*courier.*electric/, "Transit E-Courier"],
  [/transit\s*courier/, "Transit Courier"],
  [/transit\s*connect/, "Transit Connect"],
  [/transit\s*city/, "Transit City"],
  [/e-\s*transit|e-transit/, "E-Transit"],
  [/transit/, "Transit"],
  [/ranger/, "Ranger"],
  [/capri/, "Capri"],
  [/explorer.*\bvan\b/, "Explorer Van"],
  [/explorer/, "Explorer"],
  [/mach-?\s*e|mustang/, "Mustang Mach-E"],
  [/puma\s*gen-?\s*e|puma.*\d+\s*kw/, "Puma Gen-E"],
  [/puma/, "Puma"],
  [/kuga/, "Kuga"],
  [/focus/, "Focus"],
  [/fiesta/, "Fiesta"],
];

export const UNKNOWN_MODEL = "Not specified";

// Words that only restate the model ("Ford Explorer EV", "Ford E-Transit
// Custom") leave nothing behind, so those count as model-only rather than
// as a derivative.
// The same derivative is typed several ways: "Ford Ranger Diesel Pick Up
// Double Cab XLT…" and "Ford Ranger Pick Up Double Cab XLT…", "Explorer
// Estate 140kW Style" and "Explorer 140kW Style", "Transit Custom E- 320 L1
// Electric RWD" and "E-Transit Custom 320 L1 Electric Rwd". The key drops
// case, brackets, body-style words and the fuel words the model already
// implies, so those group together. FWD is dropped as the default drive;
// RWD and AWD are kept, being genuinely different vehicles.
const KEY_NOISE = new Set(["estate", "hatchback", "diesel", "petrol", "electric", "fwd"]);

function modelWordsOf(model: string): string[] {
  return [...model.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean), "mustang", "mach", "transit"];
}

export function vehicleOf(raw: unknown): { model: string; derivative: string | null; derivativeKey: string | null } {
  const text = norm(raw);
  const lower = text.toLowerCase();
  const rule = MODEL_RULES.find(([re]) => re.test(lower));
  if (!rule) return { model: UNKNOWN_MODEL, derivative: null, derivativeKey: null };
  const model = rule[1];
  const drop = new Set([...modelWordsOf(model), "ford", "ev", "e", "gen", "new", "the"]);
  const tokens = lower.replace(/d\/cab/g, "double cab").replace(/[^a-z0-9.+ ]/g, " ").split(/\s+/).filter((t) => t && !drop.has(t));
  if (tokens.length === 0) return { model, derivative: null, derivativeKey: null };
  const keyTokens = tokens.filter((t) => !KEY_NOISE.has(t));
  return { model, derivative: text, derivativeKey: `${model}|${keyTokens.join(" ")}` };
}

// ─── First contact details (column I) ──────────────────────────────────────
//
// MotorComplete leads carry a block like:
//   Monthly rental: 255.00. / Finance type: Business Contract Hire. /
//   Initial payment: 12. / Contract length: 24. / Annual mileage: 6000.
// Other sources say "First contact" or nothing. Values are sometimes
// truncated ("Business Contrac", "Bu"), so finance type is read from its
// first letter.

function field(text: string, name: string): string | null {
  const m = text.match(new RegExp(`${name}:\\s*([^\\n]*)`, "i"));
  if (!m) return null;
  const v = m[1].trim().replace(/\.$/, "").trim();
  return v || null;
}

function whole(v: string | null, min: number, max: number): number | null {
  if (!v) return null;
  const n = Math.round(Number(v.replace(/,/g, "")));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export interface FirstContact {
  financeType: "Business" | "Personal" | null;
  termMonths: number | null;
  annualMileage: number | null;
}

export function parseFirstContact(raw: unknown): FirstContact {
  const text = String(raw ?? "");
  const ft = field(text, "Finance type")?.toLowerCase() ?? "";
  return {
    financeType: ft.startsWith("b") ? "Business" : ft.startsWith("p") ? "Personal" : null,
    termMonths: whole(field(text, "Contract length"), 6, 72),
    annualMileage: whole(field(text, "Annual mileage"), 1000, 100000),
  };
}

// ─── Identity ──────────────────────────────────────────────────────────────
//
// An enquiry is the customer, when it was raised (to the minute) and the
// source. The exec is deliberately NOT in the key: enquiries get reassigned
// (that is how duplicates reach HaHe and JoRu), and a reassigned enquiry
// must overwrite its earlier line, not appear as a second one. Nor is the
// vehicle — a corrected model is the same enquiry.

export function makeEnquiryKey(enquiredAt: number, customer: string, sourceRaw: string): string {
  return createHash("sha1")
    .update(`${enquiredAt}|${norm(customer).toLowerCase()}|${letters(sourceRaw)}`)
    .digest("hex")
    .slice(0, 20);
}

// ─── Parse ─────────────────────────────────────────────────────────────────

export interface TenAtTenEnquiry {
  id: string;
  enquiredAt: number;      // wall clock re-encoded as UTC (business-hours.ts)
  enquiryDay: string;      // YYYY-MM-DD
  exec: string;
  customer: string;
  sourceRaw: string;
  source: SourceName;
  vehicleRaw: string;
  model: string;
  derivative: string | null;
  derivativeKey: string | null;
  status: string;
  outcome: Outcome;
  financeType: string | null;
  termMonths: number | null;
  annualMileage: number | null;
}

export interface TenAtTenParse {
  rows: TenAtTenEnquiry[];
  rowsInFile: number;
  skippedExcluded: number;
  skippedUnreadable: number;
  duplicatesCollapsed: number;
  /** Keys of excluded rows, so ingest can delete a copy stored earlier. */
  excludedIds: string[];
}

const REQUIRED_HEADERS: [number, string][] = [
  [COL.enquiredAt, "datetime"],
  [COL.exec, "se"],
  [COL.customer, "customer"],
  [COL.source, "source"],
  [COL.vehicle, "model"],
  [COL.status, "status"],
];

export class NotAnEnquiryLogError extends Error {
  constructor(found: string) {
    super(`That isn't the Dealerweb enquiry log — its columns are laid out differently (found ${found}).`);
    this.name = "NotAnEnquiryLogError";
  }
}

// The downloads folder holds several "export (N).xlsx" reports on the same
// ag-grid sheet with different columns (the order list has "Order Date"
// in E). Columns are read by position, so check the header first.
function assertEnquiryLog(header: readonly unknown[]): void {
  const bad = REQUIRED_HEADERS.filter(([i, want]) => letters(header[i]) !== want);
  if (bad.length === 0) return;
  const found = bad.map(([i]) => `${String.fromCharCode(65 + i)}=${JSON.stringify(norm(header[i]) || null)}`).join(", ");
  throw new NotAnEnquiryLogError(found);
}

export function parseTenAtTenWorkbook(buf: ArrayBuffer | Buffer): TenAtTenParse {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.includes("ag-grid") ? "ag-grid" : wb.SheetNames[0]];
  const empty: TenAtTenParse = { rows: [], rowsInFile: 0, skippedExcluded: 0, skippedUnreadable: 0, duplicatesCollapsed: 0, excludedIds: [] };
  if (!ws) return empty;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
  assertEnquiryLog(Array.isArray(grid[0]) ? grid[0] : []);
  const body = grid.slice(1);

  const byId = new Map<string, TenAtTenEnquiry>();
  const excludedIds: string[] = [];
  let skippedExcluded = 0, skippedUnreadable = 0, duplicatesCollapsed = 0;

  for (const raw of body) {
    if (!Array.isArray(raw)) { skippedUnreadable++; continue; }
    const exec = norm(raw[COL.exec]);
    const customer = norm(raw[COL.customer]);
    const sourceRaw = norm(raw[COL.source]);
    const enquiredAt = parseExportTimestamp(raw[COL.enquiredAt]);
    if (!exec && !customer && enquiredAt == null) continue; // filler row
    if (!customer || enquiredAt == null) { skippedUnreadable++; continue; }

    const id = makeEnquiryKey(enquiredAt, customer, sourceRaw);
    if (isExcludedExec(exec)) {
      skippedExcluded++;
      excludedIds.push(id);
      continue;
    }
    if (!exec) { skippedUnreadable++; continue; }

    const vehicleRaw = norm(raw[COL.vehicle]);
    const { model, derivative, derivativeKey } = vehicleOf(vehicleRaw);
    const status = norm(raw[COL.status]);
    const row: TenAtTenEnquiry = {
      id,
      enquiredAt,
      enquiryDay: dayKey(enquiredAt),
      exec,
      customer,
      sourceRaw,
      source: sourceName(sourceRaw),
      vehicleRaw,
      model,
      derivative,
      derivativeKey,
      status,
      outcome: outcomeOf(status),
      ...parseFirstContact(raw[COL.firstContact]),
    };

    const prev = byId.get(id);
    if (prev) {
      duplicatesCollapsed++;
      if (OUTCOME_RANK[row.outcome] < OUTCOME_RANK[prev.outcome]) continue;
    }
    byId.set(id, row);
  }

  // An enquiry excluded on one line and kept on another (reassigned within
  // the same file) is excluded: the move to HaHe/JoRu is the decision.
  for (const id of excludedIds) byId.delete(id);

  return { rows: [...byId.values()], rowsInFile: body.length, skippedExcluded, skippedUnreadable, duplicatesCollapsed, excludedIds };
}
