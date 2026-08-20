import "server-only";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { enquiryUploads } from "@/db/schema";
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
import {
  isContactMissing,
  isSameDayReportable,
  isTransferMissing,
} from "./enquiry-reporting";

export { ALLOCATION_TARGET_MINS, CONTACT_TARGET_MINS };

// Names that must never appear in any report, anywhere.
//
// Matched case-insensitively against EVERY column of the source row, not
// just "Created By" — an enquiry these two created, own, or are named on
// in any other field is dropped at ingest so it can never surface in a
// report. Full names only: matching on "harry" alone would take out
// unrelated customers.
const EXCLUDED_NAMES = ["joseph rustigini", "harry henderson"] as const;

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const normKey = (s: unknown) => norm(s).toLowerCase();
const lettersOnly = (s: unknown) => normKey(s).replace(/[^a-z]/g, "");

/** True when this single value is one of the excluded names. */
export function isExcludedExec(name: unknown): boolean {
  const k = normKey(name);
  return EXCLUDED_NAMES.some((n) => k === n);
}

/**
 * True when an excluded name appears anywhere in the row. Substring match
 * (not equality) so " Harry Henderson" in a free-text cell, or a name
 * embedded in a longer string, is still caught.
 */
export function rowMentionsExcluded(cells: readonly unknown[]): boolean {
  for (const c of cells) {
    if (c == null) continue;
    const k = normKey(c);
    if (!k) continue;
    if (EXCLUDED_NAMES.some((n) => k.includes(n))) return true;
  }
  return false;
}

// Lost Sale Reasons (column AD) that take the enquiry out of reporting
// entirely. A lead merged into an existing customer is not a real enquiry
// — it is bookkeeping — so counting it would inflate volumes and, because
// merged records rarely carry their own contact timestamps, drag the
// response figures down for work that was never anyone's to do.
//
// Compared on letters only, so spacing, case and punctuation drift in the
// source cannot let one through.
const EXCLUDED_LOST_SALE_REASONS = ["leadmergedintoexistingcustomer"];

export function isExcludedLostSaleReason(reason: unknown): boolean {
  const k = lettersOnly(reason);
  if (!k) return false;
  return EXCLUDED_LOST_SALE_REASONS.some((r) => k === r);
}

// Enquiry types (column F) that count as an inbound enquiry to be
// allocated and worked. Lead, Phone and Email all arrive needing a
// response, so all three are measured.
//
// Everything else is excluded: "Prospect Call" and "Showroom" are
// outbound or walk-in activity, where nobody is waiting on us to call
// back, so holding them to the allocation and response targets would be
// measuring the wrong process. An unrecognised or blank type is excluded
// too — safer to leave a row out than to grade it against a target that
// may not apply.
const ALLOWED_TYPES = new Set(["lead", "phone", "email"]);

/** True unless column F is one of the enquiry types we measure. */
export function isExcludedType(type: unknown): boolean {
  return !ALLOWED_TYPES.has(lettersOnly(type));
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
  type: 5,          // F  Type
  source: 6,        // G
  contactedAt: 11,  // L  2nd Contact  → sales exec's first contact
  transferredAt: 15,// P  Date Transferred
  enquiryOwner: 16, // Q
  status: 28,       // AC
  lostSaleReason: 29, // AD
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
  /** Rows collapsed into an earlier row sharing the same natural key. */
  duplicatesCollapsed: number;
  /** Rows dropped because of their Lost Sale Reason (column AD). */
  skippedLostSaleReason: number;
  /** Rows dropped because column F was not "Lead". */
  skippedNotLead: number;
  /**
   * Natural-key ids of every row this file excluded. Ingest deletes these
   * from the store, so re-uploading a file retroactively clears rows that
   * were saved before the exclusion rule existed.
   */
  excludedIds: string[];
}

/**
 * Header cells that identify the MotorComplete enquiry export, checked
 * before anything is read positionally.
 *
 * This matters in practice: the operator's downloads folder holds a
 * dozen other MotorComplete reports saved as "export (N).xlsx", several
 * of which also use an "ag-grid" sheet but a completely different column
 * layout ("SE", "Sales Type", "Order Date", …). Without this check,
 * uploading one by mistake would read whatever happened to sit in those
 * positions and silently ingest nonsense.
 */
const REQUIRED_HEADERS: ReadonlyArray<readonly [number, string]> = [
  [COL.salesExec, "created by"],
  [COL.customer, "customer"],
  [COL.enquiryAt, "date raised"],
  [COL.type, "type"],
  [COL.transferredAt, "date transferred"],
];

