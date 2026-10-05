// Pure helpers — parsing + scoring + date helpers. No "server-only" guard so
// the vitest suite can import directly. Nothing here touches the DB.

import * as XLSX from "xlsx";

// ─── Parsers ───────────────────────────────────────────────────────────────
//
// Three Dealerweb-style XLSX reports drive the leaderboard. They share the
// same shape: header row at row 0, sales-exec short code in column B (index
// 1). Differences:
//   • order_list:     count of rows per exec  =  Order Take
//                     latest vehicle text     =  fun fact
//   • delivered_list: count of rows per exec  =  Deliveries
//                     non-zero values in W:AC =  Insurance Products
//   • enquiry_log:    count of rows per exec  =  Enquiries
//                     col Q a sale status     =  Sales (for Conversion %)
//
// Each parser returns a Map<reportCode, counts>. The admin action maps the
// codes onto sales_execs IDs using sales_leaderboard_name_map.

const COL_SE = 1;             // column B in every report
const COL_VEHICLE = 5;        // column F (order_list)
const COL_ENQ_STATUS = 16;    // column Q (enquiry_log)
const INSURANCE_FIRST = 22;   // W
const INSURANCE_LAST = 28;    // AC

// Enquiry statuses that mean the enquiry became a sale. Dealerweb walks a
// converted enquiry Ordered → Handover Arranged → Delivered, so all three
// count. Handover Arranged was missing, which dropped real orders out of
// Conversion % — an exec with an order on the board read 0%.
const SALE_STATUSES = new Set(["ordered", "handover arranged", "delivered"]);

export function isSaleStatus(status: string): boolean {
  return SALE_STATUSES.has(status.trim().replace(/\s+/g, " ").toLowerCase());
}

export interface OrderListParseRow { reportCode: string; orderCount: number; latestVehicle: string | null }
export interface DeliveredParseRow { reportCode: string; deliveryCount: number; insuranceCount: number }
export interface EnquiryParseRow {
  reportCode: string;
  enquiryCount: number;
  salesCount: number;
  // Raw column Q tally. Stored with the upload so a change to SALE_STATUSES
  // reaches past months on Re-process instead of needing every enquiry log
  // re-uploaded. Absent on uploads parsed before it existed.
  statusCounts?: Record<string, number>;
}

// Sales for an enquiry row under the CURRENT status rules. Falls back to
// the salesCount frozen at parse time for uploads without a status tally.
export function enquirySales(row: EnquiryParseRow): number {
  if (!row.statusCounts) return row.salesCount;
  let n = 0;
  for (const [status, count] of Object.entries(row.statusCounts)) {
    if (isSaleStatus(status)) n += count;
  }
  return n;
}

export interface ParseSummary { rowsTotal: number; rowsAttributed: number }

function loadSheet(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}

// Dealerweb exec codes are letters ("MiHo"). The order and delivered lists
// end in a totals block whose column B holds numbers (0, 1, 42), which
// would otherwise surface as unmapped "execs" on every upload.
function execCode(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s.length === 0 || /^[\d.,\s-]+$/.test(s)) return null;
  return s;
}

export function parseOrderList(buffer: ArrayBuffer): { rows: OrderListParseRow[]; summary: ParseSummary } {
  const aoa = loadSheet(buffer);
  const counts = new Map<string, OrderListParseRow>();
  let rowsAttributed = 0;
  // Skip header row; data starts at row 1.
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const code = execCode(row[COL_SE]);
    if (!code) continue;
    const vehicle = row[COL_VEHICLE] != null ? String(row[COL_VEHICLE]).trim() : null;
    const cur = counts.get(code) ?? { reportCode: code, orderCount: 0, latestVehicle: null };
    cur.orderCount++;
    // Keep the most recent vehicle we see (rows tend to be most-recent-first
    // in Dealerweb exports but we keep the latest non-empty regardless).
    if (vehicle && vehicle.length > 0) cur.latestVehicle = vehicle;
    counts.set(code, cur);
    rowsAttributed++;
  }
  return {
    rows: Array.from(counts.values()),
    summary: { rowsTotal: Math.max(0, aoa.length - 1), rowsAttributed },
  };
}

