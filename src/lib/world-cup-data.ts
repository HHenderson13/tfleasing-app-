import "server-only";
import { db } from "@/db";
import { wcFixtures, wcPayments, wcPredictions, wcResults, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { computeGroupStandings, type GroupStandingRow } from "./world-cup-scoring";

// Payment deadline — past this point, unpaid players are removed from the
// game. The tournament starts 11 June 2026, so the cut-off is the day before.
// Stored UTC so the comparison is unambiguous across timezones.
export const PAYMENT_DEADLINE = new Date("2026-06-10T23:00:00.000Z"); // midnight BST
export const PAYMENT_BANK = {
  payee: "Jacob Birch",
  sortCode: "04-00-75",
  accountNumber: "73131571",
} as const;

export async function getPaidUserIds(): Promise<Set<string>> {
  const rows = await db.select({ userId: wcPayments.userId }).from(wcPayments);
  return new Set(rows.map((r) => r.userId));
}

export async function isUserPaid(userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: wcPayments.userId }).from(wcPayments).where(eq(wcPayments.userId, userId)).limit(1);
  return !!row;
}

export interface FixtureRow {
  fixtureNumber: number;
  stage: string;
  groupName: string | null;
  kickoffAt: Date;
  stadium: string | null;
  city: string | null;
  team1: string | null;
  team2: string | null;
}

export interface FixtureWithMyPrediction extends FixtureRow {
  result: {
    team1Goals: number;
    team2Goals: number;
    winnerTeam: string;
  } | null;
  myPrediction: {
    team1Goals: number;
    team2Goals: number;
    predictedWinner: string;
    points: number | null;
  } | null;
  lockedAt: Date; // kickoff time — predictions become read-only after this
  isLocked: boolean;
}

export async function listFixturesWithMyPredictions(userId: string): Promise<FixtureWithMyPrediction[]> {
  // One SQL roundtrip per table; assembling client-side is simpler than a
  // multi-join with optional pieces.
  const [fixtures, results, predictions] = await Promise.all([
    db.select().from(wcFixtures).orderBy(wcFixtures.kickoffAt, wcFixtures.fixtureNumber),
    db.select().from(wcResults),
    db.select().from(wcPredictions).where(eq(wcPredictions.userId, userId)),
  ]);

  const resultByFx = new Map(results.map((r) => [r.fixtureNumber, r]));
  const predByFx = new Map(predictions.map((p) => [p.fixtureNumber, p]));
  const now = Date.now();

  return fixtures.map((f) => {
    const r = resultByFx.get(f.fixtureNumber);
    const p = predByFx.get(f.fixtureNumber);
    const lockedAt = f.kickoffAt;
    return {
      fixtureNumber: f.fixtureNumber,
      stage: f.stage,
      groupName: f.groupName,
      kickoffAt: f.kickoffAt,
      stadium: f.stadium,
      city: f.city,
      team1: f.team1,
      team2: f.team2,
      result: r
        ? { team1Goals: r.team1Goals, team2Goals: r.team2Goals, winnerTeam: r.winnerTeam }
        : null,
      myPrediction: p
        ? { team1Goals: p.team1Goals, team2Goals: p.team2Goals, predictedWinner: p.predictedWinner, points: p.points }
        : null,
      lockedAt,
      isLocked: lockedAt.getTime() <= now,
    };
  });
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  totalPoints: number;
  predictionsMade: number;
  exactScores: number;
  correctResults: number;
}

// Aggregates points across all settled wc_predictions for every user with
// the wc or wc_admin role. Users with no predictions still appear (0 pts) so
// the office can see who has joined.
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  // Join users with their points aggregated from wc_predictions. We include
  // every user whose roles JSON includes "wc" OR "wc_admin" OR "admin".
  const rows = await db.all<{
    user_id: string;
    name: string;
    total: number;
    made: number;
    exact: number;
    correct: number;
  }>(sql`
    SELECT
      u.id    AS user_id,
      u.name  AS name,
      COALESCE(SUM(CASE WHEN p.points IS NOT NULL THEN p.points END), 0) AS total,
      COUNT(p.id) AS made,
      SUM(CASE WHEN p.points >= 5 THEN 1 ELSE 0 END) AS exact,
      SUM(CASE WHEN p.points >= 3 THEN 1 ELSE 0 END) AS correct
    FROM users u
    LEFT JOIN wc_predictions p ON p.user_id = u.id
    WHERE u.roles LIKE '%"wc"%'
       OR u.roles LIKE '%"wc_admin"%'
    GROUP BY u.id
    ORDER BY total DESC, made DESC, name ASC
  `);

  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    totalPoints: Number(r.total) || 0,
    predictionsMade: Number(r.made) || 0,
    exactScores: Number(r.exact) || 0,
    correctResults: Number(r.correct) || 0,
  }));
}

// Returns the user's predictions for SETTLED fixtures only — used by the
// public "see this player's history" page so a quick look at someone's
// picks doesn't reveal what they've predicted for matches still to come.
export interface PlayerHistoryRow {
  fixtureNumber: number;
  stage: string;
  groupName: string | null;
  kickoffAt: Date;
  team1: string;
  team2: string;
  actual: { team1Goals: number; team2Goals: number; winnerTeam: string };
  pick: { team1Goals: number; team2Goals: number; predictedWinner: string; points: number | null } | null;
}

