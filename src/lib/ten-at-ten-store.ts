import "server-only";

import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { salesExecs, salesLeaderboardNameMap, tenAtTenBudgets, tenAtTenUploads } from "@/db/schema";
import { wallClockFromInstant } from "./business-hours";
import type { TenAtTenEnquiry, TenAtTenParse } from "./ten-at-ten";
import {
  execCodeFromName, matchCancellations, mergeDealbookLines, rewriteOrderDaysOf, staleOrderIds,
  type CancellationParse, type CancellationStatus, type DealbookLine, type TenAtTenCancellation,
} from "./ten-at-ten-cancellations";
import { plateOf, type OrderParse, type TenAtTenOrder } from "./ten-at-ten-orders";
import type { Budgets, CancellationView, OrderStoredRow, StoredRow } from "./ten-at-ten-report";

export type { Budgets };

export interface TenAtTenIngest {
  rowsInFile: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Lines under HaHe / JoRu, never stored. */
  excluded: number;
  /** Stored lines deleted because this file shows them moved to HaHe / JoRu. */
  removed: number;
  duplicatesCollapsed: number;
  unreadable: number;
  firstDay: string | null;
  lastDay: string | null;
}

// The fields a later export can change for the same enquiry. A line whose
// fields all match what is stored counts as unchanged and isn't rewritten.
type Comparable = Pick<TenAtTenEnquiry, "exec" | "sourceRaw" | "vehicleRaw" | "status" | "financeType" | "termMonths" | "annualMileage">;

function sameLine(a: Comparable, b: Comparable): boolean {
  return a.exec === b.exec && a.sourceRaw === b.sourceRaw && a.vehicleRaw === b.vehicleRaw && a.status === b.status
    && a.financeType === b.financeType && a.termMonths === b.termMonths && a.annualMileage === b.annualMileage;
}

const inList = (ids: string[]) => sql.join(ids.map((v) => sql`${v}`), sql`, `);

/**
 * Merge an enquiry log into the store, line by line. Each enquiry is
 * matched on its natural key; a new one is inserted, a known one is
 * overwritten with this file's values (newest upload wins — the status
 * moving from Live to Ordered is the point), and an identical one is left
 * alone. Nothing outside this file is touched, apart from enquiries the
 * file shows were moved to HaHe / JoRu, which are deleted.
 */
