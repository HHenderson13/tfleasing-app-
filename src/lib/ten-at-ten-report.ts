// 10 at 10 — report maths. Client-safe (no node imports): the page ships
// every stored enquiry once and the browser slices it by period, filters
// and groups it, so changing the period or the breakdown is instant.
//
// Conversion is always orders ÷ enquiries, over enquiries RAISED in the
// period: "of the enquiries that came in, how many have ordered so far".

import { buildPeriod, fromDayKey, shiftAnchor, toDayKey, type Granularity } from "./period";

export const SOURCES = ["TF Lead", "Leasing.com", "LeaseLoco", "CarWow", "Broker / Prospect"] as const;
export type SourceName = (typeof SOURCES)[number];
export type Outcome = "order" | "live" | "lost" | "other";

export const NOT_STATED = "Not stated";

// ─── Wire format ───────────────────────────────────────────────────────────
//
// Strings are interned into one table and each row is a tuple of indexes,
// which keeps a year of enquiries to a few hundred KB of page payload.

const OUTCOME_CODES: Outcome[] = ["other", "order", "live", "lost"];

export interface ReportPayload {
  strings: string[];
  /** [dayNumber, exec, source, model, derivative, status, finance, term, mileage, outcome] */
  rows: number[][];
}

export interface StoredRow {
  enquiryDay: string;
  exec: string;
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
export function encodeReport(rows: StoredRow[], execNames: Map<string, string> = new Map()): ReportPayload {
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

  const strings: string[] = [];
  const index = new Map<string, number>();
  const intern = (s: string) => {
    let i = index.get(s);
    if (i === undefined) { i = strings.length; strings.push(s); index.set(s, i); }
    return i;
  };

  const out: number[][] = rows.map((r) => {
    const derivative = r.derivativeKey
      ? labelOf.get(r.derivativeKey) ?? r.derivative ?? r.model
      : `${r.model} (model only)`;
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
  }));
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export interface Stats { enquiries: number; orders: number; live: number; lost: number }

export function statsOf(rows: readonly ReportRow[]): Stats {
  const s: Stats = { enquiries: 0, orders: 0, live: 0, lost: 0 };
  for (const r of rows) {
    s.enquiries++;
    if (r.outcome === "order") s.orders++;
    else if (r.outcome === "live") s.live++;
    else if (r.outcome === "lost") s.lost++;
  }
  return s;
}

/** Orders ÷ enquiries × 100; null when there were no enquiries (shown "—"). */
export function conversionPct(s: Stats): number | null {
  return s.enquiries > 0 ? (s.orders / s.enquiries) * 100 : null;
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

export type SortKey = "enquiries" | "orders" | "conversion" | "live" | "lost" | "label";

export interface Group {
  key: string;
  label: string;
  stats: Stats;
  /** Share of the enquiries in the level above (or the whole selection). */
  share: number;
  children: Group[];
}

// Label order for the "A–Z" sort: sources in their fixed order, numbers
// numerically ("6,000 miles" before "10,000 miles"), "Not stated" last.
function compareLabels(dim: DimKey, a: string, b: string): number {
  if (a === b) return 0;
  if (a === NOT_STATED || a.endsWith("(model only)")) return 1;
  if (b === NOT_STATED || b.endsWith("(model only)")) return -1;
  if (dim === "source") {
    return SOURCES.indexOf(a as SourceName) - SOURCES.indexOf(b as SourceName);
  }
  return a.localeCompare(b, "en-GB", { numeric: true, sensitivity: "base" });
}

function sortValue(g: Group, sort: SortKey): number {
  if (sort === "conversion") return conversionPct(g.stats) ?? -1;
  if (sort === "label") return 0;
  return g.stats[sort];
}

/**
 * Group rows by one or two dimensions — e.g. source, then model within
 * each source. Each level carries its share of the level above.
 */
export function groupRows(rows: readonly ReportRow[], dims: DimKey[], sort: SortKey = "enquiries", parentTotal?: number): Group[] {
  if (dims.length === 0) return [];
  const [dim, ...rest] = dims;
  const total = parentTotal ?? rows.length;
  const buckets = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = r[dim];
    const b = buckets.get(k);
    if (b) b.push(r); else buckets.set(k, [r]);
  }
  const groups: Group[] = [...buckets].map(([key, rs]) => ({
    key,
    label: key,
    stats: statsOf(rs),
    share: total > 0 ? (rs.length / total) * 100 : 0,
    children: groupRows(rs, rest, sort, rs.length),
  }));
  return groups.sort((a, b) =>
    sort === "label"
      ? compareLabels(dim, a.label, b.label)
      : sortValue(b, sort) - sortValue(a, sort) || b.stats.enquiries - a.stats.enquiries || compareLabels(dim, a.label, b.label),
  );
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