export function parseDeliveredList(buffer: ArrayBuffer): { rows: DeliveredParseRow[]; summary: ParseSummary } {
  const aoa = loadSheet(buffer);
  const counts = new Map<string, DeliveredParseRow>();
  let rowsAttributed = 0;
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const code = execCode(row[COL_SE]);
    if (!code) continue;
    let nz = 0;
    for (let c = INSURANCE_FIRST; c <= INSURANCE_LAST; c++) {
      const v = row[c];
      const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
      if (Number.isFinite(n) && n !== 0) nz++;
    }
    const cur = counts.get(code) ?? { reportCode: code, deliveryCount: 0, insuranceCount: 0 };
    cur.deliveryCount++;
    cur.insuranceCount += nz;
    counts.set(code, cur);
    rowsAttributed++;
  }
  return {
    rows: Array.from(counts.values()),
    summary: { rowsTotal: Math.max(0, aoa.length - 1), rowsAttributed },
  };
}

export function parseEnquiryLog(buffer: ArrayBuffer): { rows: EnquiryParseRow[]; summary: ParseSummary } {
  const aoa = loadSheet(buffer);
  const counts = new Map<string, EnquiryParseRow>();
  let rowsAttributed = 0;
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const code = execCode(row[COL_SE]);
    if (!code) continue;
    const status = row[COL_ENQ_STATUS] != null ? String(row[COL_ENQ_STATUS]).trim() : "";
    const cur = counts.get(code) ?? { reportCode: code, enquiryCount: 0, salesCount: 0, statusCounts: {} };
    cur.enquiryCount++;
    if (isSaleStatus(status)) cur.salesCount++;
    const tally = cur.statusCounts!;
    tally[status] = (tally[status] ?? 0) + 1;
    counts.set(code, cur);
    rowsAttributed++;
  }
  return {
    rows: Array.from(counts.values()),
    summary: { rowsTotal: Math.max(0, aoa.length - 1), rowsAttributed },
  };
}

// ─── Attribution ───────────────────────────────────────────────────────────
//
// Fold parsed report rows onto sales execs through the name map. Several
// report codes can map to one exec, so counts are SUMMED per exec — setting
// them let whichever code came last overwrite the others. Every participant
// gets a row, zeroed if the report never mentions them, so a re-upload
// resets a count instead of leaving the previous one stuck.

export type LeaderboardReportType = "orders" | "delivered" | "enquiry";
export type ParsedReportRow = OrderListParseRow | DeliveredParseRow | EnquiryParseRow;

export interface AttributedCounts {
  orderCount: number;
  latestVehicle: string | null;
  deliveryCount: number;
  insuranceCount: number;
  enquiryCount: number;
  salesCount: number;
}

export interface Attribution {
  byExec: Map<string, AttributedCounts>;
  matched: number;
  unmapped: { reportCode: string; count: number }[];
}