export async function ingestTenAtTen(parsed: TenAtTenParse, meta: { filename: string; userId: string }): Promise<TenAtTenIngest> {
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  let removed = 0;

  for (let i = 0; i < parsed.excludedIds.length; i += 400) {
    const slice = parsed.excludedIds.slice(i, i + 400);
    const [c] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ten_at_ten_enquiries WHERE id IN (${inList(slice)})`);
    if (Number(c?.n ?? 0) > 0) {
      await db.run(sql`DELETE FROM ten_at_ten_enquiries WHERE id IN (${inList(slice)})`);
      removed += Number(c.n);
    }
  }

  const existing = new Map<string, Comparable>();
  const ids = parsed.rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 400) {
    const found = await db.all<{
      id: string; exec: string; source_raw: string; vehicle_raw: string | null; status: string | null;
      finance_type: string | null; term_months: number | null; annual_mileage: number | null;
    }>(sql`SELECT id, exec, source_raw, vehicle_raw, status, finance_type, term_months, annual_mileage
           FROM ten_at_ten_enquiries WHERE id IN (${inList(ids.slice(i, i + 400))})`);
    for (const f of found) {
      existing.set(f.id, {
        exec: f.exec, sourceRaw: f.source_raw, vehicleRaw: f.vehicle_raw ?? "", status: f.status ?? "",
        financeType: f.finance_type, termMonths: f.term_months, annualMileage: f.annual_mileage,
      });
    }
  }

  let inserted = 0, updated = 0, unchanged = 0;
  const writes: TenAtTenEnquiry[] = [];
  for (const r of parsed.rows) {
    const prev = existing.get(r.id);
    if (!prev) { inserted++; writes.push(r); }
    else if (sameLine(prev, r)) unchanged++;
    else { updated++; writes.push(r); }
  }

  // ~18 bound values a row; 50 rows a statement stays well inside SQLite's
  // variable limit while keeping a month's log to a couple of dozen calls.
  for (let i = 0; i < writes.length; i += 50) {
    const values = writes.slice(i, i + 50).map((r) => sql`(
      ${r.id}, ${r.enquiredAt}, ${r.enquiryDay}, ${r.exec}, ${r.customer}, ${r.sourceRaw}, ${r.source},
      ${r.vehicleRaw}, ${r.model}, ${r.derivative}, ${r.derivativeKey}, ${r.status}, ${r.outcome},
      ${r.financeType}, ${r.termMonths}, ${r.annualMileage}, ${nowSec}, ${nowSec}
    )`);
    await db.run(sql`
      INSERT INTO ten_at_ten_enquiries (
        id, enquired_at, enquiry_day, exec, customer, source_raw, source,
        vehicle_raw, model, derivative, derivative_key, status, outcome,
        finance_type, term_months, annual_mileage, first_uploaded_at, updated_at
      ) VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT(id) DO UPDATE SET
        exec = excluded.exec,
        customer = excluded.customer,
        source_raw = excluded.source_raw,
        source = excluded.source,
        vehicle_raw = excluded.vehicle_raw,
        model = excluded.model,
        derivative = excluded.derivative,
        derivative_key = excluded.derivative_key,
        status = excluded.status,
        outcome = excluded.outcome,
        finance_type = excluded.finance_type,
        term_months = excluded.term_months,
        annual_mileage = excluded.annual_mileage,
        updated_at = excluded.updated_at
    `);
  }

  const days = parsed.rows.map((r) => r.enquiryDay).sort();
  const result: TenAtTenIngest = {
    rowsInFile: parsed.rowsInFile,
    inserted, updated, unchanged,
    excluded: parsed.skippedExcluded,
    removed,
    duplicatesCollapsed: parsed.duplicatesCollapsed,
    unreadable: parsed.skippedUnreadable,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
  };

  await db.insert(tenAtTenUploads).values({
    id: createHash("sha1").update(`${meta.filename}|${now.toISOString()}`).digest("hex").slice(0, 16),
    filename: meta.filename,
    rowsInFile: result.rowsInFile,
    inserted, updated, unchanged,
    excluded: result.excluded,
    removed,
    firstDay: result.firstDay,
    lastDay: result.lastDay,
    uploadedAt: now,
    uploadedByUserId: meta.userId,
    kind: "enquiries",
  });

  return result;
}

// ─── Orders ────────────────────────────────────────────────────────────────

type OrderComparable = Pick<TenAtTenOrder, "exec" | "vehicleRaw" | "product" | "termMonths" | "funder" | "delivery" | "deliveryDay" | "deliveryStatus" | "registration" | "profit"> & { insuranceCount: number | null };

function sameOrder(a: OrderComparable, b: OrderComparable): boolean {
  return a.exec === b.exec && a.vehicleRaw === b.vehicleRaw && a.product === b.product && a.termMonths === b.termMonths
    && a.funder === b.funder && a.delivery === b.delivery && a.deliveryDay === b.deliveryDay
    && a.deliveryStatus === b.deliveryStatus && a.registration === b.registration && a.profit === b.profit
    && a.insuranceCount === b.insuranceCount;
}

// The two Dealbook reports share columns and keys, so one merge serves both;
// only the table differs. Named explicitly — never interpolated from input.
const DEALBOOK_TABLE = { orders: "ten_at_ten_orders", deliveries: "ten_at_ten_deliveries" } as const;
export type DealbookKind = keyof typeof DEALBOOK_TABLE;

export function ingestTenAtTenOrders(parsed: OrderParse, meta: { filename: string; userId: string }): Promise<TenAtTenIngest> {
  return ingestDealbook(parsed, meta, "orders");
}

/**
 * Merge a Dealbook report into its table, line by line — the same rules as
 * the enquiry log: new lines are added, known lines overwritten with this
 * file's values (profit settling, a delivery landing or slipping a month),
 * identical lines left alone.
 */
export async function ingestDealbook(
  parsed: OrderParse,
  meta: { filename: string; userId: string },
  kind: DealbookKind,
  /**
   * Delivery months this file is the complete list for. Lines stored for
   * those months that the file no longer carries have slipped to another
   * month or been cancelled, and are removed — otherwise a slipped vehicle
   * would sit in its old month as "Due" for good.
   */
  syncMonths: string[] = [],
): Promise<TenAtTenIngest> {
  const table = sql.raw(DEALBOOK_TABLE[kind]);
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  let removed = 0;

  for (let i = 0; i < parsed.excludedIds.length; i += 400) {
    const slice = parsed.excludedIds.slice(i, i + 400);
    const [c] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ${table} WHERE id IN (${inList(slice)})`);
    if (Number(c?.n ?? 0) > 0) {
      await db.run(sql`DELETE FROM ${table} WHERE id IN (${inList(slice)})`);
      removed += Number(c.n);
    }
  }

  const existing = new Map<string, OrderComparable>();
  const ids = parsed.rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 400) {
    const found = await db.all<{
      id: string; exec: string; vehicle_raw: string | null; product: string | null; term_months: number | null;
      funder: string | null; delivery: string | null; delivery_day: string | null; delivery_status: string | null;
      registration: string | null; profit: number | null; insurance_count: number | null;
    }>(sql`SELECT id, exec, vehicle_raw, product, term_months, funder, delivery, delivery_day, delivery_status, registration, profit, insurance_count
           FROM ${table} WHERE id IN (${inList(ids.slice(i, i + 400))})`);
    for (const f of found) {
      existing.set(f.id, {
        exec: f.exec, vehicleRaw: f.vehicle_raw ?? "", product: f.product ?? "", termMonths: f.term_months,
        funder: f.funder ?? "", delivery: f.delivery ?? "", deliveryDay: f.delivery_day,
        deliveryStatus: (f.delivery_status ?? "") as OrderComparable["deliveryStatus"], registration: f.registration,
        profit: f.profit, insuranceCount: f.insurance_count == null ? null : Number(f.insurance_count),
      });
    }
  }

  let inserted = 0, updated = 0, unchanged = 0;
  const writes: TenAtTenOrder[] = [];
  for (const r of parsed.rows) {
    const prev = existing.get(r.id);
    if (!prev) { inserted++; writes.push(r); }
    else if (sameOrder(prev, r)) unchanged++;
    else { updated++; writes.push(r); }
  }

  for (let i = 0; i < writes.length; i += 50) {
    const values = writes.slice(i, i + 50).map((r) => sql`(
      ${r.id}, ${r.orderedAt}, ${r.orderDay}, ${r.exec}, ${r.customer}, ${r.vehicleRaw}, ${r.model},
      ${r.derivative}, ${r.derivativeKey}, ${r.segment}, ${r.product}, ${r.termMonths}, ${r.funder},
      ${r.delivery}, ${r.deliveryDay}, ${r.deliveryStatus}, ${r.registration}, ${r.insuranceCount}, ${r.profit}, ${nowSec}, ${nowSec}
    )`);
    await db.run(sql`
      INSERT INTO ${table} (
        id, ordered_at, order_day, exec, customer, vehicle_raw, model,
        derivative, derivative_key, segment, product, term_months, funder,
        delivery, delivery_day, delivery_status, registration, insurance_count, profit, first_uploaded_at, updated_at
      ) VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT(id) DO UPDATE SET
        exec = excluded.exec,
        vehicle_raw = excluded.vehicle_raw,
        model = excluded.model,
        derivative = excluded.derivative,
        derivative_key = excluded.derivative_key,
        segment = excluded.segment,
        product = excluded.product,
        term_months = excluded.term_months,
        funder = excluded.funder,
        delivery = excluded.delivery,
        delivery_day = excluded.delivery_day,
        delivery_status = excluded.delivery_status,
        registration = excluded.registration,
        insurance_count = excluded.insurance_count,
        profit = excluded.profit,
        updated_at = excluded.updated_at
    `);
  }

  // Every line in the file — unchanged ones too — was listed when this
  // export was taken. Never moved backwards, so uploading an old export
  // after a newer one changes nothing.
  const seen = parsed.exportedAt ?? wallClockFromInstant(now);
  for (let i = 0; i < ids.length; i += 400) {
    await db.run(sql`UPDATE ${table} SET last_seen_at = MAX(COALESCE(last_seen_at, 0), ${seen}) WHERE id IN (${inList(ids.slice(i, i + 400))})`);
  }

  if (syncMonths.length > 0 && parsed.rows.length > 0) {
    const keep = inList(parsed.rows.map((r) => r.id));
    const months = inList(syncMonths);
    const gone = sql`substr(delivery_day, 1, 7) IN (${months}) AND id NOT IN (${keep})`;
    const [c] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ${table} WHERE ${gone}`);
    if (Number(c?.n ?? 0) > 0) {
      await db.run(sql`DELETE FROM ${table} WHERE ${gone}`);
      removed += Number(c.n);
    }
  }

  const days = parsed.rows.map((r) => (kind === "deliveries" ? r.deliveryDay ?? r.orderDay : r.orderDay)).sort();
  const result: TenAtTenIngest = {
    rowsInFile: parsed.rowsInFile,
    inserted, updated, unchanged,
    excluded: parsed.skippedExcluded,
    removed,
    duplicatesCollapsed: 0,
    unreadable: parsed.skippedUnreadable,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
  };

  await db.insert(tenAtTenUploads).values({
    id: createHash("sha1").update(`${meta.filename}|${now.toISOString()}`).digest("hex").slice(0, 16),
    filename: meta.filename,
    rowsInFile: result.rowsInFile,
    inserted, updated, unchanged,
    excluded: result.excluded,
    removed,
    firstDay: result.firstDay,
    lastDay: result.lastDay,
    uploadedAt: now,
    uploadedByUserId: meta.userId,
    kind,
  });

  return result;
}

export async function loadTenAtTenOrders(): Promise<(OrderStoredRow & { id: string })[]> {
  const rows = await db.all<{
    id: string; order_day: string; exec: string; customer: string; model: string; derivative: string | null; derivative_key: string | null;
    segment: string; product: string | null; term_months: number | null; funder: string | null; delivery: string | null; profit: number | null;
  }>(sql`SELECT id, order_day, exec, customer, model, derivative, derivative_key, segment, product, term_months, funder, delivery, profit
         FROM ten_at_ten_orders ORDER BY ordered_at`);
  return rows.map((r) => ({
    id: r.id, orderDay: r.order_day, exec: r.exec, customer: r.customer, model: r.model, derivative: r.derivative,
    derivativeKey: r.derivative_key, segment: r.segment, product: r.product ?? "", termMonths: r.term_months,
    funder: r.funder ?? "", delivery: r.delivery ?? "", profit: r.profit == null ? null : Number(r.profit),
  }));
}

export async function loadTenAtTenRows(): Promise<StoredRow[]> {
  const rows = await db.all<{
    enquiry_day: string; exec: string; customer: string; source: string; model: string; derivative: string | null; derivative_key: string | null;
    status: string | null; outcome: string; finance_type: string | null; term_months: number | null; annual_mileage: number | null;
  }>(sql`SELECT enquiry_day, exec, customer, source, model, derivative, derivative_key, status, outcome, finance_type, term_months, annual_mileage
         FROM ten_at_ten_enquiries ORDER BY enquired_at`);
  return rows.map((r) => ({
    enquiryDay: r.enquiry_day, exec: r.exec, customer: r.customer, source: r.source, model: r.model, derivative: r.derivative,
    derivativeKey: r.derivative_key, status: r.status, outcome: r.outcome, financeType: r.finance_type,
    termMonths: r.term_months, annualMileage: r.annual_mileage,
  }));
}

/**
 * Exec codes ("DoJa") to names, borrowed from the Pole Position name map,
 * so the report reads in names wherever that map knows the code. Where
 * several codes map to one exec they merge under the name, which is right:
 * they are the same person.
 */
export async function loadExecNames(): Promise<Map<string, string>> {
  const rows = await db
    .select({ code: salesLeaderboardNameMap.reportCode, name: salesExecs.name })
    .from(salesLeaderboardNameMap)
    .innerJoin(salesExecs, eq(salesExecs.id, salesLeaderboardNameMap.salesExecId));
  return new Map(rows.map((r) => [r.code, r.name]));
}

export async function listTenAtTenUploads(limit = 25) {
  return db.select().from(tenAtTenUploads).orderBy(desc(tenAtTenUploads.uploadedAt)).limit(limit);
}

/**
 * Log a MotorComplete export (Response times) in the 10 at 10 upload
 * history. Its rows go through the Enquiry Tracker's own ingest
 * (lib/enquiries.ts), which keeps its own audit table too; this row is so
 * the one upload screen lists every file, whatever it fed.
 */
export async function recordResponseUpload(result: TenAtTenIngest, meta: { filename: string; userId: string }): Promise<void> {
  const now = new Date();
  await db.insert(tenAtTenUploads).values({
    id: createHash("sha1").update(`${meta.filename}|${now.toISOString()}|response`).digest("hex").slice(0, 16),
    filename: meta.filename,
    rowsInFile: result.rowsInFile,
    inserted: result.inserted,
    updated: result.updated,
    unchanged: result.unchanged,
    excluded: result.excluded,
    removed: result.removed,
    firstDay: result.firstDay,
    lastDay: result.lastDay,
    uploadedAt: now,
    uploadedByUserId: meta.userId,
    kind: "response",
  });
}

/**
 * Deliveries for the report, shaped as order rows so the Orders views can be
 * reused: `orderDay` carries the DELIVERY day (the month a vehicle counts
 * in) and `delivery` its status — Delivered, Arrived or Due.
 */
export async function loadTenAtTenDeliveries(): Promise<OrderStoredRow[]> {
  const rows = await db.all<{
    delivery_day: string; delivery_status: string | null; exec: string; customer: string; model: string; derivative: string | null;
    derivative_key: string | null; segment: string; product: string | null; term_months: number | null; funder: string | null; profit: number | null;
  }>(sql`SELECT delivery_day, delivery_status, exec, customer, model, derivative, derivative_key, segment, product, term_months, funder, profit
         FROM ten_at_ten_deliveries WHERE delivery_day IS NOT NULL ORDER BY delivery_day`);
  return rows.map((r) => ({
    orderDay: r.delivery_day, exec: r.exec, customer: r.customer, model: r.model, derivative: r.derivative,
    derivativeKey: r.derivative_key, segment: r.segment, product: r.product ?? "", termMonths: r.term_months,
    funder: r.funder ?? "", delivery: r.delivery_status ?? "", profit: r.profit == null ? null : Number(r.profit),
  }));
}


export async function loadBudgets(): Promise<Budgets> {
  const rows = await db.select().from(tenAtTenBudgets);
  const out: Budgets = {};
  for (const r of rows) {
    const b = (out[r.yearMonth] ??= { car: 0, cv: 0 });
    if (r.segment === "car") b.car = r.units;
    else if (r.segment === "cv") b.cv = r.units;
  }
  return out;
}

export async function saveBudgets(rows: { yearMonth: string; car: number; cv: number }[]): Promise<void> {
  for (const r of rows) {
    for (const [segment, units] of [["car", r.car], ["cv", r.cv]] as const) {
      await db.run(sql`
        INSERT INTO ten_at_ten_budgets (year_month, segment, units) VALUES (${r.yearMonth}, ${segment}, ${units})
        ON CONFLICT(year_month, segment) DO UPDATE SET units = excluded.units
      `);
    }
  }
}

export interface HeldSummary { rows: number; firstDay: string | null; lastDay: string | null }

export async function tenAtTenSummary(): Promise<{ enquiries: HeldSummary; orders: HeldSummary; deliveries: HeldSummary; response: HeldSummary; cancellations: HeldSummary }> {
  const [e] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(enquiry_day) AS lo, MAX(enquiry_day) AS hi FROM ten_at_ten_enquiries`,
  );
  const [o] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(order_day) AS lo, MAX(order_day) AS hi FROM ten_at_ten_orders`,
  );
  const [x] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(enquiry_day) AS lo, MAX(enquiry_day) AS hi FROM enquiries`,
  );
  const [d] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(delivery_day) AS lo, MAX(delivery_day) AS hi FROM ten_at_ten_deliveries`,
  );
  const [c] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(cancelled_day) AS lo, MAX(cancelled_day) AS hi FROM ten_at_ten_cancellations`,
  );
  const held = (r: { n: number; lo: string | null; hi: string | null } | undefined): HeldSummary =>
    ({ rows: Number(r?.n ?? 0), firstDay: r?.lo ?? null, lastDay: r?.hi ?? null });
  return { enquiries: held(e), orders: held(o), deliveries: held(d), response: held(x), cancellations: held(c) };
}

