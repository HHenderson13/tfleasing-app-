import "server-only";

import { db } from "@/db";
import {
  salesExecs,
  salesLeaderboardMonthly,
  salesLeaderboardParticipants,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  applyPoints,
  currentYearMonth,
  type ExecMonthStats,
} from "./sales-leaderboard";

// Months from January of the same year up to (and including) yearMonth, in
// chronological order. Used to roll the monthly rows into YTD.
function ytdMonths(yearMonth: string): string[] {
  const [yStr, mStr] = yearMonth.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const out: string[] = [];
  for (let i = 1; i <= m; i++) out.push(`${y}-${String(i).padStart(2, "0")}`);
  return out;
}

interface ParticipantRow {
  salesExecId: string;
  name: string;
  photoUrl: string | null;
}

async function loadParticipants(): Promise<ParticipantRow[]> {
  const rows = await db
    .select({
      id: salesExecs.id,
      name: salesExecs.name,
      active: salesLeaderboardParticipants.active,
      photoUrl: salesLeaderboardParticipants.photoUrl,
    })
    .from(salesExecs)
    .innerJoin(
      salesLeaderboardParticipants,
      eq(salesLeaderboardParticipants.salesExecId, salesExecs.id),
    )
    .orderBy(salesExecs.name);
  return rows
    .filter((r) => r.active)
    .map((r) => ({ salesExecId: r.id, name: r.name, photoUrl: r.photoUrl ?? null }));
}

function emptyStats(p: ParticipantRow): ExecMonthStats {
  return {
    salesExecId: p.salesExecId,
    name: p.name,
    photoUrl: p.photoUrl,
    orderCount: 0,
    deliveryCount: 0,
    insuranceCount: 0,
    enquiryCount: 0,
    salesCount: 0,
    conversionPct: 0,
    latestVehicle: null,
    metricPoints: { orders: 0, deliveries: 0, insurance: 0, conversion: 0 },
    totalPoints: 0,
    metricRanks: { orders: null, deliveries: null, insurance: null, conversion: null },
  };
}

export interface LeaderboardSnapshot {
  yearMonth: string;
  view: "month" | "ytd";
  rows: ExecMonthStats[];
  // For the month view we surface the most recent vehicle from order_list as
  // the "interesting fact" per exec; for YTD we keep the latest non-empty
  // seen across the year so the scorecard still has flavour.
  hasAnyData: boolean;
}

// Load a single month, applying scoring across the active participants.
// Missing participants get a zeroed row (they still show on the leaderboard
// — just with no points until they appear in a report).
export async function loadMonthSnapshot(yearMonth: string): Promise<LeaderboardSnapshot> {
  const participants = await loadParticipants();
  const monthly = await db
    .select()
    .from(salesLeaderboardMonthly)
    .where(eq(salesLeaderboardMonthly.yearMonth, yearMonth));
  const byExec = new Map(monthly.map((m) => [m.salesExecId, m]));
  const rows = participants.map((p) => {
    const base = emptyStats(p);
    const m = byExec.get(p.salesExecId);
    if (!m) return base;
    base.orderCount = m.orderCount ?? 0;
    base.deliveryCount = m.deliveryCount ?? 0;
    base.insuranceCount = m.insuranceCount ?? 0;
    base.enquiryCount = m.enquiryCount ?? 0;
    base.salesCount = m.salesCount ?? 0;
    base.conversionPct = base.enquiryCount > 0 ? (base.salesCount / base.enquiryCount) * 100 : 0;
    base.latestVehicle = m.latestVehicle ?? null;
    return base;
  });
  applyPoints(rows);
  rows.sort((a, b) => b.totalPoints - a.totalPoints || b.orderCount - a.orderCount);
  return {
    yearMonth,
    view: "month",
    rows,
    hasAnyData: monthly.length > 0,
  };
}

