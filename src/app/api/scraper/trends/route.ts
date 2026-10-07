import { NextResponse } from "next/server";
import { db } from "@/db";
import { scraperRuns, scraperRunSummaries } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { RUN_SUMMARY_VERSION, summariseRun, type RunSummary, type TrendRun } from "@/lib/market-trends";
import { loadRunListings } from "@/lib/scraper-listings";
import { asc, gt } from "drizzle-orm";

export const dynamic = "force-dynamic";
// The first visit builds a digest for every past run (~30k rows each). After
// that each run is a cached row and this returns in one query.
export const maxDuration = 300;

// Builds run digests a few at a time: enough to keep the first visit quick,
// few enough not to hold several 30k-row runs in memory at once.
const CONCURRENCY = 3;

export async function GET() {
  try {
    await requireAdmin();

    const runs = await db
      .select({
        id: scraperRuns.id,
        label: scraperRuns.label,
        startedAt: scraperRuns.startedAt,
        totalResults: scraperRuns.totalResults,
      })
      .from(scraperRuns)
      .where(gt(scraperRuns.totalResults, 0))
      .orderBy(asc(scraperRuns.startedAt));

    const cached = new Map(
      (await db.select().from(scraperRunSummaries)).map((c) => [c.runId, c])
    );

    const summaries = new Map<string, RunSummary | null>();
    const stale = runs.filter((r) => {
      const c = cached.get(r.id);
      if (c && c.totalResults === r.totalResults && c.version === RUN_SUMMARY_VERSION) {
        summaries.set(r.id, JSON.parse(c.summary) as RunSummary);
        return false;
      }
      return true;
    });

    let next = 0;
    const worker = async () => {
      while (next < stale.length) {
        const run = stale[next++];
        try {
          const summary = summariseRun(await loadRunListings(run.id));
          summaries.set(run.id, summary);
          const row = {
            runId: run.id,
            totalResults: run.totalResults,
            version: RUN_SUMMARY_VERSION,
            summary: JSON.stringify(summary),
            computedAt: new Date(),
          };
          await db
            .insert(scraperRunSummaries)
            .values(row)
            .onConflictDoUpdate({ target: scraperRunSummaries.runId, set: row });
        } catch (e) {
          logError("api/scraper/trends", e, { runId: run.id });
          summaries.set(run.id, null);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const out: TrendRun[] = runs.map((r) => ({
      id: r.id,
      label: r.label,
      startedAt: r.startedAt.toISOString(),
      totalResults: r.totalResults,
      summary: summaries.get(r.id) ?? null,
    }));
    return NextResponse.json(out);
  } catch (e) {
    logError("api/scraper/trends", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
