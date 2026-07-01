import "server-only";
import { updateTag } from "next/cache";
import { db } from "@/db";
import { wcFixtures, wcLiveScores, wcPredictions, wcResults } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { computeBestThirds, computeGroupStandings, scorePrediction } from "./world-cup-scoring";
import { WC_CACHE_TAGS } from "./world-cup-data";
import { resolveAnnexC } from "./wc-annex-c";

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

// Fill R32 team slots eagerly as each group completes its 6 games. Two
// passes:
//
//   1. Per-group: as soon as a group has all 6 of its games settled,
//      its 1st-place ("A1") and 2nd-place ("A2") seeds are mapped and
//      written into matching R32 slots. Doesn't wait for the whole
//      stage to be done — predictions on matches involving two
//      already-determined groups can open as soon as both are final.
//
//   2. Best-thirds (global): the eight "T1"…"T8" seeds can only resolve
//      once every group's third-place team is known, so this second
//      pass only fires when all 12 groups are complete.
//
// Idempotent — only writes blank slots, so manual admin team-fills
// take precedence and re-running on every result settle is safe.
//
// Exported so the schema-ensure pipeline can call it as a one-shot
// backfill — covers the case where group results were already settled
// before this propagation code shipped (commitFixtureResult only fires
// it when a new result lands).
export async function maybePopulateR32(_settledByUserId: string): Promise<boolean> {
  const groupFixtures = await db.select().from(wcFixtures).where(eq(wcFixtures.stage, "group"));
  if (groupFixtures.length === 0) return false;

  const settledRows = await db.select().from(wcResults);
  const settledByFx = new Map(settledRows.map((r) => [r.fixtureNumber, r]));

  // Group fixtures by group letter for per-group settle checks.
  const byGroup = new Map<string, typeof groupFixtures>();
  for (const f of groupFixtures) {
    if (!f.groupName) continue;
    const list = byGroup.get(f.groupName) ?? [];
    list.push(f);
    byGroup.set(f.groupName, list);
  }

  // Build seed → team map. A1 / A2 from groups that have all six games
  // settled; T1…T8 only when EVERY group is done.
  const seedToTeam: Record<string, string> = {};
  const completeGroupStandings: Array<{ groupName: string; standings: ReturnType<typeof computeGroupStandings> }> = [];
  let allGroupsComplete = true;

  for (const [groupName, fxs] of byGroup) {
    const allSettled = fxs.every((f) => settledByFx.has(f.fixtureNumber));
    if (!allSettled) {
      allGroupsComplete = false;
      continue;
    }
    const teams = Array.from(new Set(fxs.flatMap((f) => [f.team1, f.team2].filter((t): t is string => !!t))));
    const settled = fxs
      .map((f) => settledByFx.get(f.fixtureNumber))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => {
        const fx = fxs.find((x) => x.fixtureNumber === r.fixtureNumber)!;
        return { team1: fx.team1!, team2: fx.team2!, team1Goals: r.team1Goals, team2Goals: r.team2Goals };
      });
    const standings = computeGroupStandings(teams, settled);
    completeGroupStandings.push({ groupName, standings });
    if (standings[0]) seedToTeam[`${groupName}1`] = standings[0].team;
    if (standings[1]) seedToTeam[`${groupName}2`] = standings[1].team;
  }

  // Per-match best-third assignment — only possible once every group's
  // third-place row is known, because the Annex C lookup needs the set
  // of which 8 groups produce qualifying thirds. Returns a Map<match,
  // teamName>; null when the lookup hasn't been seeded yet (insufficient
  // groups complete).
  let thirdsByMatch: Map<number, string> | null = null;
  if (allGroupsComplete) {
    const bestThirds = computeBestThirds(completeGroupStandings);
    if (bestThirds.length === 8) {
      const qualifyingGroups = new Set(bestThirds.map((b) => b.groupName));
      const annex = resolveAnnexC(qualifyingGroups);
      if (annex) {
        thirdsByMatch = new Map();
        // annex maps R32 matchNumber → groupLetter. The team for that
        // slot is whichever of the qualifying thirds came from that group.
        for (const [matchNo, groupLetter] of annex) {
          const winner = bestThirds.find((b) => b.groupName === groupLetter);
          if (winner) thirdsByMatch.set(matchNo, winner.team);
        }
      }
    }
  }

  // Update every R32 fixture whose team slots are blank AND whose seed
  // resolves to a known team. Anything we can't resolve yet stays null.
  // The team1Seed/team2Seed "3?" is the sentinel for a best-third slot —
  // populated only from the Annex C lookup above.
  const r32 = await db.select().from(wcFixtures).where(eq(wcFixtures.stage, "r32"));
  let changed = false;
  for (const fx of r32) {
    const updates: Record<string, string> = {};
    if (!fx.team1) {
      if (fx.team1Seed === "3?" && thirdsByMatch?.has(fx.fixtureNumber)) {
        updates.team1 = thirdsByMatch.get(fx.fixtureNumber)!;
      } else if (fx.team1Seed && seedToTeam[fx.team1Seed]) {
        updates.team1 = seedToTeam[fx.team1Seed];
      }
    }
    if (!fx.team2) {
      if (fx.team2Seed === "3?" && thirdsByMatch?.has(fx.fixtureNumber)) {
        updates.team2 = thirdsByMatch.get(fx.fixtureNumber)!;
      } else if (fx.team2Seed && seedToTeam[fx.team2Seed]) {
        updates.team2 = seedToTeam[fx.team2Seed];
      }
    }
    if (Object.keys(updates).length === 0) continue;
    await db.update(wcFixtures).set(updates).where(eq(wcFixtures.fixtureNumber, fx.fixtureNumber));
    changed = true;
  }
  if (changed) {
    // Bust the bracket cache so the populated teams show up on the
    // next render. Outside a render scope (e.g. boot pipeline) the
    // call no-ops, in which case the cache will refresh on its own
    // schedule. commitFixtureResult's caller still tags fixtures too.
    try { updateTag(WC_CACHE_TAGS.fixtures); } catch { /* no-op outside render */ }
  }
  void _settledByUserId;
  void and;
  return changed;
}

