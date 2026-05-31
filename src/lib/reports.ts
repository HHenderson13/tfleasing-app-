import "server-only";
import { db } from "@/db";
import { customers, proposals, salesExecs } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";

export type RangeKey = "month" | "quarter" | "half" | "ytd" | "year" | "all";
export const RANGE_LABELS: Record<RangeKey, string> = {
  month: "This month",
  quarter: "This quarter",
  half: "Last 6 months",
  ytd: "Year to date",
  year: "Last 12 months",
  all: "All time",
};

export type SourceKey = "all" | "retail" | "broker" | "bq";
export const SOURCE_LABELS: Record<SourceKey, string> = {
  all: "All sources",
  retail: "Retail",
  broker: "Broker",
  bq: "Group BQ",
};

export function rowSource(r: { isBroker: boolean; isGroupBq: boolean }): Exclude<SourceKey, "all"> {
  if (r.isGroupBq) return "bq";
  if (r.isBroker) return "broker";
  return "retail";
}

function matchesSource(r: { isBroker: boolean; isGroupBq: boolean }, s: SourceKey): boolean {
  if (s === "all") return true;
  return rowSource(r) === s;
}

export function rangeBounds(range: RangeKey, now = new Date()): { from: Date | null; to: Date } {
  const to = now;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (range === "month") return { from: new Date(d.getFullYear(), d.getMonth(), 1), to };
  if (range === "quarter") {
    const q = Math.floor(d.getMonth() / 3);
    return { from: new Date(d.getFullYear(), q * 3, 1), to };
  }
  if (range === "half") {
    const x = new Date(d); x.setMonth(x.getMonth() - 6); return { from: x, to };
  }
  if (range === "ytd") return { from: new Date(d.getFullYear(), 0, 1), to };
  if (range === "year") {
    const x = new Date(d); x.setFullYear(x.getFullYear() - 1); return { from: x, to };
  }
  return { from: null, to };
}

type Row = typeof proposals.$inferSelect;

export type DrillKind = "funder" | "model" | "exec" | "contract" | "term" | "ev" | "cancelled" | "second" | "source" | "accepted" | "referred" | "declined";

export interface DrillRow {
  id: string;
  customerId: string;
  customerName: string;
  model: string;
  derivative: string;
  funderName: string;
  status: string;
  monthly: number;
  execName: string | null;
  createdAt: string;
}

