import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { wcFixtures, wcLiveScores, wcPredictions, users as usersTable, wcResults } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { requireWcAccess, requireWcAdmin } from "@/lib/auth-guard";
import { fetchEspnLive, mapToFixtures, type MappedLiveMatch } from "@/lib/world-cup-live-feed";
import { scorePrediction, winnerForGroup } from "@/lib/world-cup-scoring";
import { commitFixtureResult, SYSTEM_USER_ID } from "@/lib/world-cup-settle";
import { logError, logInfo } from "@/lib/logger";

export const runtime = "nodejs";
// The fetch() to ESPN has next: { revalidate: 10 } — caching is per-URL, so
// every caller in the next 10s shares the same upstream response.
export const dynamic = "force-dynamic";

// A group fixture that ESPN has been reporting as Full Time for at least this
// long auto-settles via commitFixtureResult. The buffer protects against
// transient bad data (VAR adjustments, ESPN status flickers) before we
// canonicalise the score into wc_results.
const FT_STABILITY_WINDOW_MS = 30 * 60 * 1000;

export interface LiveApiResponse {
  fetchedAt: string;
  matches: Array<{
    fixtureNumber: number;
    stage: string;
    groupName: string | null;
    team1: string;
    team2: string;
    team1Goals: number;
    team2Goals: number;
    minute: number | null;
    status: "live" | "halftime" | "final";
    projected: Array<{ name: string; pickT1: number; pickT2: number; points: number }>;
    me: { pickT1: number; pickT2: number; points: number } | null;
    // For knockouts that ESPN has been reporting as final but we haven't
    // confirmed (ET/pens require admin entry), set to the duration since
    // ESPN first reported FT. Surfaced to the admin Results tab as a hint.
    pendingAdminMs?: number;
  }>;
}

