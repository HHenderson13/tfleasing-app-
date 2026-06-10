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

export interface LivePlayerEntry {
  name: string;
  pickT1: number;
  pickT2: number;
  points: number;
  isMe: boolean;
}

export interface LiveApiResponse {
  fetchedAt: string;
  // Viewer's standing on the OVERALL leaderboard right now vs if every
  // currently-live match locked in at its present score. Null when the
  // viewer has no predictions on any active or live match.
  viewer: {
    currentTotalPoints: number;
    projectedTotalPoints: number;
    currentRank: number;          // 1-indexed; 0 = unranked
    projectedRank: number;
    totalPlayers: number;
  } | null;
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
    players: LivePlayerEntry[];   // every player with a pick on this fixture, sorted by points desc
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

  // Per-match diagnosis so the admin can tell at a glance whether each ESPN
  // entry: (a) is scheduled (no live data yet — fine before kick-off),
  // (b) maps cleanly to a fixture, or (c) is an unrelated game / a name
  // mismatch we need to alias.
  const mapped = mapToFixtures(feed, fixtures);
  const mappedByEspnId = new Map(mapped.map((m) => [m.espnId, m]));
  const now = Date.now();
  const matches = feed.map((m) => {
    const fx = mappedByEspnId.get(m.espnId);
    let reason: "mapped" | "scheduled" | "no_fixture_match" = "mapped";
    if (!fx) reason = m.status === "scheduled" ? "scheduled" : "no_fixture_match";
    // When unmapped + not scheduled, surface the closest fixture in time
    // so admin can eyeball whether it's an alias problem ("ESPN says
    // Korea Republic, our DB has South Korea") vs a non-WC game.
    let nearestFixture: { fixtureNumber: number; team1: string | null; team2: string | null; kickoffDeltaMs: number } | null = null;
    if (reason === "no_fixture_match") {
      const sorted = [...fixtures].sort((a, b) =>
        Math.abs(a.kickoffAt.getTime() - m.kickoffAt.getTime()) -
        Math.abs(b.kickoffAt.getTime() - m.kickoffAt.getTime()),
      );
      const closest = sorted[0];
      if (closest) {
        nearestFixture = {
          fixtureNumber: closest.fixtureNumber,
          team1: closest.team1,
          team2: closest.team2,
          kickoffDeltaMs: closest.kickoffAt.getTime() - m.kickoffAt.getTime(),
        };
      }
    }
    return {
      espnId: m.espnId,
      team1: m.team1,
      team2: m.team2,
      kickoffAt: m.kickoffAt.toISOString(),
      status: m.status,
      score: `${m.team1Goals}-${m.team2Goals}`,
      reason,
      mappedToFixtureNumber: fx?.fixtureNumber ?? null,
      nearestFixture,
    };
  });

  const matched = matches.filter((m) => m.reason === "mapped").length;
  const scheduledUnmapped = matches.filter((m) => m.reason === "scheduled").length;
  const reallyUnmapped = matches.filter((m) => m.reason === "no_fixture_match").length;

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
      scheduledUnmapped,       // ESPN sees them but they're not live yet — expected pre-kick-off
      reallyUnmapped,          // live / final but team names don't match — needs investigation
      currentlyLiveInDb: liveSnapshots.length,
      alreadySettled: settled.size,
    },
    matches,
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
      return NextResponse.json<LiveApiResponse>({ fetchedAt: new Date().toISOString(), viewer: null, matches: [] });
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
      return NextResponse.json<LiveApiResponse>({ fetchedAt: now.toISOString(), viewer: null, matches: [] });
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

    // Pre-score every prediction once so we can reuse the numbers in both the
    // per-match player list and the overall leaderboard delta calculation.
    interface ScoredPred { fixtureNumber: number; userId: string; name: string; pickT1: number; pickT2: number; points: number; }
    const scored: ScoredPred[] = preds.map((p) => {
      const m = stillLive.find((sl) => sl.fixtureNumber === p.fixtureNumber)!;
      const pts = scorePrediction(
        { team1Goals: p.team1Goals, team2Goals: p.team2Goals },
        { team1Goals: m.team1Goals, team2Goals: m.team2Goals },
        m.stage,
      );
      return { fixtureNumber: p.fixtureNumber, userId: p.userId, name: p.name, pickT1: p.team1Goals, pickT2: p.team2Goals, points: pts.total };
    });

    // Leaderboard delta — viewer's current rank vs projected rank if every
    // live match locked in at its present score. Computed across ALL users
    // who've ever predicted anything (settled or otherwise), so the rank
    // reflects the real cohort, not just live-match participants.
    const totalsRows = await db
      .select({
        userId: wcPredictions.userId,
        name: usersTable.name,
        total: sql<number>`COALESCE(SUM(${wcPredictions.points}), 0)`,
      })
      .from(wcPredictions)
      .innerJoin(usersTable, sql`${usersTable.id} = ${wcPredictions.userId}`)
      .where(sql`${wcPredictions.points} IS NOT NULL`)
      .groupBy(wcPredictions.userId, usersTable.name);

    const currentByUser = new Map<string, { name: string; total: number }>();
    for (const r of totalsRows) currentByUser.set(r.userId, { name: r.name, total: Number(r.total) });
    // Include players who haven't settled any predictions yet but DO have a
    // pick on a live match — they should be on the projected ranking.
    for (const s of scored) {
      if (!currentByUser.has(s.userId)) currentByUser.set(s.userId, { name: s.name, total: 0 });
    }

    const projectedByUser = new Map<string, { name: string; total: number }>();
    for (const [uid, v] of currentByUser) projectedByUser.set(uid, { name: v.name, total: v.total });
    for (const s of scored) {
      const cur = projectedByUser.get(s.userId);
      if (cur) cur.total += s.points;
    }

    const rankOf = (map: Map<string, { name: string; total: number }>, uid: string) => {
      const arr = Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
      arr.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      const idx = arr.findIndex((x) => x.id === uid);
      return idx === -1 ? 0 : idx + 1;
    };
    const viewerCurrent = currentByUser.get(me.id)?.total ?? 0;
    const viewerProjected = projectedByUser.get(me.id)?.total ?? viewerCurrent;
    const viewer: LiveApiResponse["viewer"] = currentByUser.has(me.id)
      ? {
          currentTotalPoints: viewerCurrent,
          projectedTotalPoints: viewerProjected,
          currentRank: rankOf(currentByUser, me.id),
          projectedRank: rankOf(projectedByUser, me.id),
          totalPlayers: currentByUser.size,
        }
      : null;

    const out: LiveApiResponse["matches"] = stillLive.map((m: MappedLiveMatch) => {
      const players: LivePlayerEntry[] = scored
        .filter((p) => p.fixtureNumber === m.fixtureNumber)
        .map(({ name, pickT1, pickT2, points, userId }) => ({ name, pickT1, pickT2, points, isMe: userId === me.id }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

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
        players,
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
      viewer,
      matches: out,
    });
  } catch (e) {
    logError("api/world-cup/live", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
