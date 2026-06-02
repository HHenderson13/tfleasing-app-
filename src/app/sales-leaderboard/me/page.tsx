import Link from "next/link";
import Image from "next/image";
import { requireLeaderboardAccess } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import {
  currentYearMonth,
  formatMonthLabel,
  type ExecMonthStats,
  type LeaderboardMetric,
} from "@/lib/sales-leaderboard";
import { loadMonthSnapshot, loadYtdSnapshot } from "@/lib/sales-leaderboard-data";
import { computeBadgesFor, overallRanks, type Badge } from "@/lib/sales-leaderboard-badges";

export const dynamic = "force-dynamic";

const METRIC_META: { key: LeaderboardMetric; label: string; tone: string; format: (n: number) => string }[] = [
  { key: "orders",     label: "Order Take",        tone: "from-amber-500 to-orange-500", format: (n) => String(n) },
  { key: "deliveries", label: "Deliveries",        tone: "from-emerald-500 to-teal-500", format: (n) => String(n) },
  { key: "insurance",  label: "Insurance Products", tone: "from-violet-500 to-fuchsia-500", format: (n) => String(n) },
  { key: "conversion", label: "Conversion %",      tone: "from-sky-500 to-indigo-500", format: (n) => `${n.toFixed(1)}%` },
];

const TROPHIES: Record<1 | 2 | 3, string> = { 1: "🏆", 2: "🥈", 3: "🥉" };

function metricValue(s: ExecMonthStats, key: LeaderboardMetric): number {
  if (key === "orders") return s.orderCount;
  if (key === "deliveries") return s.deliveryCount;
  if (key === "insurance") return s.insuranceCount;
  return s.conversionPct;
}

