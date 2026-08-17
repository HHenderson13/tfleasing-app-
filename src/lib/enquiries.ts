import "server-only";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { enquiries, enquiryUploads } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  ALLOCATION_TARGET_MINS,
  CONTACT_TARGET_MINS,
  businessMinutesBetween,
  dayKey,
  isSameDayContactExpected,
  parseExportTimestamp,
  wasContactedSameDay,
} from "./business-hours";

export { ALLOCATION_TARGET_MINS, CONTACT_TARGET_MINS };

// Names that must never appear in any report. Matched case-insensitively
// against column B ("Created By") only — per explicit direction, rows
// these two merely *own* (column Q) still count under whoever created
// them. Stored normalised so "harry henderson" / "Harry  Henderson" both
// match.
const EXCLUDED_EXECS = new Set(["joseph rustigini", "harry henderson"]);

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const normKey = (s: unknown) => norm(s).toLowerCase();

export function isExcludedExec(name: unknown): boolean {
  return EXCLUDED_EXECS.has(normKey(name));
}

// Zero-based column indices, fixed by the MotorComplete export layout.
// Addressed positionally (not by header text) because that is how the
// mapping was specified and the headers are not guaranteed stable.
const COL = {
  dealer: 0,        // A
  salesExec: 1,     // B  Created By
  customer: 2,      // C
  customerRef: 3,   // D  Customer Id
  enquiryAt: 4,     // E  Date Raised
  source: 6,        // G
  contactedAt: 11,  // L  2nd Contact  → sales exec's first contact
  transferredAt: 15,// P  Date Transferred
  enquiryOwner: 16, // Q
  status: 28,       // AC
} as const;

export interface ParsedEnquiry {
  id: string;
  dealer: string | null;
  salesExec: string;
  customer: string;
  customerRef: string | null;
  enquiryAt: number;
  contactedAt: number | null;
  transferredAt: number | null;
  enquiryOwner: string | null;
  source: string | null;
  status: string | null;
  allocMins: number | null;
  contactMins: number | null;
  sameDayExpected: boolean;
  sameDayMet: boolean;
  enquiryDay: string;
}

/**
 * Stable identity for an enquiry, so re-uploading an overlapping export
 * merges rather than duplicating. Built from the fields that cannot
 * change for a given enquiry: who took it, which customer, and when it
 * was raised. Customer Id is preferred when present (it is the system's
 * own key); the trimmed name is the fallback for rows without one.
 */
export function makeEnquiryId(
  salesExec: string, customerRef: string | null, customer: string, enquiryAt: number,
): string {
  const who = customerRef ? `ref:${customerRef}` : `name:${normKey(customer)}`;
  return createHash("sha1")
    .update(`${normKey(salesExec)}|${who}|${enquiryAt}`)
    .digest("hex")
    .slice(0, 20);
}

export interface ParseOutcome {
  rows: ParsedEnquiry[];
  rowsInFile: number;
  skippedExcluded: number;
  skippedUnparseable: number;
}

/**
 * Read a MotorComplete export into computed enquiry rows.
 *
 * Rows are dropped when the sales exec is on the exclusion list, or when
 * the mandatory fields (exec, customer, enquiry timestamp) can't be read
 * — a malformed row is skipped and counted rather than failing the whole
 * upload, so one bad cell can't block a day's data.
 */
