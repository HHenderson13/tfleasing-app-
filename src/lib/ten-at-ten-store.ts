import "server-only";

import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { salesExecs, salesLeaderboardNameMap, tenAtTenUploads } from "@/db/schema";
import type { TenAtTenEnquiry, TenAtTenParse } from "./ten-at-ten";
import type { OrderParse, TenAtTenOrder } from "./ten-at-ten-orders";
import type { OrderStoredRow, StoredRow } from "./ten-at-ten-report";

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

type OrderComparable = Pick<TenAtTenOrder, "exec" | "vehicleRaw" | "product" | "termMonths" | "funder" | "delivery" | "profit">;

function sameOrder(a: OrderComparable, b: OrderComparable): boolean {
  return a.exec === b.exec && a.vehicleRaw === b.vehicleRaw && a.product === b.product && a.termMonths === b.termMonths
    && a.funder === b.funder && a.delivery === b.delivery && a.profit === b.profit;
}

/**
 * Merge an order list into the store, line by line — the same rules as the
 * enquiry log: new lines are added, known lines overwritten with this file's
 * values (profit settling, delivery landing), identical lines left alone.
 */
export async function ingestTenAtTenOrders(parsed: OrderParse, meta: { filename: string; userId: string }): Promise<TenAtTenIngest> {
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  let removed = 0;

  for (let i = 0; i < parsed.excludedIds.length; i += 400) {
    const slice = parsed.excludedIds.slice(i, i + 400);
    const [c] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ten_at_ten_orders WHERE id IN (${inList(slice)})`);
    if (Number(c?.n ?? 0) > 0) {
      await db.run(sql`DELETE FROM ten_at_ten_orders WHERE id IN (${inList(slice)})`);
      removed += Number(c.n);
    }
  }

  const existing = new Map<string, OrderComparable>();
  const ids = parsed.rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 400) {
    const found = await db.all<{
      id: string; exec: string; vehicle_raw: string | null; product: string | null; term_months: number | null;
      funder: string | null; delivery: string | null; profit: number | null;
    }>(sql`SELECT id, exec, vehicle_raw, product, term_months, funder, delivery, profit
           FROM ten_at_ten_orders WHERE id IN (${inList(ids.slice(i, i + 400))})`);
    for (const f of found) {
      existing.set(f.id, {
        exec: f.exec, vehicleRaw: f.vehicle_raw ?? "", product: f.product ?? "", termMonths: f.term_months,
        funder: f.funder ?? "", delivery: f.delivery ?? "", profit: f.profit,
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
      ${r.delivery}, ${r.profit}, ${nowSec}, ${nowSec}
    )`);
    await db.run(sql`
      INSERT INTO ten_at_ten_orders (
        id, ordered_at, order_day, exec, customer, vehicle_raw, model,
        derivative, derivative_key, segment, product, term_months, funder,
        delivery, profit, first_uploaded_at, updated_at
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
        profit = excluded.profit,
        updated_at = excluded.updated_at
    `);
  }

  const days = parsed.rows.map((r) => r.orderDay).sort();
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
    kind: "orders",
  });

  return result;
}

export async function loadTenAtTenOrders(): Promise<OrderStoredRow[]> {
  const rows = await db.all<{
    order_day: string; exec: string; customer: string; model: string; derivative: string | null; derivative_key: string | null;
    segment: string; product: string | null; term_months: number | null; funder: string | null; delivery: string | null; profit: number | null;
  }>(sql`SELECT order_day, exec, customer, model, derivative, derivative_key, segment, product, term_months, funder, delivery, profit
         FROM ten_at_ten_orders ORDER BY ordered_at`);
  return rows.map((r) => ({
    orderDay: r.order_day, exec: r.exec, customer: r.customer, model: r.model, derivative: r.derivative,
    derivativeKey: r.derivative_key, segment: r.segment, product: r.product ?? "", termMonths: r.term_months,
    funder: r.funder ?? "", delivery: r.delivery ?? "", profit: r.profit == null ? null : Number(r.profit),
  }));
}

export async function loadTenAtTenRows(): Promise<StoredRow[]> {
  const rows = await db.all<{
    enquiry_day: string; exec: string; source: string; model: string; derivative: string | null; derivative_key: string | null;
    status: string | null; outcome: string; finance_type: string | null; term_months: number | null; annual_mileage: number | null;
  }>(sql`SELECT enquiry_day, exec, source, model, derivative, derivative_key, status, outcome, finance_type, term_months, annual_mileage
         FROM ten_at_ten_enquiries ORDER BY enquired_at`);
  return rows.map((r) => ({
    enquiryDay: r.enquiry_day, exec: r.exec, source: r.source, model: r.model, derivative: r.derivative,
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

export interface HeldSummary { rows: number; firstDay: string | null; lastDay: string | null }

export async function tenAtTenSummary(): Promise<{ enquiries: HeldSummary; orders: HeldSummary; response: HeldSummary }> {
  const [e] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(enquiry_day) AS lo, MAX(enquiry_day) AS hi FROM ten_at_ten_enquiries`,
  );
  const [o] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(order_day) AS lo, MAX(order_day) AS hi FROM ten_at_ten_orders`,
  );
  const [x] = await db.all<{ n: number; lo: string | null; hi: string | null }>(
    sql`SELECT COUNT(*) AS n, MIN(enquiry_day) AS lo, MAX(enquiry_day) AS hi FROM enquiries`,
  );
  const held = (r: { n: number; lo: string | null; hi: string | null } | undefined): HeldSummary =>
    ({ rows: Number(r?.n ?? 0), firstDay: r?.lo ?? null, lastDay: r?.hi ?? null });
  return { enquiries: held(e), orders: held(o), response: held(x) };
}