export function attributeReportRows(
  reportType: LeaderboardReportType,
  rows: ParsedReportRow[],
  codeToExec: Map<string, string>,
  participantIds: Set<string>,
): Attribution {
  const byExec = new Map<string, AttributedCounts>();
  for (const id of participantIds) {
    byExec.set(id, { orderCount: 0, latestVehicle: null, deliveryCount: 0, insuranceCount: 0, enquiryCount: 0, salesCount: 0 });
  }
  const unmappedCounts = new Map<string, number>();
  let matched = 0;

  for (const r of rows) {
    const execId = codeToExec.get(r.reportCode);
    if (!execId) {
      unmappedCounts.set(r.reportCode, (unmappedCounts.get(r.reportCode) ?? 0) + 1);
      continue;
    }
    const t = byExec.get(execId);
    if (!t) continue; // mapped, but not a participant
    if (reportType === "orders") {
      const o = r as OrderListParseRow;
      t.orderCount += o.orderCount;
      t.latestVehicle = o.latestVehicle ?? t.latestVehicle;
    } else if (reportType === "delivered") {
      const d = r as DeliveredParseRow;
      t.deliveryCount += d.deliveryCount;
      t.insuranceCount += d.insuranceCount;
    } else {
      const e = r as EnquiryParseRow;
      t.enquiryCount += e.enquiryCount;
      t.salesCount += enquirySales(e);
    }
    matched++;
  }

  return {
    byExec,
    matched,
    unmapped: Array.from(unmappedCounts.entries())
      .map(([reportCode, count]) => ({ reportCode, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ─── Scoring ───────────────────────────────────────────────────────────────
//
// Per metric per month: 1st = 3 pts, 2nd = 2 pts, 3rd = 1 pt. Tied execs
// share the same rank (and therefore the same points). Metrics:
//   • orders        — higher is better
//   • deliveries    — higher is better
//   • insurance     — higher is better
//   • conversionPct — higher is better (salesCount ÷ enquiryCount)

export type LeaderboardMetric = "orders" | "deliveries" | "insurance" | "conversion";

export interface ExecMonthStats {
  salesExecId: string;
  name: string;
  photoUrl: string | null;
  orderCount: number;
  deliveryCount: number;
  insuranceCount: number;
  enquiryCount: number;
  salesCount: number;
  conversionPct: number; // salesCount / enquiryCount × 100, 0 when no enquiries
  latestVehicle: string | null;
  metricPoints: Record<LeaderboardMetric, number>;
  totalPoints: number;
  metricRanks: Record<LeaderboardMetric, number | null>; // null when they scored 0 on that metric
}

// Conversion % for display. "—" when there were no enquiries to convert:
// 0 of 0 is not a 0% conversion rate, and showing it as one beside an
// order count is what made the board look broken.
export function formatConversion(s: Pick<ExecMonthStats, "enquiryCount" | "conversionPct">): string {
  return s.enquiryCount > 0 ? `${s.conversionPct.toFixed(1)}%` : "—";
}

function rankBy(rows: ExecMonthStats[], key: (s: ExecMonthStats) => number): Map<string, number> {
  // Standard sports ranking — tied scores share the same rank, and the next
  // rank is the position-based number (so 1, 2, 2, 4 not 1, 2, 2, 3). Only
  // give points to the top 3 positions.
  //
  // Zero is not ranked at all. Ranked, everyone on 0 tied for the first
  // place below the last non-zero score — so with two execs converting,
  // the rest of the team shared 3rd on 0% and each took a point and a 🥉.
  // Same rule overallRanks applies to total points.
  const sorted = rows.filter((r) => key(r) > 0).sort((a, b) => key(b) - key(a));
  const ranks = new Map<string, number>();
  let prevValue: number | null = null;
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const v = key(sorted[i]);
    if (prevValue === null || v !== prevValue) {
      rank = i + 1;
      prevValue = v;
    }
    ranks.set(sorted[i].salesExecId, rank);
  }
  return ranks;
}

function pointsForRank(rank: number): number {
  if (rank === 1) return 3;
  if (rank === 2) return 2;
  if (rank === 3) return 1;
  return 0;
}

// Apply the 3/2/1 scoring to an array of monthly stats. Mutates in place by
// filling metricPoints/totalPoints/metricRanks. A zero earns no rank and no
// points, so a metric with zero across the board awards nothing.
export function applyPoints(rows: ExecMonthStats[]): void {
  const metrics: { key: LeaderboardMetric; pick: (s: ExecMonthStats) => number }[] = [
    { key: "orders",      pick: (s) => s.orderCount },
    { key: "deliveries",  pick: (s) => s.deliveryCount },
    { key: "insurance",   pick: (s) => s.insuranceCount },
    { key: "conversion",  pick: (s) => s.conversionPct },
  ];
  for (const r of rows) {
    r.metricPoints = { orders: 0, deliveries: 0, insurance: 0, conversion: 0 };
    r.metricRanks = { orders: null, deliveries: null, insurance: null, conversion: null };
    r.totalPoints = 0;
  }
  for (const m of metrics) {
    const ranks = rankBy(rows, m.pick);
    for (const r of rows) {
      const rank = ranks.get(r.salesExecId) ?? null;
      r.metricRanks[m.key] = rank;
      if (rank !== null) {
        const pts = pointsForRank(rank);
        r.metricPoints[m.key] = pts;
        r.totalPoints += pts;
      }
    }
  }
}

// ─── Date helpers ──────────────────────────────────────────────────────────
//
// We index monthly rows by "YYYY-MM" strings (no timezone fuss; the upload
// is for a calendar month). currentYearMonth() defaults to UK time so a
// late-evening admin doesn't accidentally tick over to next month at UTC.

export function currentYearMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_LABELS[idx] ?? m} ${y}`;
}

// ─── Engagement helpers ────────────────────────────────────────────────────

export interface ClosestRace {
  metric: LeaderboardMetric;
  metricLabel: string;
  leader: ExecMonthStats;
  challenger: ExecMonthStats;
  gap: number;
  gapLabel: string;
}

// Across all four metrics, find the metric/pair with the smallest non-zero
// gap between two execs. Excludes:
//   • Pairs where both have zero (uninteresting "race to nothing").
//   • Gaps of zero (they're tied — that's its own story, not a race).
// Returns null when no race exists yet (early in the month, blank data).
export function closestRace(rows: ExecMonthStats[]): ClosestRace | null {
  const candidates: { metric: LeaderboardMetric; label: string; pick: (s: ExecMonthStats) => number; gapLabel: (g: number) => string }[] = [
    { metric: "orders",     label: "Order Take",          pick: (s) => s.orderCount,     gapLabel: (g) => `${g} order${g === 1 ? "" : "s"} apart` },
    { metric: "deliveries", label: "Deliveries",          pick: (s) => s.deliveryCount,  gapLabel: (g) => `${g} deliver${g === 1 ? "y" : "ies"} apart` },
    { metric: "insurance",  label: "Insurance Products",  pick: (s) => s.insuranceCount, gapLabel: (g) => `${g} insurance product${g === 1 ? "" : "s"} apart` },
    { metric: "conversion", label: "Conversion %",        pick: (s) => s.conversionPct,  gapLabel: (g) => `${g.toFixed(1)} percentage point${g === 1 ? "" : "s"} apart` },
  ];

  let best: ClosestRace | null = null;
  for (const c of candidates) {
    const sorted = [...rows]
      .filter((r) => c.pick(r) > 0)
      .sort((a, b) => c.pick(b) - c.pick(a));
    for (let i = 1; i < sorted.length; i++) {
      const leader = sorted[i - 1];
      const challenger = sorted[i];
      const gap = c.pick(leader) - c.pick(challenger);
      if (gap <= 0) continue;
      // Normalise conversion gaps so they compare to count gaps on a
      // roughly equivalent "tightness" scale. Without this a 0.2pp
      // conversion gap would always win over a 1-order gap, which isn't
      // really tighter in context.
      const normalised = c.metric === "conversion" ? gap * 2 : gap;
      if (best === null || normalised < (best.metric === "conversion" ? best.gap * 2 : best.gap)) {
        best = { metric: c.metric, metricLabel: c.label, leader, challenger, gap, gapLabel: c.gapLabel(gap) };
      }
    }
  }
  return best;
}

// Per-metric "overtake target" for a single exec — what gap separates them
// from the next person ahead, and who that person is. Used on /me.
export interface OvertakeTarget {
  metric: LeaderboardMetric;
  metricLabel: string;
  target: ExecMonthStats;
  targetRank: number;
  gap: number;
  gapLabel: string;
}

export function overtakeTargets(rows: ExecMonthStats[], me: ExecMonthStats): OvertakeTarget[] {
  const candidates: { metric: LeaderboardMetric; label: string; pick: (s: ExecMonthStats) => number; gapLabel: (g: number) => string }[] = [
    { metric: "orders",     label: "Order Take",          pick: (s) => s.orderCount,     gapLabel: (g) => `${Math.ceil(g)} more order${Math.ceil(g) === 1 ? "" : "s"}` },
    { metric: "deliveries", label: "Deliveries",          pick: (s) => s.deliveryCount,  gapLabel: (g) => `${Math.ceil(g)} more deliver${Math.ceil(g) === 1 ? "y" : "ies"}` },
    { metric: "insurance",  label: "Insurance Products",  pick: (s) => s.insuranceCount, gapLabel: (g) => `${Math.ceil(g)} more product${Math.ceil(g) === 1 ? "" : "s"}` },
    { metric: "conversion", label: "Conversion %",        pick: (s) => s.conversionPct,  gapLabel: (g) => `${g.toFixed(1)}pp` },
  ];
  const out: OvertakeTarget[] = [];
  for (const c of candidates) {
    // No enquiries means no conversion rate to improve — the gap would be
    // measured from a 0% that doesn't exist.
    if (c.metric === "conversion" && me.enquiryCount === 0) continue;
    const sorted = [...rows].sort((a, b) => c.pick(b) - c.pick(a));
    const myIdx = sorted.findIndex((r) => r.salesExecId === me.salesExecId);
    if (myIdx <= 0) continue;
    const myVal = c.pick(me);
    for (let i = myIdx - 1; i >= 0; i--) {
      const v = c.pick(sorted[i]);
      if (v > myVal) {
        out.push({
          metric: c.metric,
          metricLabel: c.label,
          target: sorted[i],
          targetRank: i + 1,
          gap: v - myVal,
          gapLabel: c.gapLabel(v - myVal),
        });
        break;
      }
    }
  }
  return out.sort((a, b) => a.gap - b.gap);
}
