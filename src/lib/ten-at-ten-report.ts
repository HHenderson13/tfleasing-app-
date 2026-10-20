// 10 at 10 — report maths. Client-safe (no node imports): the page ships
// every stored enquiry once and the browser slices it by period, filters
// and groups it, so changing the period or the breakdown is instant.
//
// Conversion is always orders ÷ enquiries, over enquiries RAISED in the
// period: "of the enquiries that came in, how many have ordered so far".
// It is reported three ways, always side by side (user, 2026-10-12):
// inbound (the MotorComplete-fed sources), broker / prospect (everything
// else), and overall, which the two make up.

import { buildPeriod, fromDayKey, shiftAnchor, toDayKey, type Granularity } from "./period";

export const SOURCES = ["TF Lead", "Leasing.com", "LeaseLoco", "CarWow", "Broker / Prospect"] as const;
export type SourceName = (typeof SOURCES)[number];

/** The sources fed by MotorComplete — inbound leads. Everything else is Broker / Prospect. */
export const INBOUND_SOURCES: readonly string[] = ["TF Lead", "Leasing.com", "LeaseLoco", "CarWow"];
export const isInboundSource = (source: string) => INBOUND_SOURCES.includes(source);
export type Outcome = "order" | "live" | "lost" | "other";

export const NOT_STATED = "Not stated";

export const SEGMENTS = ["ICE Car", "BEV Car", "Van"] as const;
export type Segment = (typeof SEGMENTS)[number];

// Profit bands for orders, in display order — losses split by size, since
// "a loss" covers everything from a rounding error to a £1,800 hit.
export const PROFIT_BANDS = [
  "−£1,000 and below", "−£999 to −£500", "−£499 to −£1",
  "£0 to £499", "£500 to £999", "£1,000 to £1,999", "£2,000 and above",
  "No profit figure",
] as const;

export function profitBand(p: number | null): string {
  if (p == null) return "No profit figure";
  if (p <= -1000) return "−£1,000 and below";
  if (p <= -500) return "−£999 to −£500";
  if (p < 0) return "−£499 to −£1";
  if (p < 500) return "£0 to £499";
  if (p < 1000) return "£500 to £999";
  if (p < 2000) return "£1,000 to £1,999";
  return "£2,000 and above";
}

// ─── Wire format ───────────────────────────────────────────────────────────
//
// Strings are interned into one table and each row is a tuple of indexes,
// which keeps a year of enquiries to a few hundred KB of page payload.

const OUTCOME_CODES: Outcome[] = ["other", "order", "live", "lost"];

export interface ReportPayload {
  strings: string[];
  /** [dayNumber, exec, source, model, derivative, status, finance, term, mileage, outcome, customer] */
  rows: number[][];
}

export interface StoredRow {
  enquiryDay: string;
  exec: string;
  customer: string;
  source: string;
  model: string;
  derivative: string | null;
  derivativeKey: string | null;
  status: string | null;
  outcome: string;
  financeType: string | null;
  termMonths: number | null;
  annualMileage: number | null;
}

export interface ReportRow {
  day: string;
  exec: string;
  customer: string;
  source: string;
  model: string;
  derivative: string;
  status: string;
  outcome: Outcome;
  financeType: string;
  term: string;
  mileage: string;
}

const MS_PER_DAY = 86_400_000;
const dayNumber = (day: string) => Math.round(fromDayKey(day).getTime() / MS_PER_DAY);
const dayFromNumber = (n: number) => toDayKey(new Date(n * MS_PER_DAY));

export function termLabel(months: number | null): string {
  return months ? `${months} months` : NOT_STATED;
}

export function mileageLabel(miles: number | null): string {
  return miles ? `${miles.toLocaleString("en-GB")} miles` : NOT_STATED;
}

/**
 * Encode stored rows for the page. Exec codes become names where the
 * Pole Position name map knows them. Each derivative group is labelled with
 * the spelling used most often, so "Explorer Estate 140kW Style" and
 * "Explorer 140kW Style" show once, under the commoner name.
 */
