import "server-only";
import { db } from "@/db";
import { wcFixtures, wcLiveScores, wcPredictions, wcResults } from "@/db/schema";
import { eq } from "drizzle-orm";
import { scorePrediction } from "./world-cup-scoring";

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

  return { advancedTo };
}