export function parseEnquiryWorkbook(buf: ArrayBuffer | Buffer): ParseOutcome {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.includes("ag-grid") ? "ag-grid" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], rowsInFile: 0, skippedExcluded: 0, skippedUnparseable: 0 };

  // header:1 → array-of-arrays, so columns stay positional.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
  const body = grid.slice(1); // drop the header row

  const rows: ParsedEnquiry[] = [];
  let skippedExcluded = 0;
  let skippedUnparseable = 0;

  for (const raw of body) {
    if (!Array.isArray(raw)) { skippedUnparseable++; continue; }

    const salesExec = norm(raw[COL.salesExec]);
    const customer = norm(raw[COL.customer]);
    const enquiryAt = parseExportTimestamp(raw[COL.enquiryAt]);

    if (!salesExec && !customer && enquiryAt == null) continue; // blank filler row
    if (!salesExec || !customer || enquiryAt == null) { skippedUnparseable++; continue; }
    if (isExcludedExec(salesExec)) { skippedExcluded++; continue; }

    const transferredAt = parseExportTimestamp(raw[COL.transferredAt]);
    const contactedAt = parseExportTimestamp(raw[COL.contactedAt]);
    const customerRef = norm(raw[COL.customerRef]) || null;

    // Allocation: enquiry raised → transferred to an exec (sales support).
    const allocMins = transferredAt != null
      ? businessMinutesBetween(enquiryAt, transferredAt)
      : null;

    // Contact: transferred → exec's first contact. Measured from the
    // transfer, so an exec is never charged for time before the enquiry
    // reached them. Rows contacted before transfer (data oddity) floor
    // at 0 via businessMinutesBetween's end<=start guard.
    const contactMins = transferredAt != null && contactedAt != null
      ? businessMinutesBetween(transferredAt, contactedAt)
      : null;

    const sameDayExpected = isSameDayContactExpected(enquiryAt);
    const sameDayMet = sameDayExpected && wasContactedSameDay(enquiryAt, contactedAt);

    rows.push({
      id: makeEnquiryId(salesExec, customerRef, customer, enquiryAt),
      dealer: norm(raw[COL.dealer]) || null,
      salesExec,
      customer,
      customerRef,
      enquiryAt,
      contactedAt,
      transferredAt,
      enquiryOwner: norm(raw[COL.enquiryOwner]) || null,
      source: norm(raw[COL.source]) || null,
      status: norm(raw[COL.status]) || null,
      allocMins,
      contactMins,
      sameDayExpected,
      sameDayMet,
      enquiryDay: dayKey(enquiryAt),
    });
  }

  return { rows, rowsInFile: body.length, skippedExcluded, skippedUnparseable };
}

export interface IngestResult {
  inserted: number;
  updated: number;
  unchanged: number;
  skippedExcluded: number;
  skippedUnparseable: number;
  rowsInFile: number;
}

/**
 * Merge parsed rows into the store.
 *
 * Insert-or-update on the natural-key id. On conflict the *earliest*
 * known transfer and contact timestamps win: an enquiry's first contact
 * is by definition the earliest one seen, and a later export that
 * re-reports the same enquiry with a subsequent touchpoint in column L
 * must not overwrite the genuine first contact. Everything derived from
 * those timestamps is recomputed from the merged values.
 */
export async function ingestEnquiries(
  parsed: ParseOutcome,
  meta: { filename: string; userId: string },
): Promise<IngestResult> {
  const now = new Date();
  let inserted = 0, updated = 0, unchanged = 0;

  if (parsed.rows.length > 0) {
    const ids = parsed.rows.map((r) => r.id);
    // Pull existing rows in batches so a large export doesn't build one
    // enormous IN clause.
    const existing = new Map<string, { transferredAt: number | null; contactedAt: number | null }>();
    for (let i = 0; i < ids.length; i += 400) {
      const slice = ids.slice(i, i + 400);
      const found = await db.all<{ id: string; transferred_at: number | null; contacted_at: number | null }>(
        sql`SELECT id, transferred_at, contacted_at FROM enquiries WHERE id IN (${sql.join(slice.map((v) => sql`${v}`), sql`, `)})`,
      );
      for (const f of found) {
        existing.set(f.id, { transferredAt: f.transferred_at, contactedAt: f.contacted_at });
      }
    }

    for (const r of parsed.rows) {
      const prev = existing.get(r.id);

      // Earliest-wins merge for the two timestamps that drive every metric.
      const minOf = (a: number | null, b: number | null) =>
        a == null ? b : b == null ? a : Math.min(a, b);
      const transferredAt = prev ? minOf(prev.transferredAt, r.transferredAt) : r.transferredAt;
      const contactedAt = prev ? minOf(prev.contactedAt, r.contactedAt) : r.contactedAt;

      const allocMins = transferredAt != null
        ? businessMinutesBetween(r.enquiryAt, transferredAt) : null;
      const contactMins = transferredAt != null && contactedAt != null
        ? businessMinutesBetween(transferredAt, contactedAt) : null;
      const sameDayMet = r.sameDayExpected && wasContactedSameDay(r.enquiryAt, contactedAt);

      if (prev) {
        const changed = prev.transferredAt !== transferredAt || prev.contactedAt !== contactedAt;
        if (!changed) { unchanged++; continue; }
        await db.run(sql`
          UPDATE enquiries SET
            transferred_at = ${transferredAt},
            contacted_at = ${contactedAt},
            alloc_mins = ${allocMins},
            contact_mins = ${contactMins},
            same_day_met = ${sameDayMet ? 1 : 0},
            status = ${r.status},
            enquiry_owner = ${r.enquiryOwner}
          WHERE id = ${r.id}
        `);
        updated++;
      } else {
        await db.run(sql`
          INSERT INTO enquiries (
            id, dealer, sales_exec, customer, customer_ref, enquiry_at,
            contacted_at, transferred_at, enquiry_owner, source, status,
            alloc_mins, contact_mins, same_day_expected, same_day_met,
            enquiry_day, uploaded_at, uploaded_by_user_id
          ) VALUES (
            ${r.id}, ${r.dealer}, ${r.salesExec}, ${r.customer}, ${r.customerRef}, ${r.enquiryAt},
            ${contactedAt}, ${transferredAt}, ${r.enquiryOwner}, ${r.source}, ${r.status},
            ${allocMins}, ${contactMins}, ${r.sameDayExpected ? 1 : 0}, ${sameDayMet ? 1 : 0},
            ${r.enquiryDay}, ${Math.floor(now.getTime() / 1000)}, ${meta.userId}
          )
        `);
        inserted++;
      }
    }
  }

  await db.insert(enquiryUploads).values({
    id: createHash("sha1").update(`${meta.filename}|${now.toISOString()}`).digest("hex").slice(0, 16),
    filename: meta.filename,
    rowsInFile: parsed.rowsInFile,
    rowsInserted: inserted,
    rowsUpdated: updated,
    rowsSkipped: parsed.skippedExcluded + parsed.skippedUnparseable,
    uploadedAt: now,
    uploadedByUserId: meta.userId,
  });

  return {
    inserted, updated, unchanged,
    skippedExcluded: parsed.skippedExcluded,
    skippedUnparseable: parsed.skippedUnparseable,
    rowsInFile: parsed.rowsInFile,
  };
}

