// Pure math — safe to import from anywhere. No "server-only" guard so the
// vitest suite (node, no Next.js shims) can import this file directly.

// Scoring rules from the spreadsheet template. Three points stack — a perfect
// prediction earns 2 + 3 + 5 = 10 points per match.
export const PTS_TOTAL_GOALS = 2;     // correct combined goal count
export const PTS_CORRECT_RESULT = 3;  // correct W/D/L outcome
export const PTS_EXACT_SCORE = 5;     // exact scoreline (e.g. predicted 2-1, actual 2-1)
export const PTS_MAX_PER_MATCH = PTS_TOTAL_GOALS + PTS_CORRECT_RESULT + PTS_EXACT_SCORE;

// Stage multipliers — disabled for now (every match worth 1×) but the engine
// supports them so we can flip on R16=1.5×, Final=2× etc. without rewriting.
const STAGE_MULTIPLIER: Record<string, number> = {
  group: 1, r32: 1, r16: 1, qf: 1, sf: 1, third: 1, final: 1,
};

export interface PredictionPoints {
  totalGoals: number;
  result: number;
  exact: number;
  total: number;
}

// Pure function — given a prediction and an actual result, returns the points
// breakdown. Called both at write time (when admin enters a result) and from
// tests, so it must not touch the DB.
export function scorePrediction(
  pred: { team1Goals: number; team2Goals: number },
  actual: { team1Goals: number; team2Goals: number },
  stage = "group",
): PredictionPoints {
  const m = STAGE_MULTIPLIER[stage] ?? 1;

  const predTotal = pred.team1Goals + pred.team2Goals;
  const actualTotal = actual.team1Goals + actual.team2Goals;
  const totalGoals = predTotal === actualTotal ? PTS_TOTAL_GOALS : 0;

  const predOutcome = outcome(pred.team1Goals, pred.team2Goals);
  const actualOutcome = outcome(actual.team1Goals, actual.team2Goals);
  const result = predOutcome === actualOutcome ? PTS_CORRECT_RESULT : 0;

  const exact = pred.team1Goals === actual.team1Goals && pred.team2Goals === actual.team2Goals
    ? PTS_EXACT_SCORE
    : 0;

  const total = (totalGoals + result + exact) * m;
  return { totalGoals: totalGoals * m, result: result * m, exact: exact * m, total };
}

function outcome(t1: number, t2: number): "win1" | "draw" | "win2" {
  if (t1 > t2) return "win1";
  if (t1 < t2) return "win2";
  return "draw";
}

// "Result" string used for display + persisted into wc_results.winner_team —
// either the winning team name, or 'Draw' for a level group game. Knockouts
// always have a winner (the caller must resolve via ET/pens before calling).
export function winnerForGroup(t1Goals: number, t2Goals: number, team1: string, team2: string): string {
  if (t1Goals > t2Goals) return team1;
  if (t1Goals < t2Goals) return team2;
  return "Draw";
}

// Group standings — UEFA tiebreak order:
//   1. Points (W=3, D=1, L=0)
//   2. Goal difference
//   3. Goals scored
//   4. Alphabetical (final tiebreaker — head-to-head requires fixture-level
//      data and isn't worth the complexity for an office sweepstake).
export interface GroupStandingRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export function computeGroupStandings(
  teams: string[],
  results: Array<{ team1: string; team2: string; team1Goals: number; team2Goals: number }>,
): GroupStandingRow[] {
  const map = new Map<string, GroupStandingRow>();
  for (const t of teams) {
    map.set(t, { team: t, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 });
  }
  for (const r of results) {
    const a = map.get(r.team1);
    const b = map.get(r.team2);
    if (!a || !b) continue; // result for a team that's not in this group — skip safely
    a.played++; b.played++;
    a.goalsFor += r.team1Goals; a.goalsAgainst += r.team2Goals;
    b.goalsFor += r.team2Goals; b.goalsAgainst += r.team1Goals;
    if (r.team1Goals > r.team2Goals) { a.won++; b.lost++; a.points += 3; }
    else if (r.team1Goals < r.team2Goals) { b.won++; a.lost++; b.points += 3; }
    else { a.drawn++; b.drawn++; a.points++; b.points++; }
  }
  for (const row of map.values()) row.goalDiff = row.goalsFor - row.goalsAgainst;
  return [...map.values()].sort((x, y) =>
    y.points - x.points ||
    y.goalDiff - x.goalDiff ||
    y.goalsFor - x.goalsFor ||
    x.team.localeCompare(y.team),
  );
}
