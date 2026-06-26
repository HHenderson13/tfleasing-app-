import "server-only";
import { updateTag } from "next/cache";
import { db } from "@/db";
import { wcFixtures, wcLiveScores, wcPredictions, wcResults } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { computeBestThirds, computeGroupStandings, scorePrediction } from "./world-cup-scoring";
import { WC_CACHE_TAGS } from "./world-cup-data";

// Sentinel user id used when the auto-record path (ESPN feed) settles a
// fixture without a human admin involved. Stored in wc_results.settled_by_
// user_id and wc_live_scores.updated_by_user_id so the admin can audit
// which entries were system-driven.
export const SYSTEM_USER_ID = "system:espn-feed";

export interface SettleInput {
  fx: {
    fixtureNumber: number;
    stage: string;
    groupName: string | null;
    team1: string | null;
    team2: string | null;
    nextFixtureNumber: number | null;
    nextSlot: string | null;
  };
  team1Goals: number;
  team2Goals: number;
  etTeam1Goals?: number | null;
  etTeam2Goals?: number | null;
  penTeam1?: number | null;
  penTeam2?: number | null;
  winnerTeam: string;
  settledByUserId: string;
  now?: Date;
}

export interface SettleOutcome {
  advancedTo: { fixtureNumber: number; slot: "t1" | "t2" } | null;
}

// Persist a final result and propagate every downstream side effect:
//   - upsert wc_results
//   - rescore each wc_predictions row for this fixture
//   - advance the bracket (for knockouts) — winner to the next slot, SF
//     loser to the 3rd-place playoff
//   - clear the wc_live_scores row (the live snapshot is now stale)
//
// Called by both the admin recordResultAction (manual) and the live API
// route (auto-record from the ESPN feed). No auth or input validation —
// the caller is responsible for both.
export async function commitFixtureResult(input: SettleInput): Promise<SettleOutcome> {
  const now = input.now ?? new Date();
  const { fx } = input;

  await db
    .insert(wcResults)
    .values({
      fixtureNumber: fx.fixtureNumber,
      team1Goals: input.team1Goals,
      team2Goals: input.team2Goals,
      etTeam1Goals: input.etTeam1Goals ?? null,
      etTeam2Goals: input.etTeam2Goals ?? null,
      penTeam1: input.penTeam1 ?? null,
      penTeam2: input.penTeam2 ?? null,
      winnerTeam: input.winnerTeam,
      settledAt: now,
      settledByUserId: input.settledByUserId,
    })
    .onConflictDoUpdate({
      target: wcResults.fixtureNumber,
      set: {
        team1Goals: input.team1Goals,
        team2Goals: input.team2Goals,
        etTeam1Goals: input.etTeam1Goals ?? null,
        etTeam2Goals: input.etTeam2Goals ?? null,
        penTeam1: input.penTeam1 ?? null,
        penTeam2: input.penTeam2 ?? null,
        winnerTeam: input.winnerTeam,
        settledAt: now,
        settledByUserId: input.settledByUserId,
      },
    });

  // Rescore every prediction. Re-runs on an edited result so a typo
  // correction propagates to the leaderboard cleanly.
  const predRows = await db.select().from(wcPredictions).where(eq(wcPredictions.fixtureNumber, fx.fixtureNumber));
  for (const p of predRows) {
    const pts = scorePrediction(
      { team1Goals: p.team1Goals, team2Goals: p.team2Goals },
      { team1Goals: input.team1Goals, team2Goals: input.team2Goals },
      fx.stage,
    );
    await db.update(wcPredictions).set({ points: pts.total, updatedAt: now }).where(eq(wcPredictions.id, p.id));
  }

  // Auto-advance: write the winner into the next fixture's slot. Knockouts
  // only (group matches have nextFixtureNumber = null) and only on a
  // decisive result (no draws in knockouts).
  let advancedTo: SettleOutcome["advancedTo"] = null;
  if (fx.nextFixtureNumber && fx.nextSlot && input.winnerTeam !== "Draw") {
    const slot = fx.nextSlot as "t1" | "t2";
    await db
      .update(wcFixtures)
      .set({ [slot === "t1" ? "team1" : "team2"]: input.winnerTeam } as Record<string, string>)
      .where(eq(wcFixtures.fixtureNumber, fx.nextFixtureNumber));
    advancedTo = { fixtureNumber: fx.nextFixtureNumber, slot };
    // SF losers also feed into the 3rd-place playoff (match 103).
    if (fx.stage === "sf" && fx.team1 && fx.team2) {
      const sfLoser = input.winnerTeam === fx.team1 ? fx.team2 : fx.team1;
      const sfSlot = fx.fixtureNumber === 101 ? "team1" : "team2";
      await db.update(wcFixtures).set({ [sfSlot]: sfLoser } as Record<string, string>).where(eq(wcFixtures.fixtureNumber, 103));
    }
  }

  // The live snapshot is meaningless once the canonical result is in.
  await db.delete(wcLiveScores).where(eq(wcLiveScores.fixtureNumber, fx.fixtureNumber));

  // If this was a group game and ALL group games are now settled, fill
  // every R32 team slot from group standings + best-third rankings.
  // Predictions on those R32 matches automatically open up because
  // savePredictionAction only requires team1 + team2 to be non-null
  // and kickoff to be in the future.
  let r32Populated = false;
  if (fx.stage === "group") {
    r32Populated = await maybePopulateR32(input.settledByUserId);
  }

  // Bust the global caches that depend on results / fixtures (the bracket
  // may have just advanced a team). loadGroupViewsCached, loadKnockoutBracket
  // Cached, and loadAllFixturesCached all key off these tags. Next 16 uses
  // updateTag() instead of revalidateTag() for read-your-own-writes from
  // server actions.
  updateTag(WC_CACHE_TAGS.results);
  if (advancedTo || r32Populated) updateTag(WC_CACHE_TAGS.fixtures);

  return { advancedTo };
}

