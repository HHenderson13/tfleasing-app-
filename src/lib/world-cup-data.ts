import "server-only";
import { db } from "@/db";
import { wcFixtures, wcLiveScores, wcPayments, wcPredictions, wcResults, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { computeGroupStandings, scorePrediction, type GroupStandingRow } from "./world-cup-scoring";

// Cache keys used by both the read path (unstable_cache) and the write path
// (revalidateTag in server actions). When a result lands, anything that
// depends on results invalidates and refetches. When fixture team1/team2
// changes (knockout advance), the bracket invalidates. Predictions don't
// affect any cached read — they're always per-user, so loaded fresh.
export const WC_CACHE_TAGS = {
  fixtures: "wc-fixtures",   // wc_fixtures rows (team1/team2 mutable on knockouts)
  results: "wc-results",     // wc_results rows (settled fixtures)
  predictions: "wc-predictions", // wc_predictions rows
} as const;

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
  // Current consecutive correct results (>=3pt picks) ordered by kickoff,
  // counted backwards from the most recent settled prediction. Broken by
  // any sub-3pt prediction or a missed match.
  streak: number;
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

  // Streak computation: one batch query orders settled predictions per user
  // by kickoff DESC; we walk each user's series and stop at the first
  // non-correct (or missed) prediction.
  const streakRows = await db.all<{ user_id: string; points: number | null }>(sql`
    SELECT p.user_id, p.points
    FROM wc_predictions p
    INNER JOIN wc_fixtures f ON f.fixture_number = p.fixture_number
    INNER JOIN wc_results  r ON r.fixture_number = p.fixture_number
    ORDER BY p.user_id, f.kickoff_at DESC
  `);
  const streakByUser = new Map<string, number>();
  {
    let cur: string | null = null;
    let count = 0;
    let stillActive = true;
    const commit = (uid: string | null) => { if (uid) streakByUser.set(uid, count); };
    for (const row of streakRows) {
      if (row.user_id !== cur) {
        commit(cur);
        cur = row.user_id;
        count = 0;
        stillActive = true;
      }
      if (!stillActive) continue;
      if (row.points !== null && row.points >= 3) count++;
      else stillActive = false;
    }
    commit(cur);
  }

  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    totalPoints: Number(r.total) || 0,
    predictionsMade: Number(r.made) || 0,
    exactScores: Number(r.exact) || 0,
    correctResults: Number(r.correct) || 0,
    streak: streakByUser.get(r.user_id) ?? 0,
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

// How many players matched this fixture's outcome vs total predictions made.
// Used for the subtle "5 / 12 same result" chip on settled cards — no
// inline "vs. the office" labelling, just a count.
export interface FixtureConsensus {
  total: number;
  exact: number;       // exact scoreline match
  sameResult: number;  // matches W/D/L
}

export async function loadConsensus(
  fixtureNumbers: number[],
): Promise<Map<number, FixtureConsensus>> {
  if (fixtureNumbers.length === 0) return new Map();
  const rows = await db.all<{
    fx: number; total: number; exact: number; same_result: number;
  }>(sql`
    SELECT
      p.fixture_number AS fx,
      COUNT(*) AS total,
      SUM(CASE WHEN p.team1_goals = r.team1_goals AND p.team2_goals = r.team2_goals THEN 1 ELSE 0 END) AS exact,
      SUM(CASE
        WHEN (p.team1_goals > p.team2_goals AND r.team1_goals > r.team2_goals)
          OR (p.team1_goals < p.team2_goals AND r.team1_goals < r.team2_goals)
          OR (p.team1_goals = p.team2_goals AND r.team1_goals = r.team2_goals)
        THEN 1 ELSE 0 END) AS same_result
    FROM wc_predictions p
    INNER JOIN wc_results r ON r.fixture_number = p.fixture_number
    WHERE p.fixture_number IN (${sql.join(fixtureNumbers.map((n) => sql`${n}`), sql`, `)})
    GROUP BY p.fixture_number
  `);
  const out = new Map<number, FixtureConsensus>();
  for (const r of rows) {
    out.set(Number(r.fx), {
      total: Number(r.total) || 0,
      exact: Number(r.exact) || 0,
      sameResult: Number(r.same_result) || 0,
    });
  }
  return out;
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

// "Live now" = any wc_live_scores row whose fixture hasn't yet been settled
// in wc_results. Snapshot is at the moment of the most recent update; the
// projected leaderboard treats the live score as if it were the final.
export interface LiveMatch {
  fixtureNumber: number;
  stage: string;
  groupName: string | null;
  kickoffAt: Date;
  team1: string;
  team2: string;
  team1Goals: number;
  team2Goals: number;
  minute: number | null;
  updatedAt: Date;
  projected: Array<{ userId: string; name: string; pickT1: number; pickT2: number; points: number }>;
}

export async function loadLiveMatches(): Promise<LiveMatch[]> {
  const rows = await db.all<{
    fixture_number: number;
    stage: string;
    group_name: string | null;
    kickoff_at: number;
    team1: string;
    team2: string;
    t1_goals: number;
    t2_goals: number;
    minute: number | null;
    updated_at: number;
  }>(sql`
    SELECT
      f.fixture_number, f.stage, f.group_name, f.kickoff_at,
      f.team1, f.team2,
      l.team1_goals AS t1_goals,
      l.team2_goals AS t2_goals,
      l.minute,
      l.updated_at
    FROM wc_live_scores l
    INNER JOIN wc_fixtures f ON f.fixture_number = l.fixture_number
    LEFT JOIN wc_results r ON r.fixture_number = l.fixture_number
    WHERE r.fixture_number IS NULL
    ORDER BY f.kickoff_at ASC
  `);
  if (rows.length === 0) return [];

  // Pull all predictions + player names for the live fixtures in one go,
  // so per-fixture projections don't trigger N+1.
  const fixtureNumbers = rows.map((r) => r.fixture_number);
  const preds = await db.all<{
    user_id: string; name: string; fixture_number: number;
    t1: number; t2: number;
  }>(sql`
    SELECT p.user_id, u.name, p.fixture_number, p.team1_goals AS t1, p.team2_goals AS t2
    FROM wc_predictions p
    INNER JOIN users u ON u.id = p.user_id
    WHERE p.fixture_number IN (${sql.join(fixtureNumbers.map((n) => sql`${n}`), sql`, `)})
  `);

  return rows.map((r) => {
    const stage = r.stage;
    const projected = preds
      .filter((p) => p.fixture_number === r.fixture_number)
      .map((p) => {
        const pts = scorePrediction(
          { team1Goals: p.t1, team2Goals: p.t2 },
          { team1Goals: r.t1_goals, team2Goals: r.t2_goals },
          stage,
        );
        return { userId: p.user_id, name: p.name, pickT1: p.t1, pickT2: p.t2, points: pts.total };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .slice(0, 5);

    return {
      fixtureNumber: r.fixture_number,
      stage,
      groupName: r.group_name,
      kickoffAt: new Date(r.kickoff_at * 1000),
      team1: r.team1,
      team2: r.team2,
      team1Goals: r.t1_goals,
      team2Goals: r.t2_goals,
      minute: r.minute,
      updatedAt: new Date(r.updated_at * 1000),
      projected,
    };
  });
}

export interface BracketCell {
  fixtureNumber: number;
  stage: "r32" | "r16" | "qf" | "sf" | "third" | "final";
  kickoffAt: Date;
  team1: string | null;
  team2: string | null;
  result: { team1Goals: number; team2Goals: number; winnerTeam: string } | null;
}

// Returns the 32 knockout fixtures, grouped by stage and sorted by their
// position in the bracket (fixture_number order matches the tree layout).
// The page renders them as five columns: R32 → R16 → QF → SF → Final, plus
// the 3rd-place playoff as a separate card.
// Same Date-rehydration story as the group views.
const loadKnockoutBracketRaw = unstable_cache(
  () => loadKnockoutBracket(),
  ["wc-knockout-bracket"],
  { tags: [WC_CACHE_TAGS.results, WC_CACHE_TAGS.fixtures] },
);
export async function loadKnockoutBracketCached(): Promise<Record<BracketCell["stage"], BracketCell[]>> {
  const raw = await loadKnockoutBracketRaw();
  const out: Record<BracketCell["stage"], BracketCell[]> = {
    r32: [], r16: [], qf: [], sf: [], third: [], final: [],
  };
  for (const stage of Object.keys(raw) as BracketCell["stage"][]) {
    out[stage] = raw[stage].map((c) => ({ ...c, kickoffAt: new Date(c.kickoffAt) }));
  }
  return out;
}

export async function loadKnockoutBracket(): Promise<Record<BracketCell["stage"], BracketCell[]>> {
  const fixtures = await db
    .select()
    .from(wcFixtures)
    .where(sql`${wcFixtures.stage} IN ('r32','r16','qf','sf','third','final')`)
    .orderBy(wcFixtures.fixtureNumber);
  const results = await db.select().from(wcResults);
  const resByFx = new Map(results.map((r) => [r.fixtureNumber, r]));

  const groups: Record<BracketCell["stage"], BracketCell[]> = {
    r32: [], r16: [], qf: [], sf: [], third: [], final: [],
  };
  for (const f of fixtures) {
    const r = resByFx.get(f.fixtureNumber);
    groups[f.stage as BracketCell["stage"]].push({
      fixtureNumber: f.fixtureNumber,
      stage: f.stage as BracketCell["stage"],
      kickoffAt: f.kickoffAt,
      team1: f.team1,
      team2: f.team2,
      result: r ? { team1Goals: r.team1Goals, team2Goals: r.team2Goals, winnerTeam: r.winnerTeam } : null,
    });
  }
  return groups;
}

// Cached version of loadGroupViews. Group standings + fixtures don't change
// per-user; one cache fill serves every visitor. Invalidated when a result
// lands (updateTag(WC_CACHE_TAGS.results) from commitFixtureResult).
//
// unstable_cache JSON-roundtrips the payload — `fixtures[].kickoffAt` comes
// back as an ISO string. Re-hydrate so the UI can call .toLocaleString.
const loadGroupViewsRaw = unstable_cache(
  () => loadGroupViews(),
  ["wc-group-views"],
  { tags: [WC_CACHE_TAGS.results, WC_CACHE_TAGS.fixtures] },
);
export async function loadGroupViewsCached(): Promise<GroupView[]> {
  const raw = await loadGroupViewsRaw();
  return raw.map((g) => ({
    ...g,
    fixtures: g.fixtures.map((f) => ({ ...f, kickoffAt: new Date(f.kickoffAt) })),
  }));
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