export async function getDrilldown(
  range: RangeKey,
  kind: DrillKind,
  value: string,
  source: SourceKey = "all",
): Promise<DrillRow[]> {
  const { from, to } = rangeBounds(range);
  const wheres = [lte(proposals.createdAt, to), eq(proposals.backLoaded, false)];
  if (from) wheres.push(gte(proposals.createdAt, from));
  const all = await db.select().from(proposals).where(and(...wheres));
  const rows = all.filter((r) => matchesSource(r, source));
  const custs = await db.select().from(customers);
  const execs = await db.select().from(salesExecs);
  const custMap = new Map(custs.map((c) => [c.id, c.name]));
  const execMap = new Map(execs.map((e) => [e.id, e.name]));

  // For accepted/referred/declined we bucket each customer into one mutually
  // exclusive end-state (priority accepted > referred > declined) so the
  // drilldown matches the headline KPI tiles.
  const customerBucket = new Map<string, "accepted" | "referred" | "declined" | null>();
  if (kind === "accepted" || kind === "referred" || kind === "declined") {
    const byCust = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byCust.get(r.customerId) ?? [];
      arr.push(r);
      byCust.set(r.customerId, arr);
    }
    for (const [cid, arr] of byCust.entries()) {
      const active = arr.filter((r) => !CANCELLED_STATUSES.has(r.status));
      if (arr.every((r) => CANCELLED_STATUSES.has(r.status))) { customerBucket.set(cid, null); continue; }
      if (active.some((r) => ACCEPTED_STATUSES.has(r.status))) { customerBucket.set(cid, "accepted"); continue; }
      if (active.some((r) => REFERRED_STATUSES.has(r.status))) { customerBucket.set(cid, "referred"); continue; }
      if (active.some((r) => DECLINED_STATUSES.has(r.status))) { customerBucket.set(cid, "declined"); continue; }
      customerBucket.set(cid, null);
    }
  }

  const filtered = rows.filter((r) => {
    if (kind === "source") return rowSource(r) === value;
    if (kind === "funder") return r.funderId === value;
    if (kind === "model") return r.model === value;
    if (kind === "exec") return r.salesExecId === value;
    if (kind === "contract") return r.contract === value;
    if (kind === "term") return String(r.termMonths) === value;
    if (kind === "ev") {
      if (value === "wallbox") return r.isEv && r.wallboxIncluded;
      if (value === "saving") return r.isEv && !r.wallboxIncluded;
      return r.isEv;
    }
    if (kind === "cancelled") return CANCELLED_STATUSES.has(r.status);
    if (kind === "accepted") return customerBucket.get(r.customerId) === "accepted" && !CANCELLED_STATUSES.has(r.status);
    if (kind === "referred") return customerBucket.get(r.customerId) === "referred" && !CANCELLED_STATUSES.has(r.status);
    if (kind === "declined") return customerBucket.get(r.customerId) === "declined" && !CANCELLED_STATUSES.has(r.status);
    if (kind === "second") return r.funderRank >= 2 && r.funderId === value;
    return false;
  });

  return filtered
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 200)
    .map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName: custMap.get(r.customerId) ?? "—",
      model: r.model,
      derivative: r.derivative,
      funderName: r.funderName,
      status: r.status,
      monthly: r.monthlyRental,
      execName: r.salesExecId ? execMap.get(r.salesExecId) ?? null : null,
      createdAt: r.createdAt.toISOString(),
    }));
}

