import { NextResponse } from "next/server";
import { db } from "@/db";
import { wcFixtures, wcPredictions, users as usersTable, wcResults } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";
import { requireWcAccess } from "@/lib/auth-guard";
import { fetchEspnLive, mapToFixtures, type MappedLiveMatch } from "@/lib/world-cup-live-feed";
import { scorePrediction } from "@/lib/world-cup-scoring";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
// The fetch() to ESPN has next: { revalidate: 10 } — caching is per-URL, so
// every caller in the next 10s shares the same upstream response.
export const dynamic = "force-dynamic";

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
  }>;
}

export async function GET() {
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
        kickoffAt: wcFixtures.kickoffAt,
      })
      .from(wcFixtures);

    const settled = await db.select({ fixtureNumber: wcResults.fixtureNumber }).from(wcResults);
    const settledSet = new Set(settled.map((s) => s.fixtureNumber));
    const mapped = mapToFixtures(feed, fixtures).filter((m) => !settledSet.has(m.fixtureNumber));
    if (mapped.length === 0) {
      return NextResponse.json<LiveApiResponse>({ fetchedAt: new Date().toISOString(), matches: [] });
    }

    // Batch-fetch all predictions for the live fixtures so the projection
    // computation is a single SQL round trip rather than N.
    const fixtureNumbers = mapped.map((m) => m.fixtureNumber);
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

    const out: LiveApiResponse["matches"] = mapped.map((m: MappedLiveMatch) => {
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
      };
    });

    return NextResponse.json<LiveApiResponse>({
      fetchedAt: new Date().toISOString(),
      matches: out,
    });
  } catch (e) {
    logError("api/world-cup/live", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