function derivativeLabeller(rows: readonly { model: string; derivative: string | null; derivativeKey: string | null }[]) {
  const spellings = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.derivativeKey || !r.derivative) continue;
    const m = spellings.get(r.derivativeKey) ?? new Map<string, number>();
    m.set(r.derivative, (m.get(r.derivative) ?? 0) + 1);
    spellings.set(r.derivativeKey, m);
  }
  const labelOf = new Map<string, string>();
  for (const [key, m] of spellings) {
    labelOf.set(key, [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  }
  return (r: { model: string; derivative: string | null; derivativeKey: string | null }) =>
    r.derivativeKey ? labelOf.get(r.derivativeKey) ?? r.derivative ?? r.model : `${r.model} (model only)`;
}

function interner() {
  const strings: string[] = [];
  const index = new Map<string, number>();
  const intern = (s: string) => {
    let i = index.get(s);
    if (i === undefined) { i = strings.length; strings.push(s); index.set(s, i); }
    return i;
  };
  return { strings, intern };
}

export function encodeReport(rows: StoredRow[], execNames: Map<string, string> = new Map()): ReportPayload {
  const labelOf = derivativeLabeller(rows);
  const { strings, intern } = interner();

  const out: number[][] = rows.map((r) => {
    const derivative = labelOf(r);
    const outcome = Math.max(0, OUTCOME_CODES.indexOf(r.outcome as Outcome));
    return [
      dayNumber(r.enquiryDay),
      intern(execNames.get(r.exec) ?? r.exec),
      intern(r.source),
      intern(r.model),
      intern(derivative),
      intern(r.status || NOT_STATED),
      intern(r.financeType || NOT_STATED),
      intern(termLabel(r.termMonths)),
      intern(mileageLabel(r.annualMileage)),
      outcome,
      intern(r.customer),
    ];
  });
  return { strings, rows: out };
}

export function decodeReport(p: ReportPayload): ReportRow[] {
  const s = p.strings;
  return p.rows.map((r) => ({
    day: dayFromNumber(r[0]),
    exec: s[r[1]],
    source: s[r[2]],
    model: s[r[3]],
    derivative: s[r[4]],
    status: s[r[5]],
    financeType: s[r[6]],
    term: s[r[7]],
    mileage: s[r[8]],
    outcome: OUTCOME_CODES[r[9]] ?? "other",
    customer: s[r[10]] ?? "",
  }));
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export interface Stats {
  enquiries: number; orders: number; live: number; lost: number;
  /** The inbound (MotorComplete) share of enquiries and orders; broker / prospect is the rest. */
  inboundEnquiries: number; inboundOrders: number;
}

export function statsOf(rows: readonly ReportRow[]): Stats {
  const s: Stats = { enquiries: 0, orders: 0, live: 0, lost: 0, inboundEnquiries: 0, inboundOrders: 0 };
  for (const r of rows) {
    const inbound = isInboundSource(r.source);
    s.enquiries++;
    if (inbound) s.inboundEnquiries++;
    if (r.outcome === "order") { s.orders++; if (inbound) s.inboundOrders++; }
    else if (r.outcome === "live") s.live++;
    else if (r.outcome === "lost") s.lost++;
  }
  return s;
}

/** Orders ÷ enquiries × 100; null when there were no enquiries (shown "—"). */
export function conversionPct(s: Stats): number | null {
  return s.enquiries > 0 ? (s.orders / s.enquiries) * 100 : null;
}

/** Inbound conversion: MotorComplete orders ÷ MotorComplete enquiries. */
export function inboundPct(s: Stats): number | null {
  return s.inboundEnquiries > 0 ? (s.inboundOrders / s.inboundEnquiries) * 100 : null;
}

/** Broker / prospect conversion: the rest of the orders ÷ the rest of the enquiries. */
export function brokerPct(s: Stats): number | null {
  const e = s.enquiries - s.inboundEnquiries;
  return e > 0 ? ((s.orders - s.inboundOrders) / e) * 100 : null;
}

// ─── Breakdowns ────────────────────────────────────────────────────────────

export type DimKey = "source" | "exec" | "model" | "derivative" | "financeType" | "term" | "mileage" | "status";

export const DIMENSIONS: { key: DimKey; label: string }[] = [
  { key: "source", label: "Source" },
  { key: "exec", label: "Exec" },
  { key: "model", label: "Model" },
  { key: "derivative", label: "Derivative" },
  { key: "financeType", label: "Finance type" },
  { key: "term", label: "Contract length" },
  { key: "mileage", label: "Annual mileage" },
  { key: "status", label: "Status" },
];

export const dimLabel = (k: DimKey) => DIMENSIONS.find((d) => d.key === k)?.label ?? k;

export type SortKey = "enquiries" | "orders" | "conversion" | "inbound" | "broker" | "live" | "lost" | "label";

// Label order for the "A–Z" sort: sources, segments and profit bands in
// their fixed order, numbers numerically ("6,000 miles" before "10,000
// miles"), "Not stated" and model-only buckets last.
const FIXED_ORDER: Record<string, readonly string[]> = { source: SOURCES, segment: SEGMENTS, profitBand: PROFIT_BANDS };

function compareLabels(dim: string, a: string, b: string): number {
  if (a === b) return 0;
  const fixed = FIXED_ORDER[dim];
  if (fixed) return (fixed.indexOf(a) + 1 || 99) - (fixed.indexOf(b) + 1 || 99);
  const last = (x: string) => x === NOT_STATED || x.endsWith("(model only)") || x === "Not specified";
  if (last(a) !== last(b)) return last(a) ? 1 : -1;
  return a.localeCompare(b, "en-GB", { numeric: true, sensitivity: "base" });
}

export interface Nested<S, R = unknown> {
  key: string;
  label: string;
  stats: S;
  /** Share of the rows in the level above (or the whole selection). */
  share: number;
  /** The rows behind the figures, for drilling down to individual customers. */
  rows: R[];
  children: Nested<S, R>[];
}

/**
 * Group rows by one or more dimensions — source then model, segment then
 * funder — each level carrying its share of the level above. `value`
 * returns the number to sort on (largest first), or null to sort by label.
 */
function nest<R, S>(
  rows: readonly R[],
  dims: string[],
  keyOf: (r: R, dim: string) => string,
  statsOf: (rs: readonly R[]) => S,
  value: ((s: S) => number) | null,
  tiebreak: (s: S) => number,
  parentTotal?: number,
): Nested<S, R>[] {
  if (dims.length === 0) return [];
  const [dim, ...rest] = dims;
  const total = parentTotal ?? rows.length;
  const buckets = new Map<string, R[]>();
  for (const r of rows) {
    const k = keyOf(r, dim);
    const b = buckets.get(k);
    if (b) b.push(r); else buckets.set(k, [r]);
  }
  const groups = [...buckets].map(([key, rs]) => ({
    key,
    label: key,
    stats: statsOf(rs),
    share: total > 0 ? (rs.length / total) * 100 : 0,
    rows: rs,
    children: nest(rs, rest, keyOf, statsOf, value, tiebreak, rs.length),
  }));
  return groups.sort((x, y) =>
    value == null
      ? compareLabels(dim, x.label, y.label)
      : value(y.stats) - value(x.stats) || tiebreak(y.stats) - tiebreak(x.stats) || compareLabels(dim, x.label, y.label),
  );
}

export type Group = Nested<Stats, ReportRow>;

function sortValue(s: Stats, sort: SortKey): number {
  if (sort === "conversion") return conversionPct(s) ?? -1;
  if (sort === "inbound") return inboundPct(s) ?? -1;
  if (sort === "broker") return brokerPct(s) ?? -1;
  return sort === "label" ? 0 : s[sort];
}

// Equal rates rank by the enquiries behind them, so 3 of 3 sits above 1 of 1.
function sortBase(s: Stats, sort: SortKey): number {
  if (sort === "inbound") return s.inboundEnquiries;
  if (sort === "broker") return s.enquiries - s.inboundEnquiries;
  return s.enquiries;
}

/** Enquiries grouped by one or two dimensions — e.g. source, then model. */
export function groupRows(rows: readonly ReportRow[], dims: DimKey[], sort: SortKey = "enquiries"): Group[] {
  return nest(rows, dims, (r, d) => r[d as DimKey], statsOf, sort === "label" ? null : (s) => sortValue(s, sort), (s) => sortBase(s, sort));
}

/**
 * The execs with the best inbound conversion — the top of the Enquiries
 * tab's By exec table, for Summary and the PDF (user, 2026-10-20). Only
 * execs with an inbound order: a 0% is not a top performer.
 */
export function topInboundExecs(rows: readonly ReportRow[], n = 3): Group[] {
  return groupRows(rows, ["exec"], "inbound").filter((g) => g.stats.inboundOrders > 0).slice(0, n);
}

// ─── Orders ────────────────────────────────────────────────────────────────

export interface OrderStoredRow {
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
  delivery: string;
  profit: number | null;
}

export interface OrderRow {
  day: string;
  exec: string;
  customer: string;
  model: string;
  derivative: string;
  segment: string;
  product: string;
  term: string;
  funder: string;
  delivery: string;
  profitBand: string;
  profit: number | null;
}

export interface OrdersPayload {
  strings: string[];
  /** [dayNumber, exec, customer, model, derivative, segment, product, term, funder, delivery, profit|null] */
  rows: (number | null)[][];
}

export function encodeOrders(rows: OrderStoredRow[], execNames: Map<string, string> = new Map()): OrdersPayload {
  const labelOf = derivativeLabeller(rows);
  const { strings, intern } = interner();
  return {
    strings,
    rows: rows.map((r) => [
      dayNumber(r.orderDay),
      intern(execNames.get(r.exec) ?? r.exec),
      intern(r.customer),
      intern(r.model),
      intern(labelOf(r)),
      intern(r.segment),
      intern(r.product || NOT_STATED),
      intern(termLabel(r.termMonths)),
      intern(r.funder || NOT_STATED),
      intern(r.delivery || NOT_STATED),
      r.profit,
    ]),
  };
}

export function decodeOrders(p: OrdersPayload): OrderRow[] {
  const s = p.strings;
  return p.rows.map((r) => {
    const profit = r[10] ?? null;
    return {
      day: dayFromNumber(r[0] as number),
      exec: s[r[1] as number],
      customer: s[r[2] as number],
      model: s[r[3] as number],
      derivative: s[r[4] as number],
      segment: s[r[5] as number],
      product: s[r[6] as number],
      term: s[r[7] as number],
      funder: s[r[8] as number],
      delivery: s[r[9] as number],
      profitBand: profitBand(profit),
      profit,
    };
  });
}

/** Units, total profit over the units that have a figure, how many have one, and how many lost money. */
export interface OrderStats { orders: number; profit: number; priced: number; loss: number }

export function orderStatsOf(rows: readonly OrderRow[]): OrderStats {
  const s: OrderStats = { orders: 0, profit: 0, priced: 0, loss: 0 };
  for (const r of rows) {
    s.orders++;
    if (r.profit == null) continue;
    s.priced++;
    s.profit += r.profit;
    if (r.profit < 0) s.loss++;
  }
  return s;
}

/** Average profit per unit, over the units that carry a profit figure. */
export function avgProfit(s: OrderStats): number | null {
  return s.priced > 0 ? s.profit / s.priced : null;
}

export type OrderDimKey = "segment" | "exec" | "model" | "derivative" | "funder" | "product" | "term" | "delivery" | "profitBand";

export const ORDER_DIMENSIONS: { key: OrderDimKey; label: string }[] = [
  { key: "segment", label: "Segment" },
  { key: "exec", label: "Exec" },
  { key: "model", label: "Model" },
  { key: "derivative", label: "Derivative" },
  { key: "funder", label: "Funder" },
  { key: "product", label: "Finance product" },
  { key: "term", label: "Term" },
  { key: "delivery", label: "Delivery" },
  { key: "profitBand", label: "Profit band" },
];

export const orderDimLabel = (k: OrderDimKey) => ORDER_DIMENSIONS.find((d) => d.key === k)?.label ?? k;

export type OrderSortKey = "orders" | "profit" | "avg" | "loss" | "label";

export type OrderGroup = Nested<OrderStats, OrderRow>;

function orderSortValue(s: OrderStats, sort: OrderSortKey): number {
  if (sort === "avg") return avgProfit(s) ?? -Infinity;
  return sort === "label" ? 0 : s[sort];
}

/** Orders grouped by one or two dimensions — e.g. segment, then model. */
export function groupOrders(rows: readonly OrderRow[], dims: OrderDimKey[], sort: OrderSortKey = "orders"): OrderGroup[] {
  return nest(rows, dims, (r, d) => r[d as OrderDimKey] as string, orderStatsOf, sort === "label" ? null : (s) => orderSortValue(s, sort), (s) => s.orders);
}

// ─── Periods ───────────────────────────────────────────────────────────────

export type PeriodMode = Granularity | "custom";

export interface Range { startDay: string; endDay: string; label: string }

export function rangeFor(mode: PeriodMode, anchor: string, custom: { from: string; to: string }): Range {
  if (mode === "custom") {
    const [startDay, endDay] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    const p = (d: string) => fromDayKey(d).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
    return { startDay, endDay, label: startDay === endDay ? p(startDay) : `${p(startDay)} – ${p(endDay)}` };
  }
  const p = buildPeriod(mode, anchor);
  return { startDay: p.startDay, endDay: p.endDay, label: p.label };
}

/**
 * The period to compare against: the one before, of the same kind. A period
 * still in progress compares like for like — October to the 10th against
 * 1–10 September, not the whole of September, which would read as a
 * collapse every morning. A custom range compares with the same number of
 * days immediately before it.
 */
export function previousRange(mode: PeriodMode, anchor: string, custom: { from: string; to: string }, today?: string): Range {
  if (mode !== "custom") {
    const cur = rangeFor(mode, anchor, custom);
    const prev = rangeFor(mode, shiftAnchor(mode, anchor, -1), custom);
    if (!today || today < cur.startDay || today >= cur.endDay) return prev;
    const elapsed = dayNumber(today) - dayNumber(cur.startDay);
    const end = dayFromNumber(Math.min(dayNumber(prev.startDay) + elapsed, dayNumber(prev.endDay)));
    return rangeFor("custom", anchor, { from: prev.startDay, to: end });
  }
  const cur = rangeFor(mode, anchor, custom);
  const days = dayNumber(cur.endDay) - dayNumber(cur.startDay) + 1;
  const end = dayNumber(cur.startDay) - 1;
  return rangeFor("custom", anchor, { from: dayFromNumber(end - days + 1), to: dayFromNumber(end) });
}

export function inRange<T extends { day: string }>(rows: readonly T[], r: Range): T[] {
  return rows.filter((x) => x.day >= r.startDay && x.day <= r.endDay);
}

export interface Bucket { key: string; label: string; stats: Stats }

/**
 * Enquiries over the period: one bar per day for anything up to two
 * months, one per week (Monday start) beyond that. A single day has no
 * trend to show and returns nothing.
 */
export function timeBuckets(rows: readonly ReportRow[], r: Range): Bucket[] {
  const first = dayNumber(r.startDay), last = dayNumber(r.endDay);
  const span = last - first + 1;
  if (span <= 1) return [];
  const weekly = span > 62;
  const keyOf = (n: number) => {
    if (!weekly) return n;
    const dow = (new Date(n * MS_PER_DAY).getUTCDay() + 6) % 7; // Monday = 0
    return n - dow;
  };
  const buckets = new Map<number, ReportRow[]>();
  for (let n = keyOf(first); n <= last; n += weekly ? 7 : 1) buckets.set(n, []);
  for (const x of rows) buckets.get(keyOf(dayNumber(x.day)))?.push(x);
  return [...buckets].map(([n, rs]) => {
    const d = new Date(n * MS_PER_DAY);
    const label = d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
    return { key: dayFromNumber(n), label: weekly ? `w/c ${label}` : label, stats: statsOf(rs) };
  });
}

// ─── Deliveries vs budget ──────────────────────────────────────────────────
//
// Budgets are monthly units for Car and CV (commercial); combined is their
// sum. Deliveries count in the month of their delivery date. Two separate
// questions, in this order (user, 2026-10-12):
//   1. Going vs budget — everything Dealbook says is going in the period
//      (delivered + arrived + due) against the budget. The overall number.
//   2. Delivered of going — how much of what's going has been handed over.

/** Delivery budgets by month: { "2026-10": { car: 106, cv: 40 } }. */
export type Budgets = Record<string, { car: number; cv: number }>;

export type Department = "car" | "cv";

/** Car is ICE and BEV cars; CV is the vans. */
export const departmentOf = (segment: string): Department => (segment === "Van" ? "cv" : "car");

/**
 * The whole months a period covers, or null when it doesn't line up with
 * months (a day, a week, a custom range starting mid-month) — budgets are
 * monthly, and pro-rating them would invent a target nobody set.
 */
export function budgetMonths(r: Range): string[] | null {
  const start = fromDayKey(r.startDay);
  const end = fromDayKey(r.endDay);
  const lastOfEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  if (start.getUTCDate() !== 1 || end.getUTCDate() !== lastOfEndMonth) return null;
  const out: string[] = [];
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return out;
}

export interface BudgetLine {
  /** Sum of the budgets set for the months; null when none are set. */
  budget: number | null;
  /** Months in the period with no budget set (shown, never treated as 0). */
  missing: string[];
  /** Everything in the period's report: delivered + arrived + due. */
  going: number;
  delivered: number;
  arrived: number;
  due: number;
}

export function budgetLines(rows: readonly OrderRow[], budgets: Budgets, months: string[]): Record<Department | "combined", BudgetLine> {
  const set = months.filter((m) => budgets[m]);
  const missing = months.filter((m) => !budgets[m]);
  const sum = (d: Department) => (set.length ? set.reduce((n, m) => n + budgets[m][d], 0) : null);
  const line = (budget: number | null, keep: (r: OrderRow) => boolean): BudgetLine => {
    const rs = rows.filter(keep);
    return {
      budget,
      missing,
      going: rs.length,
      delivered: rs.filter((r) => r.delivery === "Delivered").length,
      arrived: rs.filter((r) => r.delivery === "Arrived").length,
      due: rs.filter((r) => r.delivery !== "Delivered" && r.delivery !== "Arrived").length,
    };
  };
  const car = sum("car"), cv = sum("cv");
  return {
    car: line(car, (r) => departmentOf(r.segment) === "car"),
    cv: line(cv, (r) => departmentOf(r.segment) === "cv"),
    combined: line(car == null || cv == null ? null : car + cv, () => true),
  };
}

/**
 * How far through a period "today" is, by calendar day — the pace the
 * delivered share is benchmarked against (user, 2026-10-12). Today counts as
 * a day in: on 12 October the month is 12 of 31 days through. A finished
 * period is 100%, one not started 0%.
 */
export function periodProgress(r: Range, today: string): { day: number; days: number; pct: number } {
  const first = dayNumber(r.startDay), last = dayNumber(r.endDay), now = dayNumber(today);
  const days = last - first + 1;
  const day = Math.max(0, Math.min(days, now - first + 1));
  return { day, days, pct: days > 0 ? (day / days) * 100 : 0 };
}

// ─── Cancellations ─────────────────────────────────────────────────────────
//
// Built on the server (ten-at-ten-store.ts), where each cancellation is
// matched against the Dealbook; small enough to ship as plain objects.

export interface CancellationView {
  id: string;
  /** The day it was cancelled — what the period slices on. */
  day: string;
  orderDay: string;
  /** Full name, as the Cancelled Orders export gives it. */
  exec: string;
  customer: string;
  vehicle: string;
  model: string;
  segment: string;
  registration: string | null;
  /** What it counts as: a manager's call where there is one, else the matching's. */
  status: "rewrite" | "proper";
  /** The matching's verdict. */
  auto: "rewrite" | "proper";
  /** A manager has changed the verdict. */
  overridden: boolean;
  /** The order that replaced it, when one was found. */
  reorder: { orderDay: string; customer: string; vehicle: string; registration: string | null; exec: string; on: "registration" | "customer" } | null;
  /** Profit on the cancelled order, when we hold that order. */
  orderProfit: number | null;
  note: string;
  noteBy: string | null;
  noteAt: string | null;
}

/** A Re-Write's re-order, moved from the day it was keyed to the day of the order it replaced. */
export interface CreditedReOrder { reorderDay: string; creditDay: string }

/**
 * Re-Writes across the period's edge, for the note on Orders: keyed again
 * in the period but credited to an earlier one (`out`), and keyed again
 * later but credited here (`in`).
 */
export function rewritesAcross(moved: readonly CreditedReOrder[], range: { startDay: string; endDay: string }): { out: number; in: number } {
  const inside = (d: string) => d >= range.startDay && d <= range.endDay;
  return {
    out: moved.filter((m) => inside(m.reorderDay) && !inside(m.creditDay)).length,
    in: moved.filter((m) => inside(m.creditDay) && !inside(m.reorderDay)).length,
  };
}

/** Calendar days from order to cancellation. */
export function daysToCancel(c: Pick<CancellationView, "orderDay" | "day">): number {
  return dayNumber(c.day) - dayNumber(c.orderDay);
}