export async function getProposalsTimeseries(range: RangeKey, source: SourceKey = "all"): Promise<{ label: string; submitted: number; accepted: number }[]> {
  const { from, to } = rangeBounds(range);
  const wheres = [lte(proposals.createdAt, to), eq(proposals.backLoaded, false)];
  if (from) wheres.push(gte(proposals.createdAt, from));
  const all = await db.select().from(proposals).where(and(...wheres));
  const rows = all.filter((r) => matchesSource(r, source) && !CANCELLED_STATUSES.has(r.status));

  const start = from ?? (rows.length ? rows.reduce((a, b) => a.createdAt < b.createdAt ? a : b).createdAt : to);
  const end = to;
  const ms = end.getTime() - start.getTime();
  const bucketByDay = ms <= 1000 * 60 * 60 * 24 * 90;
  const buckets = new Map<string, { submitted: number; accepted: number }>();
  void eq;

  function key(d: Date): string {
    if (bucketByDay) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function label(k: string): string {
    if (bucketByDay) {
      const [, mo, da] = k.split("-");
      return `${da}/${mo}`;
    }
    const [yr, mo] = k.split("-");
    return `${mo}/${yr.slice(2)}`;
  }

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  if (!bucketByDay) cursor.setDate(1);
  while (cursor <= end) {
    buckets.set(key(cursor), { submitted: 0, accepted: 0 });
    if (bucketByDay) cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const r of rows) {
    const k = key(r.createdAt);
    const cur = buckets.get(k) ?? { submitted: 0, accepted: 0 };
    cur.submitted++;
    if (ACCEPTED_STATUSES.has(r.status)) cur.accepted++;
    buckets.set(k, cur);
  }
  return [...buckets.entries()].map(([k, v]) => ({ label: label(k), ...v }));
}

const ACCEPTED_STATUSES = new Set(["accepted", "in_order", "awaiting_delivery", "delivered"]);
// Split: a real underwriter decline vs "we never even submitted" (not_eligible).
// These get different headline treatment because they say different things —
// "declined" is a funder problem to solve, "not_eligible" is a sales/pricing
// problem upstream.
const DECLINED_STATUSES = new Set(["declined"]);
const NOT_ELIGIBLE_STATUSES = new Set(["not_eligible"]);
const CANCELLED_STATUSES = new Set(["lost_sale", "cancelled"]);
const PENDING_STATUSES = new Set(["proposal_received", "referred_to_dealer", "referred_to_underwriter"]);
const REFERRED_STATUSES = new Set(["referred_to_dealer", "referred_to_underwriter"]);
// All terminal proposal states the proposal moved through after acceptance.
const DELIVERED_STATUSES = new Set(["delivered"]);

export interface ReportSummary {
  totalProposals: number;
  uniqueDeals: number;
  eligibleDeals: number;
  acceptedDeals: number;
  cancelledDeals: number;
  deptAcceptanceRate: number;
  pendingDeals: number;
  referredDeals: number;
  referredRate: number;
  declinedDeals: number;
  declinedRate: number;
  // New: customers where every active proposal came back not_eligible.
  // Previously folded into declinedDeals — a misleading mix because the two
  // tell different stories (funder decline vs we-never-submitted).
  notEligibleDeals: number;
  notEligibleRate: number;
  // Pull-through: of accepted deals, what share are actually delivered.
  // Helps spot accepted-then-vanished deals to chase.
  deliveredDeals: number;
  pullThroughRate: number;
  // Average days from proposal createdAt to first decision (accept OR
  // decline). Computed at proposal-grain, averaged across customers
  // that have at least one decided proposal.
  avgDaysToDecision: number;
  // Annualised contract value of every customer currently in-flight
  // (accepted or referred, not yet cancelled). monthlyRental × 12.
  pipelineValueGbp: number;
  funderSplit: { funderId: string; funderName: string; count: number; pct: number }[];
  // funderAcceptance also carries deptAvg so the per-funder card can render
  // a benchmark tick next to each rate (above-/below-dept colour signal).
  funderAcceptance: { funderId: string; funderName: string; decided: number; accepted: number; pending: number; rate: number; deptAvg: number }[];
  funderReferralRate: { funderId: string; funderName: string; referred: number; submitted: number; rate: number }[];
  secondStringByFunder: { funderId: string; funderName: string; decided: number; accepted: number; pending: number; rate: number }[];
  contractSplit: { key: string; count: number; pct: number }[];
  maintenanceSplit: { key: string; count: number; pct: number }[];
  termSplit: { key: string; count: number; pct: number }[];
  mileageSplit: { key: string; count: number; pct: number }[];
  upfrontSplit: { key: string; count: number; pct: number }[];
  modelSplit: { model: string; count: number; pct: number }[];
  derivativeSplit: { model: string; derivative: string; count: number; pct: number }[];
  cancellationRate: number;
  cancellationByFunder: { funderId: string; funderName: string; count: number }[];
  evSummary: { totalEv: number; wallbox: number; saving: number; wallboxPct: number; savingPct: number; avgSavingGbp: number; evMixPct: number };
  evByModel: { model: string; total: number; wallbox: number; saving: number }[];
  execLeaderboard: { execId: string; execName: string; submitted: number; decided: number; accepted: number; pending: number; rate: number }[];
  sourceSplit: { key: Exclude<SourceKey, "all">; label: string; submitted: number; accepted: number; rate: number; pct: number }[];
}

function pct(n: number, total: number) { return total > 0 ? Math.round((n / total) * 1000) / 10 : 0; }

function bucketCount<K extends string | number>(rows: Row[], pick: (r: Row) => K, total: number): { key: string; count: number; pct: number }[] {
  const m = new Map<K, number>();
  for (const r of rows) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1);
  return [...m.entries()]
    .map(([key, count]) => ({ key: String(key), count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

export async function buildReport(range: RangeKey, source: SourceKey = "all"): Promise<ReportSummary> {
  const { from, to } = rangeBounds(range);
  const wheres = [lte(proposals.createdAt, to), eq(proposals.backLoaded, false)];
  if (from) wheres.push(gte(proposals.createdAt, from));
  const allRows = await db.select().from(proposals).where(and(...wheres));
  const rows = allRows.filter((r) => matchesSource(r, source));
  const execs = await db.select().from(salesExecs);
  const execMap = new Map(execs.map((e) => [e.id, e.name]));

  // Source split is always computed against the unfiltered period (so users
  // can see channel mix even when a source is selected).
  const sourceTotals = new Map<Exclude<SourceKey, "all">, { submitted: number; accepted: number }>([
    ["retail", { submitted: 0, accepted: 0 }],
    ["broker", { submitted: 0, accepted: 0 }],
    ["bq", { submitted: 0, accepted: 0 }],
  ]);
  for (const r of allRows) {
    const k = rowSource(r);
    const cur = sourceTotals.get(k)!;
    cur.submitted++;
    if (ACCEPTED_STATUSES.has(r.status)) cur.accepted++;
  }
  const sourceTotalSubmitted = allRows.length;
  const sourceSplit = (["retail", "broker", "bq"] as const).map((k) => {
    const v = sourceTotals.get(k)!;
    return {
      key: k,
      label: SOURCE_LABELS[k],
      submitted: v.submitted,
      accepted: v.accepted,
      rate: pct(v.accepted, v.submitted),
      pct: pct(v.submitted, sourceTotalSubmitted),
    };
  });

  // Strip out cancelled / lost-sale rows from "active" reporting. The
  // cancellation card below still uses the full row set.
  const activeRows = rows.filter((r) => !CANCELLED_STATUSES.has(r.status));
  const totalProposals = activeRows.length;

  const dealsByCustomer = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = dealsByCustomer.get(r.customerId) ?? [];
    arr.push(r);
    dealsByCustomer.set(r.customerId, arr);
  }
  // Active deals exclude wholly-cancelled deals.
  let uniqueDeals = 0;
  for (const arr of dealsByCustomer.values()) {
    if (!arr.every((r) => CANCELLED_STATUSES.has(r.status))) uniqueDeals++;
  }

  // Eligible: deal has at least one attempt that isn't not_eligible.
  // Pending: deal has no decided attempt yet (every attempt is pending).
  let eligibleDeals = 0;
  let acceptedDeals = 0;
  let cancelledDeals = 0;
  let pendingDeals = 0;
  let decidedDeals = 0;
  // Bucket each customer mutually-exclusively by their best end-state.
  // Priority: accepted > referred > declined > not_eligible. Cancelled-only
  // customers go to cancelled; customers with only pending proposals fall
  // through to pendingDeals.
  let referredDeals = 0;
  let declinedDeals = 0;
  let notEligibleDeals = 0;
  let deliveredDeals = 0;
  // Cumulative pipeline £: annualised value of every customer currently
  // in-flight (accepted or referred, not yet cancelled) — sums each
  // customer's best/active monthlyRental.
  let pipelineValueGbp = 0;
  // Days-to-decision: per customer with a decided proposal, take the
  // earliest-decided's createdAt → acceptedAt/updatedAt and average.
  const daysToDecision: number[] = [];
  for (const arr of dealsByCustomer.values()) {
    const active = arr.filter((r) => !CANCELLED_STATUSES.has(r.status));
    const anyEligible = active.some((r) => r.status !== "not_eligible");
    if (anyEligible) eligibleDeals++;
    if (arr.every((r) => CANCELLED_STATUSES.has(r.status))) { cancelledDeals++; continue; }
    if (active.some((r) => ACCEPTED_STATUSES.has(r.status))) {
      acceptedDeals++; decidedDeals++;
      if (active.some((r) => DELIVERED_STATUSES.has(r.status))) deliveredDeals++;
      // Pipeline value: take the highest monthlyRental among accepted attempts
      // (multiple funders can have an accept against the same customer).
      const accept = active.find((r) => ACCEPTED_STATUSES.has(r.status));
      if (accept) pipelineValueGbp += accept.monthlyRental * 12;
      const decisionRow = accept ?? active[0];
      const decided = decisionRow.acceptedAt ?? decisionRow.updatedAt;
      const days = (decided.getTime() - decisionRow.createdAt.getTime()) / 86400_000;
      if (Number.isFinite(days) && days >= 0) daysToDecision.push(days);
      continue;
    }
    if (active.some((r) => REFERRED_STATUSES.has(r.status))) {
      referredDeals++;
      const referred = active.find((r) => REFERRED_STATUSES.has(r.status));
      if (referred) pipelineValueGbp += referred.monthlyRental * 12;
      continue;
    }
    if (active.some((r) => DECLINED_STATUSES.has(r.status))) {
      declinedDeals++; decidedDeals++;
      const declined = active.find((r) => DECLINED_STATUSES.has(r.status));
      if (declined) {
        const days = (declined.updatedAt.getTime() - declined.createdAt.getTime()) / 86400_000;
        if (Number.isFinite(days) && days >= 0) daysToDecision.push(days);
      }
      continue;
    }
    if (active.every((r) => NOT_ELIGIBLE_STATUSES.has(r.status))) {
      notEligibleDeals++;
      continue;
    }
    if (anyEligible) pendingDeals++;
  }
  const avgDaysToDecision = daysToDecision.length
    ? Math.round((daysToDecision.reduce((a, b) => a + b, 0) / daysToDecision.length) * 10) / 10
    : 0;
  // Acceptance / decline are computed against DECIDED customers — those whose
  // funder has actually said yes or no. Referred deals are still in flight and
  // would artificially drag acceptance down if they were in the denominator.
  // This matches the per-funder "Funder acceptance rates" card definition
  // shown elsewhere on the page (accepted ÷ decided). With this denominator,
  // acceptance + decline always sums to 100%.
  //
  // Referred rate uses a wider denominator (everything bucketed including
  // referrals) so it answers a different question — "what share of currently
  // in-flight deals are stuck waiting for a referral decision".
  //
  // Not-eligible is its own thing: customers we never even submitted because
  // pricing or product disqualified them. Shown separately so it doesn't get
  // mixed into the decline rate.
  const decidedCustomers = acceptedDeals + declinedDeals;
  const bucketedTotal = acceptedDeals + referredDeals + declinedDeals + notEligibleDeals;
  const deptAcceptanceRate = pct(acceptedDeals, decidedCustomers);
  const declinedRate = pct(declinedDeals, decidedCustomers);
  const referredRate = pct(referredDeals, bucketedTotal);
  const notEligibleRate = pct(notEligibleDeals, bucketedTotal);
  // Pull-through: of accepted deals, what share are actually delivered.
  // Indicates the "accepted but stalled mid-order" rate; the inverse hints
  // at how many accepted deals end up cancelled or never closed.
  const pullThroughRate = pct(deliveredDeals, acceptedDeals);

  const funderTotals = new Map<string, {
    name: string; submitted: number; accepted: number; declined: number;
    firstSubmitted: number; firstDecided: number; firstAccepted: number; firstPending: number; firstReferred: number;
    second: number; secondDecided: number; secondAccepted: number; secondPending: number;
    cancelled: number;
  }>();
  for (const r of activeRows) {
    const cur = funderTotals.get(r.funderId) ?? {
      name: r.funderName, submitted: 0, accepted: 0, declined: 0,
      firstSubmitted: 0, firstDecided: 0, firstAccepted: 0, firstPending: 0, firstReferred: 0,
      second: 0, secondDecided: 0, secondAccepted: 0, secondPending: 0,
      cancelled: 0,
    };
    cur.submitted++;
    if (ACCEPTED_STATUSES.has(r.status)) cur.accepted++;
    if (DECLINED_STATUSES.has(r.status)) cur.declined++;
    if (r.funderRank === 1 && r.status !== "not_eligible") {
      cur.firstSubmitted++;
      if (PENDING_STATUSES.has(r.status)) cur.firstPending++;
      else cur.firstDecided++;
      if (ACCEPTED_STATUSES.has(r.status)) cur.firstAccepted++;
      if (REFERRED_STATUSES.has(r.status)) cur.firstReferred++;
    }
    if (r.funderRank >= 2) {
      cur.second++;
      if (PENDING_STATUSES.has(r.status)) cur.secondPending++;
      else if (r.status !== "not_eligible") cur.secondDecided++;
      if (ACCEPTED_STATUSES.has(r.status)) cur.secondAccepted++;
    }
    funderTotals.set(r.funderId, cur);
  }
  // Cancellation counts come from the full row set so that cancelled deals
  // are still attributed to the funder they were against.
  const cancelByFunder = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (!CANCELLED_STATUSES.has(r.status)) continue;
    const cur = cancelByFunder.get(r.funderId) ?? { name: r.funderName, count: 0 };
    cur.count++;
    cancelByFunder.set(r.funderId, cur);
  }

  const funderSplit = [...funderTotals.entries()]
    .map(([funderId, v]) => ({ funderId, funderName: v.name, count: v.submitted, pct: pct(v.submitted, totalProposals) }))
    .sort((a, b) => b.count - a.count);

  const funderAcceptance = [...funderTotals.entries()]
    .filter(([, v]) => v.firstDecided > 0 || v.firstPending > 0)
    .map(([funderId, v]) => ({
      funderId,
      funderName: v.name,
      decided: v.firstDecided,
      accepted: v.firstAccepted,
      pending: v.firstPending,
      rate: pct(v.firstAccepted, v.firstDecided),
      // Each row carries the dept-wide acceptance rate so the card can render
      // a benchmark tick — makes "above / below dept" instantly readable.
      deptAvg: deptAcceptanceRate,
    }))
    .sort((a, b) => b.rate - a.rate);

  const funderReferralRate = [...funderTotals.entries()]
    .filter(([, v]) => v.firstSubmitted > 0)
    .map(([funderId, v]) => ({
      funderId,
      funderName: v.name,
      referred: v.firstReferred,
      submitted: v.firstSubmitted,
      rate: pct(v.firstReferred, v.firstSubmitted),
    }))
    .sort((a, b) => b.rate - a.rate);

  const secondStringByFunder = [...funderTotals.entries()]
    .filter(([, v]) => v.second > 0)
    .map(([funderId, v]) => ({
      funderId,
      funderName: v.name,
      decided: v.secondDecided,
      accepted: v.secondAccepted,
      pending: v.secondPending,
      rate: pct(v.secondAccepted, v.secondDecided),
    }))
    .sort((a, b) => b.decided + b.pending - (a.decided + a.pending));

  const contractSplit = bucketCount(activeRows, (r) => r.contract, totalProposals);
  const maintenanceSplit = bucketCount(activeRows, (r) => r.maintenance === "maintained" ? "Maintained" : "Customer maintained", totalProposals);
  const termSplit = bucketCount(activeRows, (r) => `${r.termMonths}m`, totalProposals);
  const mileageSplit = bucketCount(activeRows, (r) => `${r.annualMileage.toLocaleString()}`, totalProposals);
  const upfrontSplit = bucketCount(activeRows, (r) => `${r.initialRentalMultiplier}×`, totalProposals);

  const modelMap = new Map<string, number>();
  const derivMap = new Map<string, { model: string; derivative: string; count: number }>();
  for (const r of activeRows) {
    modelMap.set(r.model, (modelMap.get(r.model) ?? 0) + 1);
    const k = `${r.model}|${r.derivative}`;
    const cur = derivMap.get(k) ?? { model: r.model, derivative: r.derivative, count: 0 };
    cur.count++;
    derivMap.set(k, cur);
  }
  const modelSplit = [...modelMap.entries()]
    .map(([model, count]) => ({ model, count, pct: pct(count, totalProposals) }))
    .sort((a, b) => b.count - a.count);
  const derivativeSplit = [...derivMap.values()]
    .map((d) => ({ ...d, pct: pct(d.count, totalProposals) }))
    .sort((a, b) => b.count - a.count);

  // Cancellation rate denominator is the full deal count (incl. cancelled).
  const cancellationRate = pct(cancelledDeals, dealsByCustomer.size);
  const cancellationByFunder = [...cancelByFunder.entries()]
    .map(([funderId, v]) => ({ funderId, funderName: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const evRows = activeRows.filter((r) => r.isEv);
  const wallbox = evRows.filter((r) => r.wallboxIncluded).length;
  const saving = evRows.filter((r) => !r.wallboxIncluded && r.customerSavingGbp != null).length;
  const totalEv = evRows.length;
  const savingValues = evRows.filter((r) => !r.wallboxIncluded && r.customerSavingGbp != null).map((r) => r.customerSavingGbp as number);
  const avgSavingGbp = savingValues.length ? Math.round(savingValues.reduce((a, b) => a + b, 0) / savingValues.length) : 0;

  const evByModelMap = new Map<string, { model: string; total: number; wallbox: number; saving: number }>();
  for (const r of evRows) {
    const cur = evByModelMap.get(r.model) ?? { model: r.model, total: 0, wallbox: 0, saving: 0 };
    cur.total++;
    if (r.wallboxIncluded) cur.wallbox++; else if (r.customerSavingGbp != null) cur.saving++;
    evByModelMap.set(r.model, cur);
  }
  const evByModel = [...evByModelMap.values()].sort((a, b) => b.total - a.total);

  const execTotals = new Map<string, { name: string; submitted: number; decided: number; accepted: number; pending: number }>();
  for (const r of activeRows) {
    if (!r.salesExecId) continue;
    const cur = execTotals.get(r.salesExecId) ?? { name: execMap.get(r.salesExecId) ?? "—", submitted: 0, decided: 0, accepted: 0, pending: 0 };
    cur.submitted++;
    if (PENDING_STATUSES.has(r.status)) cur.pending++;
    else if (r.status !== "not_eligible") cur.decided++;
    if (ACCEPTED_STATUSES.has(r.status)) cur.accepted++;
    execTotals.set(r.salesExecId, cur);
  }
  const execLeaderboard = [...execTotals.entries()]
    .map(([execId, v]) => ({ execId, execName: v.name, submitted: v.submitted, decided: v.decided, accepted: v.accepted, pending: v.pending, rate: pct(v.accepted, v.decided) }))
    .sort((a, b) => b.accepted - a.accepted);

  return {
    totalProposals,
    uniqueDeals,
    eligibleDeals,
    acceptedDeals,
    cancelledDeals,
    deptAcceptanceRate,
    pendingDeals,
    referredDeals,
    referredRate,
    declinedDeals,
    declinedRate,
    notEligibleDeals,
    notEligibleRate,
    deliveredDeals,
    pullThroughRate,
    avgDaysToDecision,
    pipelineValueGbp,
    funderSplit,
    funderAcceptance,
    funderReferralRate,
    secondStringByFunder,
    contractSplit,
    maintenanceSplit,
    termSplit,
    mileageSplit,
    upfrontSplit,
    modelSplit,
    derivativeSplit,
    cancellationRate,
    cancellationByFunder,
    evSummary: {
      totalEv,
      wallbox,
      saving,
      wallboxPct: pct(wallbox, totalEv),
      savingPct: pct(saving, totalEv),
      avgSavingGbp,
      evMixPct: pct(totalEv, totalProposals),
    },
    evByModel,
    execLeaderboard,
    sourceSplit,
  };
}