// ─── Cancellations ─────────────────────────────────────────────────────────

type CancelComparable = Pick<TenAtTenCancellation, "exec" | "cancelledAt" | "customer" | "saleType" | "vehicleRaw" | "registration">;

const sameCancellation = (a: CancelComparable, b: CancelComparable) =>
  a.exec === b.exec && a.cancelledAt === b.cancelledAt && a.customer === b.customer && a.saleType === b.saleType
  && a.vehicleRaw === b.vehicleRaw && a.registration === b.registration;

/**
 * Merge a Cancelled Orders export, line by line, as every other upload.
 * Notes live in their own table and are never touched here.
 */
export async function ingestCancellations(parsed: CancellationParse, meta: { filename: string; userId: string }): Promise<TenAtTenIngest> {
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  let removed = 0;

  for (let i = 0; i < parsed.excludedIds.length; i += 400) {
    const slice = parsed.excludedIds.slice(i, i + 400);
    const [c] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ten_at_ten_cancellations WHERE id IN (${inList(slice)})`);
    if (Number(c?.n ?? 0) > 0) {
      await db.run(sql`DELETE FROM ten_at_ten_cancellations WHERE id IN (${inList(slice)})`);
      removed += Number(c.n);
    }
  }

  const existing = new Map<string, CancelComparable>();
  const ids = parsed.rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 400) {
    const found = await db.all<{
      id: string; exec: string; cancelled_at: number; customer: string; sale_type: string | null; vehicle_raw: string | null; registration: string | null;
    }>(sql`SELECT id, exec, cancelled_at, customer, sale_type, vehicle_raw, registration
           FROM ten_at_ten_cancellations WHERE id IN (${inList(ids.slice(i, i + 400))})`);
    for (const f of found) {
      existing.set(f.id, {
        exec: f.exec, cancelledAt: Number(f.cancelled_at), customer: f.customer, saleType: f.sale_type,
        vehicleRaw: f.vehicle_raw ?? "", registration: f.registration,
      });
    }
  }

  let inserted = 0, updated = 0, unchanged = 0;
  const writes: TenAtTenCancellation[] = [];
  for (const r of parsed.rows) {
    const prev = existing.get(r.id);
    if (!prev) { inserted++; writes.push(r); }
    else if (sameCancellation(prev, r)) unchanged++;
    else { updated++; writes.push(r); }
  }

  for (let i = 0; i < writes.length; i += 50) {
    const values = writes.slice(i, i + 50).map((r) => sql`(
      ${r.id}, ${r.orderedAt}, ${r.orderDay}, ${r.cancelledAt}, ${r.cancelledDay}, ${r.exec}, ${r.customer}, ${r.saleType},
      ${r.vehicleRaw}, ${r.model}, ${r.derivative}, ${r.derivativeKey}, ${r.segment}, ${r.registration}, ${nowSec}, ${nowSec}
    )`);
    await db.run(sql`
      INSERT INTO ten_at_ten_cancellations (
        id, ordered_at, order_day, cancelled_at, cancelled_day, exec, customer, sale_type,
        vehicle_raw, model, derivative, derivative_key, segment, registration, first_uploaded_at, updated_at
      ) VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT(id) DO UPDATE SET
        cancelled_at = excluded.cancelled_at,
        cancelled_day = excluded.cancelled_day,
        exec = excluded.exec,
        customer = excluded.customer,
        sale_type = excluded.sale_type,
        vehicle_raw = excluded.vehicle_raw,
        model = excluded.model,
        derivative = excluded.derivative,
        derivative_key = excluded.derivative_key,
        segment = excluded.segment,
        registration = excluded.registration,
        updated_at = excluded.updated_at
    `);
  }

  const days = parsed.rows.map((r) => r.cancelledDay).sort();
  const result: TenAtTenIngest = {
    rowsInFile: parsed.rowsInFile,
    inserted, updated, unchanged,
    excluded: parsed.skippedExcluded,
    removed,
    duplicatesCollapsed: 0,
    unreadable: parsed.skippedUnreadable,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
  };

  await db.insert(tenAtTenUploads).values({
    id: createHash("sha1").update(`${meta.filename}|${now.toISOString()}|cancellations`).digest("hex").slice(0, 16),
    filename: meta.filename,
    rowsInFile: result.rowsInFile,
    inserted, updated, unchanged,
    excluded: result.excluded,
    removed,
    firstDay: result.firstDay,
    lastDay: result.lastDay,
    uploadedAt: now,
    uploadedByUserId: meta.userId,
    kind: "cancellations",
  });
  return result;
}

const DEALBOOK_LINES = {
  orders: sql`SELECT id, order_day, exec, customer, model, vehicle_raw, registration, last_seen_at, first_uploaded_at, profit FROM ten_at_ten_orders`,
  deliveries: sql`SELECT id, order_day, exec, customer, model, vehicle_raw, registration, last_seen_at, first_uploaded_at, profit FROM ten_at_ten_deliveries`,
} as const;

async function loadDealbookLines(source: keyof typeof DEALBOOK_LINES): Promise<DealbookLine[]> {
  const rows = await db.all<{
    id: string; order_day: string; exec: string; customer: string; model: string; vehicle_raw: string | null;
    registration: string | null; last_seen_at: number | null; first_uploaded_at: number; profit: number | null;
  }>(DEALBOOK_LINES[source]);
  return rows.map((r) => ({
    id: r.id, source, orderDay: r.order_day, exec: r.exec, customer: r.customer, model: r.model,
    // Re-read, so a placeholder stored before plateOf knew better is no plate.
    vehicleRaw: r.vehicle_raw ?? "", registration: plateOf(r.registration),
    // Lines uploaded before exports were time-stamped fall back to when they
    // were first uploaded — never earlier than the export itself.
    seenAt: r.last_seen_at != null ? Number(r.last_seen_at) : wallClockFromInstant(Number(r.first_uploaded_at) * 1000),
    profit: r.profit == null ? null : Number(r.profit),
  }));
}

const fmtStamp = (sec: number) =>
  new Date(sec * 1000).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Every cancellation, classified against the Dealbook, with its notes; the
 * held order lines that were cancelled (`originalIds`); every held order
 * line Orders leaves out (`leftOutIds`: those, and any old copy Dealerweb's
 * order list no longer carries — `staleOrderIds`); and each Re-Write's
 * re-order with the original order day it is credited to (`creditOrders`).
 */
export async function loadCancellationsReport(names: Map<string, string>): Promise<{
  views: CancellationView[]; originalIds: Set<string>; leftOutIds: Set<string>; rewriteOrderDays: Map<string, string>;
}> {
  const [cancels, notes, orders, deliveries] = await Promise.all([
    db.all<{
      id: string; ordered_at: number; order_day: string; cancelled_at: number; cancelled_day: string; exec: string; customer: string;
      vehicle_raw: string | null; model: string; segment: string; registration: string | null;
    }>(sql`SELECT id, ordered_at, order_day, cancelled_at, cancelled_day, exec, customer, vehicle_raw, model, segment, registration
           FROM ten_at_ten_cancellations ORDER BY cancelled_at`),
    db.all<{ cancellation_id: string; note: string; classification: string | null; updated_by: string | null; updated_at: number }>(
      sql`SELECT cancellation_id, note, classification, updated_by, updated_at FROM ten_at_ten_cancellation_notes`,
    ),
    loadDealbookLines("orders"),
    loadDealbookLines("deliveries"),
  ]);
  const stale = staleOrderIds(orders);
  if (cancels.length === 0) return { views: [], originalIds: new Set(), leftOutIds: stale, rewriteOrderDays: new Map() };

  // The export names execs in full; the Dealbook uses codes. A name's codes
  // are whatever the Pole Position map gives it, plus Dealerweb's own
  // convention (first two letters of first and last name).
  const codesByName = new Map<string, string[]>();
  for (const [code, name] of names) {
    const k = name.toLowerCase();
    codesByName.set(k, [...(codesByName.get(k) ?? []), code]);
  }
  const execCodesOf = (name: string) => [...(codesByName.get(name.toLowerCase()) ?? []), execCodeFromName(name)];

  const rows = cancels.map((c) => ({
    id: c.id, exec: c.exec, orderDay: c.order_day, cancelledAt: Number(c.cancelled_at), cancelledDay: c.cancelled_day,
    customer: c.customer, model: c.model, registration: plateOf(c.registration),
  }));
  const { matches, originalIds } = matchCancellations(rows, mergeDealbookLines(orders, deliveries), execCodesOf);
  const noteOf = new Map(notes.map((n) => [n.cancellation_id, n]));
  // A manager's call on Re-Write vs cancellation, where one was made.
  const calls = new Map<string, CancellationStatus>();
  for (const n of notes) if (n.classification === "rewrite" || n.classification === "proper") calls.set(n.cancellation_id, n.classification);

  const views = cancels.map((c): CancellationView => {
    const m = matches.get(c.id)!;
    const n = noteOf.get(c.id);
    const manual = calls.get(c.id) ?? null;
    return {
      id: c.id,
      day: c.cancelled_day,
      orderDay: c.order_day,
      exec: c.exec,
      customer: c.customer,
      vehicle: c.vehicle_raw ?? c.model,
      model: c.model,
      segment: c.segment,
      registration: c.registration,
      status: manual ?? m.status,
      auto: m.status,
      overridden: manual != null && manual !== m.status,
      reorder: m.reorder ? { ...m.reorder, exec: names.get(m.reorder.exec) ?? m.reorder.exec } : null,
      orderProfit: m.originalProfit,
      note: n?.note ?? "",
      noteBy: n?.updated_by ?? null,
      noteAt: n ? fmtStamp(Number(n.updated_at)) : null,
    };
  });
  return { views, originalIds, leftOutIds: new Set([...originalIds, ...stale]), rewriteOrderDays: rewriteOrderDaysOf(rows, matches, calls) };
}

async function cancellationExists(id: string): Promise<boolean> {
  const [r] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ten_at_ten_cancellations WHERE id = ${id}`);
  return Number(r?.n ?? 0) > 0;
}

/** Save a manager's reason for a cancellation. False if there is no such cancellation. */
export async function saveCancellationNote(id: string, note: string, by: string): Promise<boolean> {
  if (!(await cancellationExists(id))) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  await db.run(sql`
    INSERT INTO ten_at_ten_cancellation_notes (cancellation_id, note, classification, updated_by, updated_at)
    VALUES (${id}, ${note}, NULL, ${by}, ${nowSec})
    ON CONFLICT(cancellation_id) DO UPDATE SET note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `);
  return true;
}

/**
 * A manager's call on Re-Write vs cancellation, overriding the matching;
 * null hands it back to the matching. False if there is no such cancellation.
 */
export async function setCancellationClassification(id: string, classification: "rewrite" | "proper" | null, by: string): Promise<boolean> {
  if (!(await cancellationExists(id))) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  await db.run(sql`
    INSERT INTO ten_at_ten_cancellation_notes (cancellation_id, note, classification, updated_by, updated_at)
    VALUES (${id}, '', ${classification}, ${by}, ${nowSec})
    ON CONFLICT(cancellation_id) DO UPDATE SET classification = excluded.classification, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `);
  return true;
}
