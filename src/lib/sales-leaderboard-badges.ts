import type { ExecMonthStats, LeaderboardMetric } from "./sales-leaderboard";

// Badges are derived from the ranking + total points on a single snapshot
// (either MTD or YTD). Same logic applies to both views — the calling page
// labels them appropriately for the period.

export interface Badge {
  key: string;
  emoji: string;
  title: string;
  // 1 = top dog, 2 = silver, 3 = bronze. Drives styling.
  tier: 1 | 2 | 3;
  // "Order Take Hero" needs ordering — gold > silver > bronze > tier-agnostic
  // specials (overall champion, clean sweep) which we treat as tier 1 for
  // display but mark with isSpecial so they sort first.
  isSpecial?: boolean;
}

const METRIC_TITLES: Record<LeaderboardMetric, { gold: string; silver: string; bronze: string; emoji: string }> = {
  orders: {
    gold:   "Order Take Hero",
    silver: "Order Take Runner-Up",
    bronze: "Order Take Podium",
    emoji:  "📝",
  },
  deliveries: {
    gold:   "Delivery Maestro",
    silver: "Delivery Runner-Up",
    bronze: "Delivery Podium",
    emoji:  "🚗",
  },
  insurance: {
    gold:   "Insurance Specialist",
    silver: "Insurance Runner-Up",
    bronze: "Insurance Podium",
    emoji:  "🛡️",
  },
  conversion: {
    gold:   "Conversion Wizard",
    silver: "Conversion Runner-Up",
    bronze: "Conversion Podium",
    emoji:  "🎯",
  },
};

const TROPHY_BY_TIER: Record<1 | 2 | 3, string> = {
  1: "🏆",
  2: "🥈",
  3: "🥉",
};

function metricBadge(metric: LeaderboardMetric, rank: 1 | 2 | 3): Badge {
  const titles = METRIC_TITLES[metric];
  return {
    key: `${metric}-${rank}`,
    emoji: TROPHY_BY_TIER[rank],
    title: rank === 1 ? titles.gold : rank === 2 ? titles.silver : titles.bronze,
    tier: rank,
  };
}

// Compute badges for a single exec given:
//   • their per-metric ranks (from the snapshot they're in)
//   • whether they're the overall points leader on that snapshot
//   • their total points (used for tie-aware overall detection by the caller)
//
// We don't decide "champion" here — the caller passes overallRank because
// ties can produce multiple champions and that's its own rule.
export function computeBadgesFor(
  stats: ExecMonthStats,
  overallRank: 1 | 2 | 3 | null,
): Badge[] {
  const out: Badge[] = [];

  if (overallRank === 1) {
    out.push({ key: "overall-champion", emoji: "👑", title: "Champion", tier: 1, isSpecial: true });
  } else if (overallRank === 2) {
    out.push({ key: "overall-silver", emoji: "🥈", title: "Runner-Up Overall", tier: 2, isSpecial: true });
  } else if (overallRank === 3) {
    out.push({ key: "overall-bronze", emoji: "🥉", title: "Podium Overall", tier: 3, isSpecial: true });
  }

  // Per-metric podiums.
  const metrics: LeaderboardMetric[] = ["orders", "deliveries", "insurance", "conversion"];
  for (const m of metrics) {
    const rank = stats.metricRanks[m];
    if (rank === 1 || rank === 2 || rank === 3) {
      out.push(metricBadge(m, rank));
    }
  }

  // Specials.
  const podiums = metrics.filter((m) => {
    const r = stats.metricRanks[m];
    return r === 1 || r === 2 || r === 3;
  });
  const firsts = metrics.filter((m) => stats.metricRanks[m] === 1);
  if (firsts.length >= 4) {
    out.push({ key: "clean-sweep", emoji: "✨", title: "Clean Sweep — 1st in all 4", tier: 1, isSpecial: true });
  } else if (firsts.length === 3) {
    out.push({ key: "triple-threat", emoji: "🔥", title: "Triple Threat — 1st in 3 metrics", tier: 1, isSpecial: true });
  } else if (podiums.length === 4 && firsts.length < 3) {
    // Made the podium across the board even without sweeping the golds.
    out.push({ key: "podium-everywhere", emoji: "🌟", title: "Quadruple Podium", tier: 1, isSpecial: true });
  }

  // Sort specials first, then tier ascending.
  out.sort((a, b) => {
    if ((a.isSpecial ? 1 : 0) !== (b.isSpecial ? 1 : 0)) return (b.isSpecial ? 1 : 0) - (a.isSpecial ? 1 : 0);
    return a.tier - b.tier;
  });

  return out;
}

// Helpers for the caller — pick out the top-3 ranks by totalPoints with
// standard sports-ranking tie handling. Returns Map<execId, 1|2|3|null>.
export function overallRanks(rows: ExecMonthStats[]): Map<string, 1 | 2 | 3 | null> {
  const sorted = [...rows].sort((a, b) => b.totalPoints - a.totalPoints);
  const ranks = new Map<string, 1 | 2 | 3 | null>();
  let prev: number | null = null;
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i].totalPoints;
    if (prev === null || p !== prev) {
      rank = i + 1;
      prev = p;
    }
    // Zero total points means they earned no podium in any metric — don't
    // give them the overall champion crown by accident if everyone scored 0.
    if (p === 0) { ranks.set(sorted[i].salesExecId, null); continue; }
    if (rank === 1) ranks.set(sorted[i].salesExecId, 1);
    else if (rank === 2) ranks.set(sorted[i].salesExecId, 2);
    else if (rank === 3) ranks.set(sorted[i].salesExecId, 3);
    else ranks.set(sorted[i].salesExecId, null);
  }
  return ranks;
}