export default async function MyScorecardPage() {
  const user = await requireLeaderboardAccess();
  const month = currentYearMonth();

  if (!user.salesExecId) {
    return (
      <Shell userName={user.name} title="My scorecard">
        <Empty>
          You&apos;re signed in but you don&apos;t have a sales-exec profile linked to your account.
          Ask an admin to set up the link.
        </Empty>
      </Shell>
    );
  }

  const [mtd, ytd] = await Promise.all([
    loadMonthSnapshot(month),
    loadYtdSnapshot(month),
  ]);

  const mine = mtd.rows.find((r) => r.salesExecId === user.salesExecId);
  const mineYtd = ytd.rows.find((r) => r.salesExecId === user.salesExecId);

  if (!mine || !mineYtd) {
    return (
      <Shell userName={user.name} title="My scorecard">
        <Empty>
          You aren&apos;t on the leaderboard yet. Ask an admin to add you on the Participants tab,
          then reload this page.
        </Empty>
      </Shell>
    );
  }

  const overallMtd = overallRanks(mtd.rows);
  const overallYtd = overallRanks(ytd.rows);
  const badgesMtd = computeBadgesFor(mine, overallMtd.get(mine.salesExecId) ?? null);
  const badgesYtd = computeBadgesFor(mineYtd, overallYtd.get(mineYtd.salesExecId) ?? null);

  const myMtdRank = [...mtd.rows].sort((a, b) => b.totalPoints - a.totalPoints).findIndex((r) => r.salesExecId === mine.salesExecId) + 1;
  const myYtdRank = [...ytd.rows].sort((a, b) => b.totalPoints - a.totalPoints).findIndex((r) => r.salesExecId === mineYtd.salesExecId) + 1;

  // Department averages — useful context for the personal view.
  const deptAvg = computeDeptAverages(mtd.rows);

  return (
    <Shell userName={user.name} title="My scorecard">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          {mine.photoUrl ? (
            <Image src={mine.photoUrl} alt={mine.name} width={88} height={88} className="h-20 w-20 rounded-full object-cover ring-4 ring-white/20 sm:h-24 sm:w-24" unoptimized />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700 text-2xl font-semibold ring-4 ring-white/20 sm:h-24 sm:w-24">
              {initials(mine.name)}
            </div>
          )}
          <div className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
              {formatMonthLabel(month)} — your scorecard
            </div>
            <div className="mt-1 text-3xl font-bold sm:text-4xl">{mine.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-white/80">
              <span><span className="font-semibold text-white">#{myMtdRank}</span> this month</span>
              <span className="text-white/40">·</span>
              <span><span className="font-semibold text-white">#{myYtdRank}</span> year to date</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:gap-3">
            <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-white/60">MTD pts</div>
              <div className="text-2xl font-bold tabular-nums">{mine.totalPoints}</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-white/60">YTD pts</div>
              <div className="text-2xl font-bold tabular-nums">{mineYtd.totalPoints}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Achievements (MTD + YTD) */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Achievements</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <AchievementsCard title={`${formatMonthLabel(month)}`} subtitle="Badges earned this month" badges={badgesMtd} />
        <AchievementsCard title="Year to date" subtitle="Across the whole year so far" badges={badgesYtd} />
      </div>

      {/* Metric breakdown — your score vs dept avg vs top */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">This month, metric by metric</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {METRIC_META.map((meta) => {
          const myVal = metricValue(mine, meta.key);
          const top = Math.max(...mtd.rows.map((r) => metricValue(r, meta.key)));
          const avg = deptAvg[meta.key];
          const rank = mine.metricRanks[meta.key];
          return (
            <MetricBreakdownCard
              key={meta.key}
              meta={meta}
              myValue={myVal}
              avgValue={avg}
              topValue={top}
              rank={rank}
              nextRankGap={nextRankGap(mtd.rows, mine, meta.key)}
            />
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Want to see how the whole team stacks up? <Link href="/sales-leaderboard" className="font-medium text-rose-700 hover:text-rose-900">Go to the full leaderboard →</Link>
      </p>
    </Shell>
  );
}

function nextRankGap(rows: ExecMonthStats[], me: ExecMonthStats, key: LeaderboardMetric): { gap: number; targetRank: number } | null {
  const sorted = [...rows].sort((a, b) => metricValue(b, key) - metricValue(a, key));
  const myIdx = sorted.findIndex((r) => r.salesExecId === me.salesExecId);
  if (myIdx <= 0) return null; // Already top.
  // Find the next person above me with a strictly higher value (to avoid
  // "you need to overtake yourself" in tied groups).
  const myVal = metricValue(me, key);
  for (let i = myIdx - 1; i >= 0; i--) {
    const v = metricValue(sorted[i], key);
    if (v > myVal) {
      return { gap: v - myVal, targetRank: i + 1 };
    }
  }
  return null;
}

function computeDeptAverages(rows: ExecMonthStats[]): Record<LeaderboardMetric, number> {
  if (rows.length === 0) return { orders: 0, deliveries: 0, insurance: 0, conversion: 0 };
  return {
    orders:     rows.reduce((a, r) => a + r.orderCount, 0)     / rows.length,
    deliveries: rows.reduce((a, r) => a + r.deliveryCount, 0)  / rows.length,
    insurance:  rows.reduce((a, r) => a + r.insuranceCount, 0) / rows.length,
    conversion: rows.reduce((a, r) => a + r.conversionPct, 0)  / rows.length,
  };
}

function AchievementsCard({ title, subtitle, badges }: { title: string; subtitle: string; badges: Badge[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{subtitle}</div>
      </div>
      <div className="px-4 py-3">
        {badges.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-500">No badges yet — keep going! 💪</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <BadgeChip key={b.key} badge={b} large />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BadgeChip({ badge, large }: { badge: Badge; large?: boolean }) {
  const tone = badge.tier === 1
    ? "bg-amber-100 text-amber-800 ring-amber-200"
    : badge.tier === 2
      ? "bg-slate-100 text-slate-700 ring-slate-200"
      : "bg-orange-100 text-orange-800 ring-orange-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset ${tone} ${large ? "px-3 py-1 text-sm font-semibold" : "px-2 py-0.5 text-[11px] font-semibold"}`}>
      <span className={large ? "text-lg leading-none" : "text-sm leading-none"}>{badge.emoji}</span>
      {badge.title}
    </span>
  );
}

function MetricBreakdownCard({
  meta,
  myValue,
  avgValue,
  topValue,
  rank,
  nextRankGap,
}: {
  meta: { key: LeaderboardMetric; label: string; tone: string; format: (n: number) => string };
  myValue: number;
  avgValue: number;
  topValue: number;
  rank: number | null;
  nextRankGap: { gap: number; targetRank: number } | null;
}) {
  const pct = topValue > 0 ? Math.max(2, Math.min(100, (myValue / topValue) * 100)) : 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`flex items-center justify-between bg-gradient-to-r ${meta.tone} px-4 py-3 text-white`}>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">{meta.label}</div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums">{meta.format(myValue)}</div>
        </div>
        <div className="text-right">
          {rank !== null && rank <= 3 ? (
            <span className="text-3xl leading-none">{TROPHIES[rank as 1 | 2 | 3]}</span>
          ) : rank !== null ? (
            <div className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">Rank #{rank}</div>
          ) : null}
        </div>
      </div>
      <div className="px-4 py-3 text-xs">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-slate-900" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-slate-500">
          <span>Dept avg <span className="font-medium text-slate-700 tabular-nums">{meta.format(avgValue)}</span></span>
          <span>Top <span className="font-medium text-slate-700 tabular-nums">{meta.format(topValue)}</span></span>
        </div>
        {nextRankGap && (
          <p className="mt-2 text-[11px] text-slate-600">
            <strong className="font-semibold text-slate-900">{meta.format(nextRankGap.gap)}</strong> behind rank #{nextRankGap.targetRank}.
          </p>
        )}
      </div>
    </div>
  );
}

function Shell({ userName, title, children }: { userName: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 text-sm sm:px-6">
          <Link href="/sales-leaderboard" className="text-slate-500 hover:text-slate-900">← Pole Position</Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-slate-700 sm:inline">{userName}</span>
            <form action={signOutAction}>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