// Fill every R32 team slot once every group game has a settled result.
// Resolves the seed strings ("A1", "B2", … or "T1"…"T8") on each R32
// fixture against the live group standings + best-thirds ranking. No-op
// when:
//   - the group stage isn't complete yet
//   - the R32 slots are already populated (e.g. admin filled them
//     manually before propagation ran)
async function maybePopulateR32(_settledByUserId: string): Promise<boolean> {
  // 1. All 72 group games settled?
  const groupFixtures = await db.select().from(wcFixtures).where(eq(wcFixtures.stage, "group"));
  if (groupFixtures.length === 0) return false;
  const settledRows = await db.select().from(wcResults);
  const settledByFx = new Map(settledRows.map((r) => [r.fixtureNumber, r]));
  const allSettled = groupFixtures.every((f) => settledByFx.has(f.fixtureNumber));
  if (!allSettled) return false;

  // 2. Compute per-group standings.
  const byGroup = new Map<string, typeof groupFixtures>();
  for (const f of groupFixtures) {
    if (!f.groupName) continue;
    const list = byGroup.get(f.groupName) ?? [];
    list.push(f);
    byGroup.set(f.groupName, list);
  }
  const groupStandings: Array<{ groupName: string; standings: ReturnType<typeof computeGroupStandings> }> = [];
  for (const [groupName, fxs] of byGroup) {
    const teams = Array.from(new Set(fxs.flatMap((f) => [f.team1, f.team2].filter((t): t is string => !!t))));
    const settled = fxs
      .map((f) => settledByFx.get(f.fixtureNumber))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => {
        const fx = fxs.find((x) => x.fixtureNumber === r.fixtureNumber)!;
        return { team1: fx.team1!, team2: fx.team2!, team1Goals: r.team1Goals, team2Goals: r.team2Goals };
      });
    groupStandings.push({ groupName, standings: computeGroupStandings(teams, settled) });
  }

  // 3. Best third-place finishers.
  const bestThirds = computeBestThirds(groupStandings);

  // 4. Build the seed → team name lookup.
  const seedToTeam: Record<string, string> = {};
  for (const { groupName, standings } of groupStandings) {
    if (standings[0]) seedToTeam[`${groupName}1`] = standings[0].team;
    if (standings[1]) seedToTeam[`${groupName}2`] = standings[1].team;
  }
  bestThirds.forEach((row, i) => {
    seedToTeam[`T${i + 1}`] = row.team;
  });

  // 5. Update every R32 fixture whose team slots are still blank. Leave
  // manually-filled slots untouched so admin overrides win.
  const r32 = await db.select().from(wcFixtures).where(eq(wcFixtures.stage, "r32"));
  let changed = false;
  for (const fx of r32) {
    const updates: Record<string, string> = {};
    if (!fx.team1 && fx.team1Seed && seedToTeam[fx.team1Seed]) updates.team1 = seedToTeam[fx.team1Seed];
    if (!fx.team2 && fx.team2Seed && seedToTeam[fx.team2Seed]) updates.team2 = seedToTeam[fx.team2Seed];
    if (Object.keys(updates).length === 0) continue;
    await db.update(wcFixtures).set(updates).where(eq(wcFixtures.fixtureNumber, fx.fixtureNumber));
    changed = true;
  }
  // Reference the unused param so linter stays quiet; preserved for
  // future audit trail support.
  void _settledByUserId;
  void and;
  return changed;
}
