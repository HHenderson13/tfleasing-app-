// Market Analysis over time — the Trends tab. Built entirely on the slots of
// lib/market-slots.ts, so a figure here always means the same thing as the
// same figure on the Intelligence tab.
//
// Two jobs:
//  • summariseRun — a compact per-run digest (segment → range → position),
//    cached server-side so the history chart doesn't reload ~30k rows for
//    every run it plots.
//  • compareSlots — what changed between two runs, slot by slot: who moved
//    price, and where we lost or gained the cheapest spot, and why.

import {
  buildHeadlines,
  buildSlots,
  competitorTable,
  dedupeListings,
  groupBy,
  summarise,
  summariseHeadlines,
  type CompetitorRow,
  type GapSummary,
  type HeadlineSummary,
  type Listing,
  type Segment,
  type Slot,
} from "./market-slots";

// Bump whenever slot, headline or range logic changes. Cached summaries carry
// the version they were built with and are rebuilt when it differs, so the
// history never mixes figures computed two different ways.
export const RUN_SUMMARY_VERSION = 1;

export interface RangeStats extends GapSummary {
  marketSlots: number;          // slots with at least one competitor price
  headline: HeadlineSummary;
}

export interface SegmentStats {
  overall: RangeStats;
  ranges: Record<string, RangeStats>;
  competitors: CompetitorRow[];
}

export type RunSummary = Partial<Record<Segment, SegmentStats>>;

// One run as /api/scraper/trends serves it.
export interface TrendRun {
  id: string;
  label: string | null;
  startedAt: string;
  totalResults: number;
  summary: RunSummary | null; // null if it couldn't be built; the run is skipped
}

export function rangeStats(slots: Slot[]): RangeStats {
  return {
    ...summarise(slots),
    marketSlots: slots.filter((s) => s.best).length,
    headline: summariseHeadlines(buildHeadlines(slots)),
  };
}

export function summariseRun(listings: Listing[]): RunSummary {
  const slots = buildSlots(dedupeListings(listings).rows);
  const out: RunSummary = {};
  for (const [segment, ss] of groupBy(slots, (s) => s.segment)) {
    const ranges: Record<string, RangeStats> = {};
    for (const [range, rs] of groupBy(ss, (s) => s.range)) ranges[range] = rangeStats(rs);
    out[segment as Segment] = {
      overall: rangeStats(ss),
      ranges,
      competitors: competitorTable(ss),
    };
  }
  return out;
}

// ── Comparing two runs ─────────────────────────────────────────────────────

// Pennies of rounding noise between scrapes are not a price move.
const EPS = 0.005;

export type CauseKind =
  | "rival-cut"     // the rival now cheapest cut their price
  | "new-rival"     // the rival now cheapest wasn't listed before
  | "tf-rose"       // we put our price up
  | "tf-cut"        // we cut our price
  | "rival-rose"    // the rival who was cheapest put theirs up
  | "rival-left";   // the rival who was cheapest stopped listing it

export interface Cause {
  kind: CauseKind;
  broker: string;
  amount: number | null;  // £/mo, always positive
}

export interface LeadChange {
  key: string;
  before: Slot;
  after: Slot;
  // lost: the rival now cheapest. gained: the rival who was cheapest.
  rival: string;
  causes: Cause[];
}

export interface BrokerMove {
  broker: string;
  isTF: boolean;
  matched: number;          // slots where they are listed in both runs
  cuts: number;
  rises: number;
  avgCut: number | null;    // £/mo, positive
  avgRise: number | null;
  added: number;            // listed now, not before (slot in both runs)
  withdrawn: number;        // listed before, not now
}

export interface RunComparison {
  matched: number;          // slots present in both runs
  onlyBefore: number;
  onlyAfter: number;
  before: GapSummary;       // over matched slots, so the two are like-for-like
  after: GapSummary;
  lost: LeadChange[];
  gained: LeadChange[];
  tfAdded: number;          // matched slots we started listing
  tfDropped: number;        // matched slots we stopped listing
  brokers: BrokerMove[];
  pairs: Map<string, { before: Slot; after: Slot }>;
}

function leads(s: Slot): boolean {
  return !!s.tf && !!s.best && s.rank === 1;
}

function contested(s: Slot): boolean {
  return !!s.tf && !!s.best;
}

function offerOf(s: Slot, broker: string) {
  return s.offers.find((o) => o.broker === broker) ?? null;
}