// YTD across the calendar year of `upToYearMonth`. We sum the per-month
// counts (orders, deliveries, insurance, enquiries, sales) and recompute
// conversion from the YTD enquiry/sales totals — points are awarded against
// the YTD aggregates.
export async function loadYtdSnapshot(upToYearMonth: string): Promise<LeaderboardSnapshot> {
  const participants = await loadParticipants();
  const months = ytdMonths(upToYearMonth);
  if (months.length === 0) {
    return { yearMonth: upToYearMonth, view: "ytd", rows: [], hasAnyData: false };
  }
  // One query for all in-scope months, then aggregate in JS — cheaper than
  // GROUP BY for the small data volume (≤12 months × ~7 execs).
  const filtered = await db
    .select()
    .from(salesLeaderboardMonthly)
    .where(inArray(salesLeaderboardMonthly.yearMonth, months));

  const agg = new Map<string, {
    orders: number; deliveries: number; insurance: number; enquiries: number; sales: number;
    latestVehicle: string | null;
    latestVehicleMonth: string | null;
  }>();

  for (const m of filtered) {
    const cur = agg.get(m.salesExecId) ?? {
      orders: 0, deliveries: 0, insurance: 0, enquiries: 0, sales: 0,
      latestVehicle: null as string | null, latestVehicleMonth: null as string | null,
    };
    cur.orders     += m.orderCount     ?? 0;
    cur.deliveries += m.deliveryCount  ?? 0;
    cur.insurance  += m.insuranceCount ?? 0;
    cur.enquiries  += m.enquiryCount   ?? 0;
    cur.sales      += m.salesCount     ?? 0;
    if (m.latestVehicle && (cur.latestVehicleMonth === null || m.yearMonth > cur.latestVehicleMonth)) {
      cur.latestVehicle = m.latestVehicle;
      cur.latestVehicleMonth = m.yearMonth;
    }
    agg.set(m.salesExecId, cur);
  }

  const rows = participants.map((p) => {
    const base = emptyStats(p);
    const a = agg.get(p.salesExecId);
    if (!a) return base;
    base.orderCount     = a.orders;
    base.deliveryCount  = a.deliveries;
    base.insuranceCount = a.insurance;
    base.enquiryCount   = a.enquiries;
    base.salesCount     = a.sales;
    base.conversionPct  = a.enquiries > 0 ? (a.sales / a.enquiries) * 100 : 0;
    base.latestVehicle  = a.latestVehicle;
    return base;
  });
  applyPoints(rows);
  rows.sort((a, b) => b.totalPoints - a.totalPoints || b.orderCount - a.orderCount);
  return {
    yearMonth: upToYearMonth,
    view: "ytd",
    rows,
    hasAnyData: filtered.length > 0,
  };
}

// ─── Department dashboard ──────────────────────────────────────────────────
//
// Department-wide metrics + coaching focus signals. Loaded by the admin's
// Department tab. We want the admin to be able to spot the team's overall
// trajectory and which exec/metric pair to coach this month.

export interface DeptKpi {
  label: string;
  current: number;
  previous: number;
  // Whole numbers for counts; conversion is a percentage.
  format: "int" | "pct";
}

export interface CoachingFocus {
  metric: "orders" | "deliveries" | "insurance" | "conversion" | "attach";
  metricLabel: string;
  // The participant with the lowest score on this metric this month. null
  // when there's nothing meaningful to highlight (e.g. no enquiries logged).
  bottom: { salesExecId: string; name: string; photoUrl: string | null; value: string } | null;
  // For comparison the top score, so the admin can see the gap.
  top:    { salesExecId: string; name: string; photoUrl: string | null; value: string } | null;
}

export interface MonthlyTrendCell {
  yearMonth: string;
  orderCount: number;
  deliveryCount: number;
  insuranceCount: number;
  enquiryCount: number;
  salesCount: number;
}

export interface DeptDashboard {
  yearMonth: string;
  kpis: DeptKpi[];
  coachingFocus: CoachingFocus[];
  // Last 6 months of department totals — used for sparkline-style trend row.
  trend: MonthlyTrendCell[];
}

function sumDept(rows: ExecMonthStats[]): { orders: number; deliveries: number; insurance: number; enquiries: number; sales: number } {
  return rows.reduce(
    (acc, r) => ({
      orders:     acc.orders     + r.orderCount,
      deliveries: acc.deliveries + r.deliveryCount,
      insurance:  acc.insurance  + r.insuranceCount,
      enquiries:  acc.enquiries  + r.enquiryCount,
      sales:      acc.sales      + r.salesCount,
    }),
    { orders: 0, deliveries: 0, insurance: 0, enquiries: 0, sales: 0 },
  );
}

function prevYearMonth(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) - 1;
  if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function trailingMonths(yearMonth: string, count: number): string[] {
  const out: string[] = [];
  let cur = yearMonth;
  for (let i = 0; i < count; i++) {
    out.unshift(cur);
    cur = prevYearMonth(cur);
  }
  return out;
}