export class NotAnEnquiryExportError extends Error {
  constructor(readonly found: string) {
    super(
      "That file is not the MotorComplete enquiry export — its columns are " +
      `laid out differently (found ${found}). Check you have exported the ` +
      "enquiry view rather than another report.",
    );
    this.name = "NotAnEnquiryExportError";
  }
}

function assertEnquiryExport(header: readonly unknown[]): void {
  const mismatches = REQUIRED_HEADERS.filter(
    ([idx, expected]) => normKey(header[idx]) !== expected,
  );
  if (mismatches.length === 0) return;
  const found = REQUIRED_HEADERS
    .map(([idx]) => `${String.fromCharCode(65 + idx)}=${JSON.stringify(norm(header[idx]) || null)}`)
    .join(", ");
  throw new NotAnEnquiryExportError(found);
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
  if (!ws) return { rows: [], rowsInFile: 0, skippedExcluded: 0, skippedUnparseable: 0, duplicatesCollapsed: 0, skippedLostSaleReason: 0, skippedNotLead: 0, excludedIds: [] };

  // header:1 → array-of-arrays, so columns stay positional.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
  assertEnquiryExport(Array.isArray(grid[0]) ? grid[0] : []);
  const body = grid.slice(1); // drop the header row

  const rows: ParsedEnquiry[] = [];
  const excludedIds: string[] = [];
  let skippedExcluded = 0;
  let skippedUnparseable = 0;
  let skippedLostSaleReason = 0;
  let skippedNotLead = 0;

  for (const raw of body) {
    if (!Array.isArray(raw)) { skippedUnparseable++; continue; }

    const salesExec = norm(raw[COL.salesExec]);
    const customer = norm(raw[COL.customer]);
    const enquiryAt = parseExportTimestamp(raw[COL.enquiryAt]);

    if (!salesExec && !customer && enquiryAt == null) continue; // blank filler row
    // Exclusion is checked against the whole row before the parse gate, so
    // an excluded row is never counted as "unreadable" on a technicality.
    const customerRefEarly = norm(raw[COL.customerRef]) || null;
    // Identify the row before any exclusion so ingest can delete a copy
    // stored under an earlier ruleset.
    const idIfUsable = salesExec && customer && enquiryAt != null
      ? makeEnquiryId(salesExec, customerRefEarly, customer, enquiryAt)
      : null;

    if (rowMentionsExcluded(raw)) {
      skippedExcluded++;
      if (idIfUsable) excludedIds.push(idIfUsable);
      continue;
    }
    if (isExcludedType(raw[COL.type])) {
      skippedNotLead++;
      if (idIfUsable) excludedIds.push(idIfUsable);
      continue;
    }
    if (isExcludedLostSaleReason(raw[COL.lostSaleReason])) {
      skippedLostSaleReason++;
      if (idIfUsable) excludedIds.push(idIfUsable);
      continue;
    }
    if (!salesExec || !customer || enquiryAt == null) { skippedUnparseable++; continue; }

    const transferredAt = parseExportTimestamp(raw[COL.transferredAt]);
    const contactedAt = parseExportTimestamp(raw[COL.contactedAt]);
    const customerRef = customerRefEarly;

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

  // A single export can list the same enquiry twice — MotorComplete emits
  // one row per touchpoint in some views. Collapse them here, keeping the
  // LAST occurrence to match the newest-wins merge rule. Without this the
  // ingest would try to INSERT the same primary key twice and the whole
  // upload would fail on a constraint violation.
  const byId = new Map<string, ParsedEnquiry>();
  let duplicatesCollapsed = 0;
  for (const r of rows) {
    if (byId.has(r.id)) duplicatesCollapsed++;
    byId.set(r.id, r);
  }

  return {
    rows: [...byId.values()],
    rowsInFile: body.length,
    skippedExcluded,
    skippedUnparseable,
    duplicatesCollapsed,
    skippedLostSaleReason,
    skippedNotLead,
    excludedIds,
  };
}

export interface IngestResult {
  inserted: number;
  updated: number;
  unchanged: number;
  skippedExcluded: number;
  skippedUnparseable: number;
  duplicatesCollapsed: number;
  skippedLostSaleReason: number;
  skippedNotLead: number;
  /** Previously-stored rows deleted because they are now excluded. */
  removedRetroactively: number;
  rowsInFile: number;
}

/**
 * Merge parsed rows into the store.
 *
 * Insert-or-update on the natural-key id. On conflict the *newest upload
 * wins*: the incoming row replaces what is stored, because a later export
 * reflects any correction made in MotorComplete since. Uploads are applied
 * in the order they are processed, so within a multi-file batch the last
 * file selected is the one that sticks — worth knowing if you ever pick
 * them out of date order.
 *
 * Everything derived from those timestamps is recomputed from the
 * incoming values, so an amended transfer or contact time immediately
 * re-grades the enquiry against target.
 */
export async function ingestEnquiries(
  parsed: ParseOutcome,
  meta: { filename: string; userId: string },
): Promise<IngestResult> {
  const now = new Date();
  let inserted = 0, updated = 0, unchanged = 0, removedRetroactively = 0;

  // Rows this file excludes may already be in the store from an upload
  // made before the rule existed. Delete them, so re-uploading is all it
  // takes to clear historic data that should never have been counted.
  if (parsed.excludedIds.length > 0) {
    for (let i = 0; i < parsed.excludedIds.length; i += 400) {
      const slice = parsed.excludedIds.slice(i, i + 400);
      const list = sql.join(slice.map((v) => sql`${v}`), sql`, `);
      const [before] = await db.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM enquiries WHERE id IN (${list})`,
      );
      const n = Number(before?.n ?? 0);
      if (n > 0) {
        await db.run(sql`DELETE FROM enquiries WHERE id IN (${list})`);
        removedRetroactively += n;
      }
    }
  }

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
      // Newest upload wins outright — including a value being cleared,
      // since the source system having blanked a timestamp is itself the
      // correction we want to reflect.
      const transferredAt = r.transferredAt;
      const contactedAt = r.contactedAt;

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
        // Upsert rather than a bare INSERT: the existence check above is a
        // snapshot taken before the loop, so anything that lands in the
        // table concurrently (or any key that slips through de-duplication)
        // updates instead of blowing up the whole upload.
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
          ON CONFLICT(id) DO UPDATE SET
            transferred_at = excluded.transferred_at,
            contacted_at = excluded.contacted_at,
            alloc_mins = excluded.alloc_mins,
            contact_mins = excluded.contact_mins,
            same_day_met = excluded.same_day_met,
            status = excluded.status,
            enquiry_owner = excluded.enquiry_owner
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
    rowsSkipped: parsed.skippedExcluded + parsed.skippedUnparseable +
      parsed.skippedLostSaleReason + parsed.skippedNotLead,
    uploadedAt: now,
    uploadedByUserId: meta.userId,
  });

  return {
    inserted, updated, unchanged,
    skippedExcluded: parsed.skippedExcluded,
    skippedUnparseable: parsed.skippedUnparseable,
    duplicatesCollapsed: parsed.duplicatesCollapsed,
    skippedLostSaleReason: parsed.skippedLostSaleReason,
    skippedNotLead: parsed.skippedNotLead,
    removedRetroactively,
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
  awaitingTransfer: number;
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
  const sameDayExpected = rows.filter((r) => isSameDayReportable(r));
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
    neverContacted: rows.filter((r) => isContactMissing(r)).length,
    awaitingTransfer: rows.filter((r) => isTransferMissing(r)).length,
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

/**
 * Timestamp of the freshest source upload. Reporting freshness is anchored
 * here rather than to the current page-view time, so an old dashboard does
 * not turn pending rows into failures just because another day has passed.
 */
export async function loadLatestEnquiryUploadAt(): Promise<Date | null> {
  try {
    const [row] = await db.all<{ uploaded_at: number | null }>(
      sql`SELECT MAX(uploaded_at) AS uploaded_at FROM enquiry_uploads`,
    );
    return row?.uploaded_at == null ? null : new Date(Number(row.uploaded_at) * 1000);
  } catch (e) {
    if (isMissingTable(e)) return null;
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

/**
 * Delete stored enquiries that mention an excluded name in any of the
 * text columns we persist (exec, owner, customer, dealer, source, status).
 *
 * Ingest already filters on the *full* source row, so this only matters
 * for rows written under the earlier column-B-only rule. Runs from the
 * schema-ensure pipeline, and is a no-op once clean.
 *
 * Note this can only see the columns we store — a row where an excluded
 * name appeared solely in a column the tracker doesn't keep would need a
 * re-upload to be caught. Re-uploading is safe and idempotent.
 */
export async function purgeExcludedEnquiries(): Promise<number> {
  const cols = ["sales_exec", "enquiry_owner", "customer", "dealer", "source", "status"];
  let removed = 0;
  try {
    for (const name of EXCLUDED_NAMES) {
      const pattern = `%${name}%`;
      const predicate = sql.join(
        cols.map((c) => sql`LOWER(COALESCE(${sql.raw(c)}, '')) LIKE ${pattern}`),
        sql` OR `,
      );
      const before = await db.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM enquiries WHERE ${predicate}`,
      );
      const n = Number(before[0]?.n ?? 0);
      if (n > 0) {
        await db.run(sql`DELETE FROM enquiries WHERE ${predicate}`);
        removed += n;
      }
    }
  } catch (e) {
    if (isMissingTable(e)) return 0;
    throw e;
  }
  return removed;
}