// ─── Reporting ─────────────────────────────────────────────────────────

export interface EnquiryRow {
  id: string;
  salesExec: string;
  customer: string;
  enquiryAt: number;
  transferredAt: number | null;
  contactedAt: number | null;
  allocMins: number | null;
  contactMins: number | null;
  sameDayExpected: boolean;
  sameDayMet: boolean;
  enquiryDay: string;
  source: string | null;
  status: string | null;
}

export interface DateRange { from?: string; to?: string }

function rangeClause(range: DateRange) {
  const parts = [sql`1=1`];
  if (range.from) parts.push(sql`enquiry_day >= ${range.from}`);
  if (range.to) parts.push(sql`enquiry_day <= ${range.to}`);
  return sql.join(parts, sql` AND `);
}

/**
 * True when the failure is "the table isn't there yet" rather than a real
 * error. The tables are created by the ensure-schema pipeline on the first
 * authenticated request; a page rendering in the window before that (or on
 * a code path that skipped the pipeline) should show its empty state, not
 * a 500.
 */
function isMissingTable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /no such table/i.test(msg);
}

/** Every stored enquiry in range, newest first. Drives all drill-downs. */
export async function loadEnquiries(range: DateRange = {}, exec?: string): Promise<EnquiryRow[]> {
  const where = exec
    ? sql`${rangeClause(range)} AND sales_exec = ${exec}`
    : rangeClause(range);
  let rows: Record<string, unknown>[];
  try {
    rows = await db.all<Record<string, unknown>>(sql`
      SELECT id, sales_exec, customer, enquiry_at, transferred_at, contacted_at,
             alloc_mins, contact_mins, same_day_expected, same_day_met,
             enquiry_day, source, status
      FROM enquiries WHERE ${where}
      ORDER BY enquiry_at DESC
    `);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
  return rows.map((r) => ({
    id: String(r.id),
    salesExec: String(r.sales_exec),
    customer: String(r.customer),
    enquiryAt: Number(r.enquiry_at),
    transferredAt: r.transferred_at == null ? null : Number(r.transferred_at),
    contactedAt: r.contacted_at == null ? null : Number(r.contacted_at),
    allocMins: r.alloc_mins == null ? null : Number(r.alloc_mins),
    contactMins: r.contact_mins == null ? null : Number(r.contact_mins),
    sameDayExpected: Number(r.same_day_expected) === 1,
    sameDayMet: Number(r.same_day_met) === 1,
    enquiryDay: String(r.enquiry_day),
    source: r.source == null ? null : String(r.source),
    status: r.status == null ? null : String(r.status),
  }));
}

export interface Summary {
  total: number;
  // Allocation (sales support): enquiry → transfer, target 5 business mins
  allocMeasured: number;
  allocHit: number;
  allocMissed: number;
  allocAvg: number | null;
  allocMedian: number | null;
  // Contact (sales exec): transfer → first contact, target 15 business mins
  contactMeasured: number;
  contactHit: number;
  contactMissed: number;
  contactAvg: number | null;
  contactMedian: number | null;
  neverContacted: number;
  // Same-day rule
  sameDayExpected: number;
  sameDayMet: number;
  sameDayMissed: number;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Roll a set of rows into the headline numbers. Pure — no DB access. */
export function summarise(rows: EnquiryRow[]): Summary {
  const alloc = rows.map((r) => r.allocMins).filter((n): n is number => n != null);
  const contact = rows.map((r) => r.contactMins).filter((n): n is number => n != null);
  const sameDayExpected = rows.filter((r) => r.sameDayExpected);
  return {
    total: rows.length,
    allocMeasured: alloc.length,
    allocHit: alloc.filter((n) => n <= ALLOCATION_TARGET_MINS).length,
    allocMissed: alloc.filter((n) => n > ALLOCATION_TARGET_MINS).length,
    allocAvg: alloc.length ? Math.round(alloc.reduce((a, b) => a + b, 0) / alloc.length) : null,
    allocMedian: median(alloc),
    contactMeasured: contact.length,
    contactHit: contact.filter((n) => n <= CONTACT_TARGET_MINS).length,
    contactMissed: contact.filter((n) => n > CONTACT_TARGET_MINS).length,
    contactAvg: contact.length ? Math.round(contact.reduce((a, b) => a + b, 0) / contact.length) : null,
    contactMedian: median(contact),
    neverContacted: rows.filter((r) => r.contactedAt == null).length,
    sameDayExpected: sameDayExpected.length,
    sameDayMet: sameDayExpected.filter((r) => r.sameDayMet).length,
    sameDayMissed: sameDayExpected.filter((r) => !r.sameDayMet).length,
  };
}

export interface ExecSummary extends Summary { salesExec: string }

/** Per-exec breakdown, worst allocation hit-rate first. */
export function summariseByExec(rows: EnquiryRow[]): ExecSummary[] {
  const byExec = new Map<string, EnquiryRow[]>();
  for (const r of rows) {
    const list = byExec.get(r.salesExec) ?? [];
    list.push(r);
    byExec.set(r.salesExec, list);
  }
  return [...byExec.entries()]
    .map(([salesExec, rs]) => ({ salesExec, ...summarise(rs) }))
    .sort((a, b) => b.total - a.total || a.salesExec.localeCompare(b.salesExec));
}

export interface DaySummary extends Summary { day: string }

/** Per-day breakdown, newest first — the daily same-day-contact log. */
export function summariseByDay(rows: EnquiryRow[]): DaySummary[] {
  const byDay = new Map<string, EnquiryRow[]>();
  for (const r of rows) {
    const list = byDay.get(r.enquiryDay) ?? [];
    list.push(r);
    byDay.set(r.enquiryDay, list);
  }
  return [...byDay.entries()]
    .map(([day, rs]) => ({ day, ...summarise(rs) }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Distinct sales execs present in the store, alphabetical. */
export async function listExecs(): Promise<string[]> {
  try {
    const rows = await db.all<{ sales_exec: string }>(
      sql`SELECT DISTINCT sales_exec FROM enquiries ORDER BY sales_exec`,
    );
    return rows.map((r) => r.sales_exec);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

/** Earliest and latest enquiry day stored, for the date-range defaults. */
export async function loadDataBounds(): Promise<{ min: string | null; max: string | null }> {
  try {
    const [row] = await db.all<{ min_day: string | null; max_day: string | null }>(
      sql`SELECT MIN(enquiry_day) AS min_day, MAX(enquiry_day) AS max_day FROM enquiries`,
    );
    return { min: row?.min_day ?? null, max: row?.max_day ?? null };
  } catch (e) {
    if (isMissingTable(e)) return { min: null, max: null };
    throw e;
  }
}

export interface UploadRecord {
  id: string; filename: string; rowsInFile: number;
  rowsInserted: number; rowsUpdated: number; rowsSkipped: number;
  uploadedAt: Date; uploadedByUserId: string;
}

export async function listUploads(limit = 20): Promise<UploadRecord[]> {
  let rows: Record<string, unknown>[];
  try {
    rows = await db.all<Record<string, unknown>>(sql`
      SELECT id, filename, rows_in_file, rows_inserted, rows_updated,
             rows_skipped, uploaded_at, uploaded_by_user_id
      FROM enquiry_uploads ORDER BY uploaded_at DESC LIMIT ${limit}
    `);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
  return rows.map((r) => ({
    id: String(r.id),
    filename: String(r.filename),
    rowsInFile: Number(r.rows_in_file),
    rowsInserted: Number(r.rows_inserted),
    rowsUpdated: Number(r.rows_updated),
    rowsSkipped: Number(r.rows_skipped),
    uploadedAt: new Date(Number(r.uploaded_at) * 1000),
    uploadedByUserId: String(r.uploaded_by_user_id),
  }));
}