// Full rebuild of R16/QF/SF/Third/Final team slots from settled upstream
// results using the CURRENT next_fixture_number / next_slot wiring on
// wc_fixtures. Used when the seed's bracket wiring has changed and the
// existing downstream team slots contain values written under the old
// wiring (e.g. Match 89.team2 = Paraguay when it should be Morocco).
//
// Steps:
//   1. Load every knockout fixture + every settled result.
//   2. Snapshot current team1/team2 for each fixture into a mutable map.
//   3. Blank the map for r16/qf/sf/third/final — those will be rebuilt.
//      R32 team slots come from group standings via maybePopulateR32,
//      so they're left alone.
//   4. Walk r32 → r16 → qf → sf, propagating each settled winner into
//      its next_slot on next_fixture_number. Also mirror sf loser into
//      the 3rd-place playoff (fixture 103) exactly as commitFixture
//      Result does per-match.
//   5. Diff against the pre-snapshot; write only fixtures where the
//      team pair actually changed.
//
// Idempotent — running it against an already-correct bracket is a no-op.
// Called from ensureWorldCupTables so existing prod boxes self-heal on
// the next boot after a seed correction ships. Also exposed as an admin
// action so wc_admin can force a rebuild without waiting for the pipeline.
export async function rewireKnockouts(): Promise<boolean> {
  const knockouts = await db
    .select()
    .from(wcFixtures)
    .where(sql`${wcFixtures.stage} IN ('r32','r16','qf','sf','third','final')`);
  if (knockouts.length === 0) return false;

  const results = await db.select().from(wcResults);
  const resultByFx = new Map(results.map((r) => [r.fixtureNumber, r]));

  // Snapshot current team pairs so we can diff at the end.
  const before = new Map<number, { team1: string | null; team2: string | null }>();
  const after = new Map<number, { team1: string | null; team2: string | null }>();
  for (const fx of knockouts) {
    before.set(fx.fixtureNumber, { team1: fx.team1, team2: fx.team2 });
    // r16 onwards gets rebuilt from scratch; r32 keeps its group-derived
    // team names in place (population is maybePopulateR32's job).
    after.set(fx.fixtureNumber, fx.stage === "r32"
      ? { team1: fx.team1, team2: fx.team2 }
      : { team1: null, team2: null });
  }

  // Propagate settled winners forward, one stage at a time. Because the
  // walk is topologically ordered, by the time we process a fixture its
  // team1/team2 in `after` are already set to whatever the previous
  // rounds' propagation produced — which means the SF-loser lookup for
  // the 3rd-place playoff sees the correct QF winners.
  const stageOrder = ["r32", "r16", "qf", "sf"] as const;
  for (const stage of stageOrder) {
    for (const fx of knockouts) {
      if (fx.stage !== stage) continue;
      const r = resultByFx.get(fx.fixtureNumber);
      if (!r || !fx.nextFixtureNumber || !fx.nextSlot) continue;
      if (r.winnerTeam === "Draw") continue;
      const target = after.get(fx.nextFixtureNumber);
      if (!target) continue;
      if (fx.nextSlot === "t1") target.team1 = r.winnerTeam;
      else if (fx.nextSlot === "t2") target.team2 = r.winnerTeam;

      // SF loser feeds the 3rd-place playoff. Read team1/team2 from the
      // rebuilt `after` map so we don't rely on the pre-rebuild snapshot
      // (which might contain stale names under the old wiring).
      if (fx.stage === "sf") {
        const sfState = after.get(fx.fixtureNumber);
        if (sfState?.team1 && sfState?.team2) {
          const loser = r.winnerTeam === sfState.team1 ? sfState.team2 : sfState.team1;
          const third = after.get(103);
          if (third) {
            if (fx.fixtureNumber === 101) third.team1 = loser;
            else if (fx.fixtureNumber === 102) third.team2 = loser;
          }
        }
      }
    }
  }

  // Diff and apply.
  let changed = false;
  for (const [fixtureNumber, next] of after) {
    const prev = before.get(fixtureNumber);
    if (!prev) continue;
    if (prev.team1 === next.team1 && prev.team2 === next.team2) continue;
    await db
      .update(wcFixtures)
      .set({ team1: next.team1, team2: next.team2 })
      .where(eq(wcFixtures.fixtureNumber, fixtureNumber));
    changed = true;
  }
  if (changed) {
    try { updateTag(WC_CACHE_TAGS.fixtures); } catch { /* no-op outside render */ }
  }
  return changed;
}