export async function loadDeptDashboard(yearMonth: string): Promise<DeptDashboard> {
  const [current, previous] = await Promise.all([
    loadMonthSnapshot(yearMonth),
    loadMonthSnapshot(prevYearMonth(yearMonth)),
  ]);

  const curTotals = sumDept(current.rows);
  const prevTotals = sumDept(previous.rows);

  const kpis: DeptKpi[] = [
    { label: "Orders",     current: curTotals.orders,     previous: prevTotals.orders,     format: "int" },
    { label: "Deliveries", current: curTotals.deliveries, previous: prevTotals.deliveries, format: "int" },
    { label: "Insurance products", current: curTotals.insurance, previous: prevTotals.insurance, format: "int" },
    {
      label: "Dept conversion %",
      current:  curTotals.enquiries  > 0 ? (curTotals.sales  / curTotals.enquiries)  * 100 : 0,
      previous: prevTotals.enquiries > 0 ? (prevTotals.sales / prevTotals.enquiries) * 100 : 0,
      format: "pct",
    },
  ];

  // Coaching focus: who's at the bottom of each metric this month, with the
  // top performer for context. We only highlight when there's enough data to
  // be meaningful (e.g. conversion needs enquiries logged).
  function pickPair(
    metric: CoachingFocus["metric"],
    label: string,
    accessor: (s: ExecMonthStats) => number,
    formatter: (s: ExecMonthStats) => string,
    isMeaningful: (s: ExecMonthStats) => boolean,
  ): CoachingFocus {
    const eligible = current.rows.filter(isMeaningful);
    if (eligible.length < 2) return { metric, metricLabel: label, bottom: null, top: null };
    const sorted = [...eligible].sort((a, b) => accessor(a) - accessor(b));
    const bottom = sorted[0];
    const top = sorted[sorted.length - 1];
    return {
      metric,
      metricLabel: label,
      bottom: { salesExecId: bottom.salesExecId, name: bottom.name, photoUrl: bottom.photoUrl, value: formatter(bottom) },
      top:    { salesExecId: top.salesExecId,    name: top.name,    photoUrl: top.photoUrl,    value: formatter(top) },
    };
  }

  const coachingFocus: CoachingFocus[] = [
    pickPair("conversion", "Conversion %",       (s) => s.conversionPct,    (s) => `${s.conversionPct.toFixed(1)}%`, (s) => s.enquiryCount > 0),
    pickPair("attach",     "Insurance attach",   (s) => s.deliveryCount > 0 ? s.insuranceCount / s.deliveryCount : 0,
                                                 (s) => s.deliveryCount > 0 ? `${(s.insuranceCount / s.deliveryCount).toFixed(2)}/del` : "—",
                                                 (s) => s.deliveryCount > 0),
    pickPair("orders",     "Order Take",         (s) => s.orderCount,       (s) => String(s.orderCount),             () => true),
    pickPair("deliveries", "Deliveries",         (s) => s.deliveryCount,    (s) => String(s.deliveryCount),          () => true),
  ];

  // Trend — last 6 months including this one.
  const months = trailingMonths(yearMonth, 6);
  const trendRows = await db
    .select()
    .from(salesLeaderboardMonthly)
    .where(inArray(salesLeaderboardMonthly.yearMonth, months));
  const participants = await loadParticipants();
  const participantIds = new Set(participants.map((p) => p.salesExecId));
  const trend: MonthlyTrendCell[] = months.map((ym) => {
    const cell: MonthlyTrendCell = { yearMonth: ym, orderCount: 0, deliveryCount: 0, insuranceCount: 0, enquiryCount: 0, salesCount: 0 };
    for (const m of trendRows) {
      if (m.yearMonth !== ym) continue;
      if (!participantIds.has(m.salesExecId)) continue;
      cell.orderCount     += m.orderCount     ?? 0;
      cell.deliveryCount  += m.deliveryCount  ?? 0;
      cell.insuranceCount += m.insuranceCount ?? 0;
      cell.enquiryCount   += m.enquiryCount   ?? 0;
      cell.salesCount     += m.salesCount     ?? 0;
    }
    return cell;
  });

  return { yearMonth, kpis, coachingFocus, trend };
}

// ─── Champion archive ──────────────────────────────────────────────────────
//
// Past N monthly champions for the Hall of Fame strip. We re-use the same
// snapshot loader so scoring/tie rules stay consistent — no separate
// "who was champion" query that could drift from how points are awarded.

export interface ChampionEntry {
  yearMonth: string;
  champion: { salesExecId: string; name: string; photoUrl: string | null; points: number } | null;
}

export async function loadChampionArchive(upToYearMonth: string, count = 6): Promise<ChampionEntry[]> {
  const months = trailingMonths(upToYearMonth, count);
  const out: ChampionEntry[] = [];
  for (const ym of months) {
    const snap = await loadMonthSnapshot(ym);
    // Champion = highest totalPoints with > 0; ties collapse to "shared
    // champion" via first sort order, which is fine for an archive strip.
    const sorted = [...snap.rows].sort((a, b) => b.totalPoints - a.totalPoints);
    const top = sorted[0];
    if (top && top.totalPoints > 0) {
      out.push({
        yearMonth: ym,
        champion: { salesExecId: top.salesExecId, name: top.name, photoUrl: top.photoUrl, points: top.totalPoints },
      });
    } else {
      out.push({ yearMonth: ym, champion: null });
    }
  }
  return out;
}

// Convenience entry point used by /sales-leaderboard. Picks current month
// when no month is supplied and routes to the right loader.
export async function loadLeaderboard(opts: { yearMonth?: string; view: "month" | "ytd" }): Promise<LeaderboardSnapshot> {
  const ym = opts.yearMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(opts.yearMonth)
    ? opts.yearMonth
    : currentYearMonth();
  return opts.view === "ytd" ? loadYtdSnapshot(ym) : loadMonthSnapshot(ym);
}