function lostCauses(b: Slot, a: Slot): Cause[] {
  const causes: Cause[] = [];
  const rival = a.best!;
  const was = offerOf(b, rival.broker);
  if (!was) causes.push({ kind: "new-rival", broker: rival.broker, amount: null });
  else if (rival.monthly < was.monthly - EPS)
    causes.push({ kind: "rival-cut", broker: rival.broker, amount: was.monthly - rival.monthly });
  if (a.tf!.monthly > b.tf!.monthly + EPS)
    causes.push({ kind: "tf-rose", broker: a.tf!.broker, amount: a.tf!.monthly - b.tf!.monthly });
  return causes;
}

function gainedCauses(b: Slot, a: Slot): Cause[] {
  const causes: Cause[] = [];
  const rival = b.best!;
  const now = offerOf(a, rival.broker);
  if (a.tf!.monthly < b.tf!.monthly - EPS)
    causes.push({ kind: "tf-cut", broker: a.tf!.broker, amount: b.tf!.monthly - a.tf!.monthly });
  if (!now) causes.push({ kind: "rival-left", broker: rival.broker, amount: null });
  else if (now.monthly > rival.monthly + EPS)
    causes.push({ kind: "rival-rose", broker: rival.broker, amount: now.monthly - rival.monthly });
  return causes;
}

export function compareSlots(beforeSlots: Slot[], afterSlots: Slot[]): RunComparison {
  const beforeByKey = new Map(beforeSlots.map((s) => [s.key, s]));
  const pairs = new Map<string, { before: Slot; after: Slot }>();
  for (const a of afterSlots) {
    const b = beforeByKey.get(a.key);
    if (b) pairs.set(a.key, { before: b, after: a });
  }

  const lost: LeadChange[] = [];
  const gained: LeadChange[] = [];
  let tfAdded = 0, tfDropped = 0;
  const moves = new Map<string, BrokerMove & { cutSum: number; riseSum: number }>();
  const move = (broker: string, isTF: boolean) => {
    let m = moves.get(broker);
    if (!m) {
      m = { broker, isTF, matched: 0, cuts: 0, rises: 0, avgCut: null, avgRise: null, added: 0, withdrawn: 0, cutSum: 0, riseSum: 0 };
      moves.set(broker, m);
    }
    return m;
  };

  for (const [key, { before: b, after: a }] of pairs) {
    if (!b.tf && a.tf) tfAdded++;
    if (b.tf && !a.tf) tfDropped++;

    // A lead change needs a contest on both sides; we and a rival must be
    // priced in both runs, or it is a listing change, counted above.
    if (contested(b) && contested(a)) {
      if (leads(b) && !leads(a)) lost.push({ key, before: b, after: a, rival: a.best!.broker, causes: lostCauses(b, a) });
      if (!leads(b) && leads(a)) gained.push({ key, before: b, after: a, rival: b.best!.broker, causes: gainedCauses(b, a) });
    }

    const brokers = new Set([...b.offers, ...a.offers].map((o) => o.broker));
    for (const broker of brokers) {
      const ob = offerOf(b, broker);
      const oa = offerOf(a, broker);
      const m = move(broker, (ob ?? oa)!.isTF);
      if (ob && oa) {
        m.matched++;
        const d = oa.monthly - ob.monthly;
        if (d < -EPS) { m.cuts++; m.cutSum -= d; }
        else if (d > EPS) { m.rises++; m.riseSum += d; }
      } else if (oa) m.added++;
      else m.withdrawn++;
    }
  }

  const matchedBefore = [...pairs.values()].map((p) => p.before);
  const matchedAfter = [...pairs.values()].map((p) => p.after);
  const brokers = [...moves.values()]
    .map(({ cutSum, riseSum, ...m }) => ({
      ...m,
      avgCut: m.cuts ? cutSum / m.cuts : null,
      avgRise: m.rises ? riseSum / m.rises : null,
    }))
    .sort((x, y) => Number(y.isTF) - Number(x.isTF) || (y.cuts + y.rises) - (x.cuts + x.rises));

  return {
    matched: pairs.size,
    onlyBefore: beforeSlots.length - pairs.size,
    onlyAfter: afterSlots.length - pairs.size,
    before: summarise(matchedBefore),
    after: summarise(matchedAfter),
    lost,
    gained,
    tfAdded,
    tfDropped,
    brokers,
    pairs,
  };
}
