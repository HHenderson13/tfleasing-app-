// 10 at 10 — the Dealbook Extract: Dealerweb's delivered list as a CSV with
// every column (user, 2026-10-20). It is uploaded for one thing the ag-grid
// order and delivered lists don't carry: column BQ, Basic — the vehicle's
// basic price, which a percentage bonus is paid on (lib/ten-at-ten-bonus.ts).
//
// Downloaded a delivery month at a time ("Dealbook_Extract_20_10_2026.csv"
// is October's 85 lines), so like Dealbook – Deliveries each upload is the
// complete list for its delivery month(s).
//
// Columns are read by their header, apart from Basic, which is checked to
// be in BQ because that is where the user reads it — a Dealerweb layout
// change then stops the upload rather than paying a bonus on the wrong
// figure.

import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { execCodeFromName } from "./sales-leaderboard";
import { isExcludedExec } from "./ten-at-ten";
import { bonusFor, bonusTypeOf, matchExtract, type BonusRates, type DealMatchLine, type ExtractMatchLine } from "./ten-at-ten-bonus";
import { execCodeLookup } from "./ten-at-ten-cancellations";
import { makeDeliveryKey, plateOf, type DeliveryStatus } from "./ten-at-ten-orders";
import type { OrderStoredRow } from "./ten-at-ten-report";

/** Column BQ, zero-based. */
export const BASIC_COLUMN = 68;

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const letters = (s: unknown) => norm(s).toLowerCase().replace(/[^a-z]/g, "");

const FIELDS = {
  customer: "customer",
  vehicle: "model",
  orderDate: "orderdate",
  exec: "se",
  deliveryDate: "delivdate",
  deliveryStatus: "delivstatus",
  registration: "regno",
  vin: "vin",
  vehicleType: "vehicletype",
  profit: "acttotalgrossprofit",
  addBonus: "actaddbonus",
  options: "options",
} as const;
type Field = keyof typeof FIELDS;
const REQUIRED: Field[] = ["customer", "vehicle", "orderDate", "exec", "deliveryDate", "deliveryStatus", "profit"];

export class NotADealbookExtractError extends Error {
  constructor(detail: string) {
    super(`That isn't the Dealbook Extract — ${detail}.`);
    this.name = "NotADealbookExtractError";
  }
}

/** The extract's header: Branch, Conf, New/Used… with Basic in BQ. */
export function isDealbookExtractHeader(header: readonly unknown[]): boolean {
  const names = new Set(header.map(letters));
  return letters(header[BASIC_COLUMN]) === "basic" && REQUIRED.every((f) => names.has(FIELDS[f]));
}

export interface ExtractLine {
  id: string;
  orderDay: string;
  deliveryDay: string;
  deliveryStatus: DeliveryStatus;
  /** The exec in full, as the extract names them. */
  execName: string;
  customer: string;
  vehicleRaw: string;
  /** Dealerweb's Car / LCV. */
  vehicleType: string;
  registration: string | null;
  vin: string | null;
  /** Column BQ. */
  basic: number | null;
  options: number | null;
  /** ACT Total Gross Profit — the delivered list's Total Gross. */
  profit: number | null;
  /** ACT Add. Bonus — Dealerweb's own bonus, already inside profit. */
  addBonus: number | null;
}

export interface ExtractParse {
  rows: ExtractLine[];
  rowsInFile: number;
  skippedExcluded: number;
  skippedUnreadable: number;
  excludedIds: string[];
}