// Read-only health check. Calls ESPN, maps matches to our fixtures, reports
// what would be auto-recorded — but writes nothing. Use before kick-off to
// confirm the feed + mapping are wired correctly.
//
//   GET /api/world-cup/live?probe=1
//
// Admin only.
async function handleProbe(): Promise<NextResponse> {
  await requireWcAdmin();
  const startedAt = Date.now();
  let feed: Awaited<ReturnType<typeof fetchEspnLive>> = [];
  let feedError: string | null = null;
  try {
    feed = await fetchEspnLive();
  } catch (e) {
    feedError = e instanceof Error ? e.message : "Unknown error";
  }
  const fetchMs = Date.now() - startedAt;

  const fixtures = await db.select().from(wcFixtures);
  const settled = new Set((await db.select({ fixtureNumber: wcResults.fixtureNumber }).from(wcResults)).map((r) => r.fixtureNumber));
  const liveSnapshots = await db.select().from(wcLiveScores);
  const liveByFx = new Map(liveSnapshots.map((r) => [r.fixtureNumber, r]));

  const mapped = feed.length === 0 ? [] : mapToFixtures(feed, fixtures);
  const matched = mapped.length;
  const unmapped = feed.length - matched;
  const now = Date.now();
  const wouldAutoRecord = mapped
    .filter((m) => m.stage === "group" && m.status === "final" && !settled.has(m.fixtureNumber))
    .map((m) => {
      const snap = liveByFx.get(m.fixtureNumber);
      const firstFinalAt = snap?.firstFinalAt?.getTime() ?? null;
      const stableForMs = firstFinalAt === null ? 0 : now - firstFinalAt;
      return {
        fixtureNumber: m.fixtureNumber,
        team1: m.team1, team2: m.team2,
        score: `${m.team1Goals}-${m.team2Goals}`,
        stableForMs,
        wouldRecord: stableForMs >= FT_STABILITY_WINDOW_MS,
      };
    });
  const nextKickoff = fixtures
    .filter((f) => f.kickoffAt.getTime() > now)
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime())[0];

  return NextResponse.json({
    ok: feedError === null,
    espn: {
      ok: feedError === null,
      error: feedError,
      fetchMs,
      matchesReturned: feed.length,
    },
    mapping: {
      mappedToFixture: matched,
      unmappedFromEspn: unmapped,
      currentlyLiveInDb: liveSnapshots.length,
      alreadySettled: settled.size,
    },
    autoRecord: {
      stabilityWindowMs: FT_STABILITY_WINDOW_MS,
      candidates: wouldAutoRecord,
    },
    next: nextKickoff ? {
      fixtureNumber: nextKickoff.fixtureNumber,
      stage: nextKickoff.stage,
      team1: nextKickoff.team1, team2: nextKickoff.team2,
      kickoffAt: nextKickoff.kickoffAt.toISOString(),
      msUntilKickoff: nextKickoff.kickoffAt.getTime() - now,
    } : null,
    fetchedAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("probe") === "1") {
    try {
      return await handleProbe();
    } catch (e) {
      logError("api/world-cup/live/probe", e);
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
  }
  try {
    const me = await requireWcAccess();
    const feed = await fetchEspnLive();
    if (feed.length === 0) {
      return NextResponse.json<LiveApiResponse>({ fetchedAt: new Date().toISOString(), matches: [] });
    }

    // Map feed to our fixtures. Skip matches that are already settled in our
    // wc_results — those should appear in the regular settled UI, not live.
    const fixtures = await db
      .select({
        fixtureNumber: wcFixtures.fixtureNumber,
        stage: wcFixtures.stage,
        groupName: wcFixtures.groupName,
        team1: wcFixtures.team1,
        team2: wcFixtures.team2,
        nextFixtureNumber: wcFixtures.nextFixtureNumber,
        nextSlot: wcFixtures.nextSlot,
        kickoffAt: wcFixtures.kickoffAt,
      })
      .from(wcFixtures);

    const settled = await db.select({ fixtureNumber: wcResults.fixtureNumber }).from(wcResults);
    const settledSet = new Set(settled.map((s) => s.fixtureNumber));
    const mapped = mapToFixtures(feed, fixtures).filter((m) => !settledSet.has(m.fixtureNumber));

    // Persist what ESPN sees so we have a "first time we saw final" stamp to
    // gate auto-recording against. Done up-front so the auto-record step has
    // accurate firstFinalAt values.
    const now = new Date();
    const currentLive = await db.select().from(wcLiveScores).where(inArray(wcLiveScores.fixtureNumber, mapped.map((m) => m.fixtureNumber)));
    const currentByFx = new Map(currentLive.map((r) => [r.fixtureNumber, r]));

    for (const m of mapped) {
      const existing = currentByFx.get(m.fixtureNumber);
      // firstFinalAt only set the first time we see status=final. Reset to
      // null if status flips back to live/halftime so the 30-min window
      // restarts cleanly when ESPN goes back to final.
      const incomingFinal = m.status === "final";
      const wasAlreadyFinal = existing?.status === "final";
      const firstFinalAt = incomingFinal
        ? (wasAlreadyFinal ? (existing?.firstFinalAt ?? now) : now)
        : null;

      await db
        .insert(wcLiveScores)
        .values({
          fixtureNumber: m.fixtureNumber,
          team1Goals: m.team1Goals,
          team2Goals: m.team2Goals,
          minute: m.minute,
          status: m.status,
          firstFinalAt,
          updatedAt: now,
          updatedByUserId: SYSTEM_USER_ID,
        })
        .onConflictDoUpdate({
          target: wcLiveScores.fixtureNumber,
          set: {
            team1Goals: m.team1Goals,
            team2Goals: m.team2Goals,
            minute: m.minute,
            status: m.status,
            firstFinalAt,
            updatedAt: now,
            updatedByUserId: SYSTEM_USER_ID,
          },
        });
    }

    // Auto-record group fixtures that have been final for >= the stability
    // window. Knockouts are left to the admin — we can't infer from the
    // final score alone whether ET/pens were needed, and that data has to
    // be entered by hand.
    const autoRecorded: number[] = [];
    for (const m of mapped) {
      if (m.status !== "final") continue;
      if (m.stage !== "group") continue;
      const existing = currentByFx.get(m.fixtureNumber);
      const firstFinalAt = existing?.firstFinalAt ?? now;
      if (now.getTime() - firstFinalAt.getTime() < FT_STABILITY_WINDOW_MS) continue;

      const fxFull = fixtures.find((f) => f.fixtureNumber === m.fixtureNumber);
      if (!fxFull || !fxFull.team1 || !fxFull.team2) continue;
      const winner = winnerForGroup(m.team1Goals, m.team2Goals, fxFull.team1, fxFull.team2);
      try {
        await commitFixtureResult({
          fx: fxFull,
          team1Goals: m.team1Goals,
          team2Goals: m.team2Goals,
          winnerTeam: winner,
          settledByUserId: SYSTEM_USER_ID,
          now,
        });
        autoRecorded.push(m.fixtureNumber);
        logInfo("api/world-cup/live/auto-record", "settled fixture", {
          fixtureNumber: m.fixtureNumber,
          team1: fxFull.team1,
          team2: fxFull.team2,
          score: `${m.team1Goals}-${m.team2Goals}`,
        });
      } catch (e) {
        logError("api/world-cup/live/auto-record", e, { fixtureNumber: m.fixtureNumber });
      }
    }

    // After auto-recording, refresh the settled set so the response below
    // doesn't keep returning the just-finalised matches as still live.
    for (const n of autoRecorded) settledSet.add(n);
    const stillLive = mapped.filter((m) => !settledSet.has(m.fixtureNumber));
    if (stillLive.length === 0) {
      return NextResponse.json<LiveApiResponse>({ fetchedAt: now.toISOString(), matches: [] });
    }

    // Batch-fetch all predictions for the live fixtures so the projection
    // computation is a single SQL round trip rather than N.
    const fixtureNumbers = stillLive.map((m) => m.fixtureNumber);
    const preds = await db
      .select({
        fixtureNumber: wcPredictions.fixtureNumber,
        userId: wcPredictions.userId,
        team1Goals: wcPredictions.team1Goals,
        team2Goals: wcPredictions.team2Goals,
        name: usersTable.name,
      })
      .from(wcPredictions)
      .innerJoin(usersTable, sql`${usersTable.id} = ${wcPredictions.userId}`)
      .where(inArray(wcPredictions.fixtureNumber, fixtureNumbers));

    const out: LiveApiResponse["matches"] = stillLive.map((m: MappedLiveMatch) => {
      const fixturePreds = preds.filter((p) => p.fixtureNumber === m.fixtureNumber);
      const scored = fixturePreds.map((p) => {
        const pts = scorePrediction(
          { team1Goals: p.team1Goals, team2Goals: p.team2Goals },
          { team1Goals: m.team1Goals, team2Goals: m.team2Goals },
          m.stage,
        );
        return { userId: p.userId, name: p.name, pickT1: p.team1Goals, pickT2: p.team2Goals, points: pts.total };
      });
      const sorted = [...scored].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
      const top5 = sorted.slice(0, 5).map(({ name, pickT1, pickT2, points }) => ({ name, pickT1, pickT2, points }));
      const mine = scored.find((p) => p.userId === me.id);

      // For knockouts that ESPN says are final but we haven't auto-recorded,
      // expose how long they've been pending so the admin UI can hint
      // "ESPN has reported FT for X minutes — confirm in the Results tab".
      const existing = currentByFx.get(m.fixtureNumber);
      let pendingAdminMs: number | undefined;
      if (m.status === "final" && m.stage !== "group" && existing?.firstFinalAt) {
        pendingAdminMs = now.getTime() - existing.firstFinalAt.getTime();
      }

      return {
        fixtureNumber: m.fixtureNumber,
        stage: m.stage,
        groupName: m.groupName,
        team1: m.team1,
        team2: m.team2,
        team1Goals: m.team1Goals,
        team2Goals: m.team2Goals,
        minute: m.minute,
        status: m.status as "live" | "halftime" | "final",
        projected: top5,
        me: mine ? { pickT1: mine.pickT1, pickT2: mine.pickT2, points: mine.points } : null,
        pendingAdminMs,
      };
    });

    // Clear any wc_live_scores rows for fixtures that just auto-settled — the
    // settle helper already does this, but defence-in-depth here in case of
    // any race-y partial commits.
    if (autoRecorded.length > 0) {
      await db.delete(wcLiveScores).where(inArray(wcLiveScores.fixtureNumber, autoRecorded));
    }

    // Also clean up rows for fixtures the feed has stopped reporting (i.e.
    // they're no longer in `mapped`). Otherwise stale rows would linger.
    const mappedSet = new Set(mapped.map((m) => m.fixtureNumber));
    const orphans = currentLive.filter((r) => !mappedSet.has(r.fixtureNumber));
    if (orphans.length > 0) {
      await db.delete(wcLiveScores).where(inArray(wcLiveScores.fixtureNumber, orphans.map((o) => o.fixtureNumber)));
    }
    void eq; // import kept for parity with refactors

    return NextResponse.json<LiveApiResponse>({
      fetchedAt: now.toISOString(),
      matches: out,
    });
  } catch (e) {
    logError("api/world-cup/live", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