export async function loadPlayerHistory(userId: string): Promise<{
  player: { id: string; name: string; totalPoints: number; predictionsMade: number };
  rows: PlayerHistoryRow[];
} | null> {
  const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;

  // Only settled fixtures are returned, so any "what did Sarah pick for
  // tomorrow" question is structurally impossible from this query.
  const rows = await db.all<{
    fixture_number: number;
    stage: string;
    group_name: string | null;
    kickoff_at: number;
    team1: string;
    team2: string;
    actual_t1: number;
    actual_t2: number;
    winner_team: string;
    pick_t1: number | null;
    pick_t2: number | null;
    pick_winner: string | null;
    pick_points: number | null;
  }>(sql`
    SELECT
      f.fixture_number, f.stage, f.group_name, f.kickoff_at, f.team1, f.team2,
      r.team1_goals AS actual_t1, r.team2_goals AS actual_t2, r.winner_team,
      p.team1_goals AS pick_t1, p.team2_goals AS pick_t2,
      p.predicted_winner AS pick_winner, p.points AS pick_points
    FROM wc_results r
    INNER JOIN wc_fixtures f ON f.fixture_number = r.fixture_number
    LEFT JOIN wc_predictions p ON p.fixture_number = r.fixture_number AND p.user_id = ${userId}
    ORDER BY f.kickoff_at DESC, f.fixture_number DESC
  `);

  let totalPoints = 0;
  let predictionsMade = 0;
  const history: PlayerHistoryRow[] = rows.map((r) => {
    if (r.pick_points != null) totalPoints += r.pick_points;
    if (r.pick_t1 != null) predictionsMade++;
    return {
      fixtureNumber: r.fixture_number,
      stage: r.stage,
      groupName: r.group_name,
      kickoffAt: new Date(r.kickoff_at * 1000),
      team1: r.team1,
      team2: r.team2,
      actual: { team1Goals: r.actual_t1, team2Goals: r.actual_t2, winnerTeam: r.winner_team },
      pick: r.pick_t1 != null && r.pick_t2 != null
        ? { team1Goals: r.pick_t1, team2Goals: r.pick_t2, predictedWinner: r.pick_winner ?? "", points: r.pick_points }
        : null,
    };
  });

  return {
    player: { id: u.id, name: u.name, totalPoints, predictionsMade },
    rows: history,
  };
}

export interface GroupView {
  groupName: string;
  standings: GroupStandingRow[];
  fixtures: Array<{
    fixtureNumber: number;
    kickoffAt: Date;
    team1: string;
    team2: string;
    result: { team1Goals: number; team2Goals: number } | null;
  }>;
}

export async function loadGroupViews(): Promise<GroupView[]> {
  const fixtures = await db
    .select()
    .from(wcFixtures)
    .where(eq(wcFixtures.stage, "group"))
    .orderBy(wcFixtures.groupName, wcFixtures.kickoffAt);
  const results = await db.select().from(wcResults);
  const resultByFx = new Map(results.map((r) => [r.fixtureNumber, r]));

  const byGroup = new Map<string, typeof fixtures>();
  for (const f of fixtures) {
    if (!f.groupName) continue;
    if (!byGroup.has(f.groupName)) byGroup.set(f.groupName, []);
    byGroup.get(f.groupName)!.push(f);
  }

  const out: GroupView[] = [];
  for (const [groupName, fxs] of byGroup) {
    const teams = Array.from(new Set(fxs.flatMap((f) => [f.team1, f.team2]).filter(Boolean))) as string[];
    const settled = fxs
      .map((f) => {
        const r = resultByFx.get(f.fixtureNumber);
        if (!r || !f.team1 || !f.team2) return null;
        return { team1: f.team1, team2: f.team2, team1Goals: r.team1Goals, team2Goals: r.team2Goals };
      })
      .filter((x): x is { team1: string; team2: string; team1Goals: number; team2Goals: number } => x !== null);
    const standings = computeGroupStandings(teams, settled);
    out.push({
      groupName,
      standings,
      fixtures: fxs.map((f) => ({
        fixtureNumber: f.fixtureNumber,
        kickoffAt: f.kickoffAt,
        team1: f.team1 ?? "TBD",
        team2: f.team2 ?? "TBD",
        result: resultByFx.has(f.fixtureNumber)
          ? { team1Goals: resultByFx.get(f.fixtureNumber)!.team1Goals, team2Goals: resultByFx.get(f.fixtureNumber)!.team2Goals }
          : null,
      })),
    });
  }
  return out;
}

// Mark a single user as having joined the game by ensuring they have the
// wc role. Used from admin batch 3 (not yet shipped); exported here so
// existing helpers stay close to the data layer.
export async function grantWcRole(userId: string): Promise<void> {
  const [u] = await db.select({ roles: users.roles }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return;
  const roles: string[] = JSON.parse(u.roles || "[]");
  // Global admin no longer auto-includes WC — explicit grant required.
  if (roles.includes("wc") || roles.includes("wc_admin")) return;
  roles.push("wc");
  await db.update(users).set({ roles: JSON.stringify(roles), updatedAt: new Date() }).where(eq(users.id, userId));
}