/** "08/04/2026" → "2026-04-08". The extract writes UK dates, day first. */
function ukDay(raw: unknown): string | null {
  const m = norm(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function money(raw: unknown): number | null {
  const s = norm(raw).replace(/[£,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function statusOf(raw: unknown): DeliveryStatus {
  const s = letters(raw);
  return s === "dlv" ? "Delivered" : s === "arr" ? "Arrived" : s === "est" ? "Due" : "Not stated";
}

/**
 * Order day + customer + vehicle + which occurrence in the file, then the
 * delivery month — the same shape as a Dealbook – Deliveries key, for the
 * same reason: one deal can deliver identical vehicles in different months.
 */
export function makeExtractKey(orderDay: string, customer: string, vehicle: string, occurrence: number, deliveryDay: string): string {
  const order = createHash("sha1").update(`${orderDay}|${norm(customer).toLowerCase()}|${norm(vehicle).toLowerCase()}|${occurrence}`).digest("hex");
  return createHash("sha1").update(`${order}|${deliveryDay.slice(0, 7)}`).digest("hex").slice(0, 20);
}

/** Read the CSV as text, so Excel-style guessing never turns 08/04 into 4 August. */
function grid(buf: ArrayBuffer | Buffer): string[][] {
  const text = Buffer.from(buf as ArrayBuffer).toString("utf8").replace(/^﻿/, "");
  const wb = XLSX.read(text, { type: "string", raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
}

export function parseExtractCsv(buf: ArrayBuffer | Buffer): ExtractParse {
  const rows = grid(buf);
  const header = rows[0] ?? [];
  if (!isDealbookExtractHeader(header)) {
    const bq = norm(header[BASIC_COLUMN]);
    throw new NotADealbookExtractError(bq.toLowerCase() === "basic"
      ? "it is missing columns the extract always has (Customer, Model, Order Date, SE, Deliv Date, Deliv Status, ACT Total Gross Profit)"
      : `column BQ should be Basic, and it is ${bq ? `"${bq}"` : "empty"}`);
  }
  const at = new Map(header.map((h, i) => [letters(h), i]));
  const cell = (r: string[], f: Field) => { const i = at.get(FIELDS[f]); return i == null ? "" : norm(r[i]); };

  const out: ExtractParse = { rows: [], rowsInFile: 0, skippedExcluded: 0, skippedUnreadable: 0, excludedIds: [] };
  const seen = new Map<string, number>();
  for (const r of rows.slice(1)) {
    if (!r.some((c) => norm(c))) continue;
    out.rowsInFile++;
    const customer = cell(r, "customer");
    const vehicleRaw = cell(r, "vehicle");
    const orderDay = ukDay(cell(r, "orderDate"));
    const deliveryDay = ukDay(cell(r, "deliveryDate"));
    if (!customer || !orderDay || !deliveryDay) { out.skippedUnreadable++; continue; }

    const base = `${orderDay}|${customer.toLowerCase()}|${vehicleRaw.toLowerCase()}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const id = makeExtractKey(orderDay, customer, vehicleRaw, occurrence, deliveryDay);

    const execName = cell(r, "exec");
    if (isExcludedExec(execCodeFromName(execName))) { out.skippedExcluded++; out.excludedIds.push(id); continue; }

    out.rows.push({
      id,
      orderDay,
      deliveryDay,
      deliveryStatus: statusOf(cell(r, "deliveryStatus")),
      execName,
      customer,
      vehicleRaw,
      vehicleType: cell(r, "vehicleType"),
      registration: plateOf(cell(r, "registration")),
      vin: cell(r, "vin") || null,
      basic: money(r[BASIC_COLUMN]),
      options: money(cell(r, "options")),
      profit: money(cell(r, "profit")),
      addBonus: money(cell(r, "addBonus")),
    });
  }
  return out;
}

// ─── Bonuses on each deal ──────────────────────────────────────────────────

/**
 * A Dealbook line as held, before its bonus is worked out (applyBonuses):
 * what the report shows, plus what matching it to the Dealbook Extract and
 * dating its bonus need.
 */
export interface DealbookStored {
  id: string;
  /** The real order day, on both reports. */
  orderDay: string;
  exec: string;
  customer: string;
  model: string;
  derivative: string | null;
  derivativeKey: string | null;
  segment: string;
  product: string;
  termMonths: number | null;
  funder: string;
  /** Orders: Delivered / Awaiting delivery. Deliveries: Delivered / Arrived / Due. */
  delivery: string;
  /** Column AK's date. */
  deliveryDay: string | null;
  vehicleRaw: string;
  registration: string | null;
  profit: number | null;
  /** When an export last listed it (wall clock). */
  seenAt: number;
}

/**
 * Each order and delivery with its bonus (lib/ten-at-ten-bonus.ts), shaped
 * for the report. Worked out on every read, never stored, so it follows the
 * rates and the latest uploads.
 *
 * - Basic comes from the deal's Dealbook Extract line (matchExtract); an
 *   order not matched itself borrows its delivered line's match.
 * - The bonus month is the delivery date: a delivery's own; an order's from
 *   its line on a delivered list when it has one (the latest seen, as the
 *   delivered list is synced month by month), else its extract line's, else
 *   its own column AK.
 * - Deliveries come back with `orderDay` holding the DELIVERY day and
 *   `delivery` the status, so the Orders views serve both tabs.
 */
export function applyBonuses(input: {
  orders: DealbookStored[]; deliveries: DealbookStored[];
  extract: (ExtractMatchLine & { basic: number | null; deliveryDay: string })[];
  rates: BonusRates; names: Map<string, string>;
}): { orders: (OrderStoredRow & { id: string })[]; deliveries: OrderStoredRow[] } {
  const { orders, deliveries, extract, rates } = input;
  const execCodesOf = execCodeLookup(input.names);
  const lineOf = new Map(extract.map((e) => [e.id, e]));
  const deal = (r: DealbookStored): DealMatchLine => ({
    id: r.id, orderDay: r.orderDay, exec: r.exec, customer: r.customer, vehicle: r.vehicleRaw, registration: r.registration, profit: r.profit,
  });
  const deliveryMatch = matchExtract(deliveries.map(deal), extract, execCodesOf);
  const orderMatch = matchExtract(orders.map(deal), extract, execCodesOf);

  const shape = (r: DealbookStored, day: string, bonusDay: string | null, basic: number | null): OrderStoredRow => {
    const bonusType = bonusTypeOf(r.segment, r.model, r.vehicleRaw);
    const { bonus, flag } = bonusFor(bonusType, bonusDay, basic, rates);
    return {
      orderDay: day, exec: r.exec, customer: r.customer, model: r.model, derivative: r.derivative, derivativeKey: r.derivativeKey,
      segment: r.segment, product: r.product, termMonths: r.termMonths, funder: r.funder, delivery: r.delivery, profit: r.profit,
      bonus, bonusFlag: flag, bonusType, bonusDay, basic,
    };
  };

  const deliveriesOut = deliveries.map((d) => {
    const line = lineOf.get(deliveryMatch.get(d.id) ?? "");
    return shape(d, d.deliveryDay as string, d.deliveryDay, line?.basic ?? null);
  });

  // An order's line on a delivered list carries the order's key plus the
  // delivery month (makeDeliveryKey).
  const deliveryById = new Map(deliveries.map((d) => [d.id, d]));
  const months = [...new Set(deliveries.map((d) => (d.deliveryDay as string).slice(0, 7)))];
  const ordersOut = orders.map((o) => {
    let delivered: DealbookStored | undefined;
    for (const m of months) {
      const d = deliveryById.get(makeDeliveryKey(o.id, `${m}-01`));
      if (d && (!delivered || d.seenAt > delivered.seenAt)) delivered = d;
    }
    const line = lineOf.get(orderMatch.get(o.id) ?? "") ?? (delivered ? lineOf.get(deliveryMatch.get(delivered.id) ?? "") : undefined);
    const bonusDay = delivered?.deliveryDay ?? line?.deliveryDay ?? o.deliveryDay;
    return { id: o.id, ...shape(o, o.orderDay, bonusDay, line?.basic ?? null) };
  });
  return { orders: ordersOut, deliveries: deliveriesOut };
}
