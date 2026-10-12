import "server-only";

// 10 at 10's Market Analysis tab: the latest scrape at a glance. Built from
// the same per-run digest the Trends tab plots (lib/market-trends.ts), so a
// figure here means exactly what it means on /scraper. The full analysis
// stays there; this is the overview.

import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { scraperRunSummaries, scraperRuns } from "@/db/schema";
import type { CompetitorRow, Segment } from "./market-slots";
import { RUN_SUMMARY_VERSION, summariseRun, type RangeStats, type RunSummary } from "./market-trends";
import { loadRunListings } from "./scraper-listings";

/** Build a run's digest from its listings and cache it. */
export async function buildRunSummary(run: { id: string; totalResults: number }): Promise<RunSummary> {
  const summary = summariseRun(await loadRunListings(run.id));
  const row = {
    runId: run.id,
    totalResults: run.totalResults,
    version: RUN_SUMMARY_VERSION,
    summary: JSON.stringify(summary),
    computedAt: new Date(),
  };
  await db.insert(scraperRunSummaries).values(row).onConflictDoUpdate({ target: scraperRunSummaries.runId, set: row });
  return summary;
}

/** A run's digest from the cache, rebuilt when its row count or the digest version has moved on. */
async function cachedRunSummary(run: { id: string; totalResults: number }): Promise<RunSummary> {
  const [c] = await db.select().from(scraperRunSummaries).where(eq(scraperRunSummaries.runId, run.id));
  if (c && c.totalResults === run.totalResults && c.version === RUN_SUMMARY_VERSION) return JSON.parse(c.summary) as RunSummary;
  return buildRunSummary(run);
}

/**
 * Build the digest as soon as a scrape finishes, so the first look at 10 at
 * 10 afterwards doesn't wait on ~30k rows. Called from the upload route.
 */
export async function warmRunSummary(runId: string): Promise<void> {
  const [run] = await db.select({ id: scraperRuns.id, totalResults: scraperRuns.totalResults }).from(scraperRuns).where(eq(scraperRuns.id, runId));
  if (run && run.totalResults > 0) await buildRunSummary(run);
}

export interface MarketSegmentView {
  segment: Segment;
  overall: RangeStats;
  /** Most-compared first. */
  ranges: { name: string; stats: RangeStats }[];
  /** The rivals who undercut us most often. */
  competitors: CompetitorRow[];
}

export interface MarketOverview {
  run: { label: string | null; startedAt: string; finishedAt: string | null; totalResults: number };
  segments: MarketSegmentView[];
}

const SEGMENT_ORDER: Segment[] = ["car", "van"];

/**
 * The latest finished scrape, summarised. A run still uploading is passed
 * over for the last complete one, so the overview never shows half a run.
 * Null when nothing has been scraped yet.
 */
export async function loadMarketOverview(): Promise<MarketOverview | null> {
  const cols = {
    id: scraperRuns.id, label: scraperRuns.label, startedAt: scraperRuns.startedAt,
    finishedAt: scraperRuns.finishedAt, totalResults: scraperRuns.totalResults,
  };
  let [run] = await db.select(cols).from(scraperRuns)
    .where(and(gt(scraperRuns.totalResults, 0), eq(scraperRuns.status, "done")))
    .orderBy(desc(scraperRuns.startedAt)).limit(1);
  if (!run) {
    [run] = await db.select(cols).from(scraperRuns).where(gt(scraperRuns.totalResults, 0)).orderBy(desc(scraperRuns.startedAt)).limit(1);
  }
  if (!run) return null;

  const summary = await cachedRunSummary(run);
  const segments = SEGMENT_ORDER.flatMap((segment): MarketSegmentView[] => {
    const s = summary[segment];
    if (!s) return [];
    return [{
      segment,
      overall: s.overall,
      ranges: Object.entries(s.ranges)
        .map(([name, stats]) => ({ name, stats }))
        .filter((r) => r.stats.compared > 0)
        .sort((a, b) => b.stats.compared - a.stats.compared || a.name.localeCompare(b.name)),
      competitors: s.competitors.filter((c) => c.undercuts > 0).slice(0, 6),
    }];
  });
  return {
    run: {
      label: run.label,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      totalResults: run.totalResults,
    },
    segments,
  };
}
