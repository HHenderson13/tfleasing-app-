import Link from "next/link";
import Image from "next/image";
import { requireLeaderboardAccess } from "@/lib/auth-guard";
import { isAdmin } from "@/lib/auth";
import { signOutAction } from "../login/actions";
import {
  closestRace,
  currentYearMonth,
  formatMonthLabel,
  MONTH_LABELS,
  type ExecMonthStats,
  type LeaderboardMetric,
} from "@/lib/sales-leaderboard";
import { loadChampionArchive, loadLeaderboard, type ChampionEntry } from "@/lib/sales-leaderboard-data";
import { computeBadgesFor, overallRanks, type Badge } from "@/lib/sales-leaderboard-badges";

export const dynamic = "force-dynamic";

interface SearchParams { month?: string; view?: string }

function normaliseMonth(value: string | undefined): string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return currentYearMonth();
  return value;
}

const METRIC_META: { key: LeaderboardMetric; label: string; tone: string; format: (s: ExecMonthStats) => string }[] = [
  { key: "orders",     label: "Order Take",        tone: "from-amber-500 to-orange-500", format: (s) => String(s.orderCount) },
  { key: "deliveries", label: "Deliveries",        tone: "from-emerald-500 to-teal-500", format: (s) => String(s.deliveryCount) },
  { key: "insurance",  label: "Insurance Products", tone: "from-violet-500 to-fuchsia-500", format: (s) => String(s.insuranceCount) },
  { key: "conversion", label: "Conversion %",      tone: "from-sky-500 to-indigo-500", format: (s) => `${s.conversionPct.toFixed(1)}%` },
];

const TROPHIES: Record<1 | 2 | 3, string> = { 1: "🏆", 2: "🥈", 3: "🥉" };

export default async function SalesLeaderboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireLeaderboardAccess();
  const admin = isAdmin(user);
  const params = await searchParams;
  const yearMonth = normaliseMonth(params.month);
  const view: "month" | "ytd" = params.view === "ytd" ? "ytd" : "month";
  const snapshot = await loadLeaderboard({ yearMonth, view });
  const year = yearMonth.slice(0, 4);

  const leaders: Record<LeaderboardMetric, ExecMonthStats[]> = {
    orders: [], deliveries: [], insurance: [], conversion: [],
  };
  for (const m of METRIC_META) {
    leaders[m.key] = [...snapshot.rows]
      .filter((r) => r.metricRanks[m.key] !== null && r.metricRanks[m.key]! <= 3)
      .sort((a, b) => (a.metricRanks[m.key]! - b.metricRanks[m.key]!));
  }

  const overallRankMap = overallRanks(snapshot.rows);
  const badgesByExec = new Map<string, Badge[]>();
  for (const r of snapshot.rows) {
    badgesByExec.set(r.salesExecId, computeBadgesFor(r, overallRankMap.get(r.salesExecId) ?? null));
  }
  const champion = snapshot.rows.find((r) => overallRankMap.get(r.salesExecId) === 1) ?? null;
  const race = closestRace(snapshot.rows);
  // Archive of past champions — last 6 months ending at this one. Cheap
  // because each monthly snapshot is small.
  const archive = await loadChampionArchive(yearMonth, 6);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-sm sm:px-6">
          <Link href="/" className="text-slate-500 hover:text-slate-900">← Back to portal</Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-slate-700 sm:inline">{user.name}</span>
            <form action={signOutAction}>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl">🏁</span>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Pole Position</h1>
          </div>
          <div className="flex items-center gap-2">
            {user.salesExecId && (
              <Link href="/sales-leaderboard/me" className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700">
                My scorecard
              </Link>
            )}
            {admin && (
              <Link href="/sales-leaderboard/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Manage
              </Link>
            )}
          </div>
        </div>

        {/* View switcher */}
        <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm font-medium">
          <Link
            href={`/sales-leaderboard?month=${yearMonth}&view=month`}
            className={`rounded-lg px-3 py-1.5 ${view === "month" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Month to date
          </Link>
          <Link
            href={`/sales-leaderboard?month=${yearMonth}&view=ytd`}
            className={`rounded-lg px-3 py-1.5 ${view === "ytd" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Year to date
          </Link>
        </div>

        {/* Month tabs + year nav (only on MTD view — YTD ignores the
            specific month). Year arrows let admins browse historical
            champions without typing URLs. */}
        {view === "month" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Link
                href={`/sales-leaderboard?month=${parseInt(year, 10) - 1}-${yearMonth.slice(5)}&view=${view}`}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                aria-label="Previous year"
              >
                ←
              </Link>
              <div className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white tabular-nums">{year}</div>
              <Link
                href={`/sales-leaderboard?month=${parseInt(year, 10) + 1}-${yearMonth.slice(5)}&view=${view}`}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                aria-label="Next year"
              >
                →
              </Link>
            </div>
            <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 pb-1">
              {MONTH_LABELS.map((label, i) => {
                const m = `${year}-${String(i + 1).padStart(2, "0")}`;
                const active = m === yearMonth;
                return (
                  <Link
                    key={m}
                    href={`/sales-leaderboard?month=${m}&view=${view}`}
                    className={`flex-none rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition ${
                      active ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {label.slice(0, 3)}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Showing <strong>{view === "ytd" ? `${year} year to date` : formatMonthLabel(yearMonth)}</strong>.
          {!snapshot.hasAnyData && " No reports uploaded yet."}
        </p>

        {/* Champion banner — designed to be unmissable. Big uppercase
            period-aware header, oversized photo with crown overlay,
            massive name. Stacks vertically on mobile. */}
        {champion && (
          <div className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600 p-6 text-white shadow-xl sm:p-8">
            {/* Subtle radial sparkle for depth */}
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-amber-300/30 blur-3xl" />
            <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-8 sm:text-left">
              <div className="relative">
                {champion.photoUrl ? (
                  <Image
                    src={champion.photoUrl}
                    alt={champion.name}
                    width={160}
                    height={160}
                    className="h-28 w-28 rounded-full object-cover ring-4 ring-white/90 shadow-xl sm:h-36 sm:w-36"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/20 text-3xl font-bold ring-4 ring-white/90 shadow-xl sm:h-36 sm:w-36 sm:text-4xl">
                    {initials(champion.name)}
                  </div>
                )}
                <div className="absolute -top-3 -right-2 text-5xl drop-shadow-lg sm:-top-4 sm:-right-3 sm:text-6xl">👑</div>
              </div>
              <div className="flex-1">
                <div className="text-2xl font-extrabold uppercase tracking-[0.18em] text-white drop-shadow-sm sm:text-4xl">
                  {view === "ytd" ? "Year-to-Date Champion" : `${formatMonthLabel(yearMonth)} Champion`}
                </div>
                <div className="mt-3 text-3xl font-bold sm:text-5xl">{champion.name}</div>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold backdrop-blur-sm sm:text-base">
                  <span>🏆</span>
                  <span>{champion.totalPoints} points</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Closest race callout — drives end-of-month hustle by surfacing
            the tightest gap between any two execs across any metric. */}
        {race && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm shadow-sm">
            <span className="text-2xl">🏎️</span>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Closest race · {race.metricLabel}</div>
              <div className="mt-0.5 text-slate-800">
                <strong>{race.leader.name}</strong> vs <strong>{race.challenger.name}</strong>
                <span className="ml-2 rounded-full bg-rose-200/70 px-2 py-0.5 text-[11px] font-semibold text-rose-900">{race.gapLabel}</span>
              </div>
            </div>
          </div>
        )}

        {/* Metric leader cards — team total per metric instead of the
            old scoring-key subtitle. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {METRIC_META.map((m) => (
            <MetricCard key={m.key} meta={m} leaders={leaders[m.key]} teamTotal={teamTotalFor(snapshot.rows, m.key)} />
          ))}
        </div>

        {/* Total points table */}
        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Total points</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Exec</th>
                <th className="px-2 py-3 text-right">Orders</th>
                <th className="px-2 py-3 text-right">Deliveries</th>
                <th className="px-2 py-3 text-right">Insurance</th>
                <th className="px-2 py-3 text-right">Conv %</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshot.rows.map((r, idx) => {
                const overall = overallRankMap.get(r.salesExecId);
                return (
                  <tr key={r.salesExecId} className={idx < 3 ? "bg-amber-50/30" : undefined}>
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      <div className="flex items-center gap-1">
                        <span>{idx + 1}</span>
                        {overall === 1 || overall === 2 || overall === 3 ? <span className="text-base">{TROPHIES[overall]}</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.photoUrl ? (
                          <Image src={r.photoUrl} alt={r.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover" unoptimized />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500">
                            {initials(r.name)}
                          </div>
                        )}
                        <span className="font-medium text-slate-900">{r.name}</span>
                      </div>
                    </td>
                    <Cell n={r.orderCount}     pts={r.metricPoints.orders} />
                    <Cell n={r.deliveryCount}  pts={r.metricPoints.deliveries} />
                    <Cell n={r.insuranceCount} pts={r.metricPoints.insurance} />
                    <Cell n={`${r.conversionPct.toFixed(1)}%`} pts={r.metricPoints.conversion} />
                    <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-slate-900">{r.totalPoints}</td>
                  </tr>
                );
              })}
              {snapshot.rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No participants yet. Admin can add execs on the Manage page.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Scoring: 🏆 3 pts · 🥈 2 pts · 🥉 1 pt — per metric, per period.
        </p>

        {/* Champion archive — Hall of Fame strip of past 6 monthly winners. */}
        {archive.some((a) => a.champion) && (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Hall of Fame</h2>
            <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {archive.map((entry) => (
                <ArchiveTile key={entry.yearMonth} entry={entry} isCurrent={entry.yearMonth === yearMonth} />
              ))}
            </div>
          </>
        )}

        {/* Scorecards */}
        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Scorecards</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.rows.map((r, idx) => (
            <Scorecard key={r.salesExecId} rank={idx + 1} stats={r} badges={badgesByExec.get(r.salesExecId) ?? []} />
          ))}
        </div>
      </main>
    </div>
  );
}

function Cell({ n, pts }: { n: number | string; pts: number }) {
  return (
    <td className="px-2 py-3 text-right tabular-nums">
      <div className="text-slate-900">{n}</div>
      {pts > 0 && <div className="text-[10px] font-semibold text-amber-600">+{pts}</div>}
    </td>
  );
}

function MetricCard({ meta, leaders, teamTotal }: { meta: { key: LeaderboardMetric; label: string; tone: string; format: (s: ExecMonthStats) => string }; leaders: ExecMonthStats[]; teamTotal: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`flex items-end justify-between bg-gradient-to-r ${meta.tone} px-4 py-3 text-white`}>
        <div className="text-sm font-semibold uppercase tracking-wide">{meta.label}</div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide opacity-80">Team</div>
          <div className="text-base font-semibold tabular-nums">{teamTotal}</div>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {leaders.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-500">No data yet</div>
        )}
        {leaders.map((r) => {
          const rank = r.metricRanks[meta.key];
          return (
            <div key={r.salesExecId} className="flex items-center gap-3 px-4 py-2">
              <span className="w-6 text-lg leading-none">{rank === 1 || rank === 2 || rank === 3 ? TROPHIES[rank] : ""}</span>
              {r.photoUrl ? (
                <Image src={r.photoUrl} alt={r.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover" unoptimized />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500">
                  {initials(r.name)}
                </div>
              )}
              <div className="flex-1 truncate text-sm text-slate-800">{r.name}</div>
              <div className="text-sm font-semibold tabular-nums text-slate-900">{meta.format(r)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Scorecard({ rank, stats, badges }: { rank: number; stats: ExecMonthStats; badges: Badge[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 text-white">
        {stats.photoUrl ? (
          <Image src={stats.photoUrl} alt={stats.name} width={56} height={56} className="h-14 w-14 rounded-full object-cover ring-2 ring-white" unoptimized />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-200 ring-2 ring-white">
            {initials(stats.name)}
          </div>
        )}
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Rank #{rank}</div>
          <div className="text-lg font-semibold">{stats.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Points</div>
          <div className="text-2xl font-semibold tabular-nums">{stats.totalPoints}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <ScoreLine label="Orders"     n={stats.orderCount}     rank={stats.metricRanks.orders} />
        <ScoreLine label="Deliveries" n={stats.deliveryCount}  rank={stats.metricRanks.deliveries} />
        <ScoreLine label="Insurance"  n={stats.insuranceCount} rank={stats.metricRanks.insurance} />
        <ScoreLine label="Conv %"     n={`${stats.conversionPct.toFixed(1)}%`} rank={stats.metricRanks.conversion} sub={`${stats.salesCount}/${stats.enquiryCount}`} />
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-slate-100 bg-slate-50 px-4 py-2">
          {badges.map((b) => (
            <BadgeChip key={b.key} badge={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BadgeChip({ badge }: { badge: Badge }) {
  const tone = badge.tier === 1
    ? "bg-amber-100 text-amber-800 ring-amber-200"
    : badge.tier === 2
      ? "bg-slate-100 text-slate-700 ring-slate-200"
      : "bg-orange-100 text-orange-800 ring-orange-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>
      <span className="text-sm leading-none">{badge.emoji}</span>
      {badge.title}
    </span>
  );
}

function ScoreLine({ label, n, rank, sub }: { label: string; n: number | string; rank: number | null; sub?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-base font-semibold tabular-nums text-slate-900">{n}</div>
        {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
      </div>
      {rank !== null && rank <= 3 && (
        <div className="text-lg leading-none">{TROPHIES[rank as 1 | 2 | 3]}</div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function ArchiveTile({ entry, isCurrent }: { entry: ChampionEntry; isCurrent: boolean }) {
  const label = formatMonthLabel(entry.yearMonth);
  return (
    <div className={`flex-none w-44 rounded-2xl border bg-white px-3 py-3 shadow-sm ${isCurrent ? "border-amber-300 ring-2 ring-amber-200" : "border-slate-200"}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <span className="text-base">👑</span>
      </div>
      {entry.champion ? (
        <div className="mt-2 flex items-center gap-2">
          {entry.champion.photoUrl ? (
            <Image src={entry.champion.photoUrl} alt={entry.champion.name} width={36} height={36} className="h-9 w-9 rounded-full object-cover" unoptimized />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
              {initials(entry.champion.name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{entry.champion.name}</div>
            <div className="text-[11px] text-slate-500">{entry.champion.points} pts</div>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-slate-400">No data yet</div>
      )}
    </div>
  );
}

function teamTotalFor(rows: ExecMonthStats[], key: LeaderboardMetric): string {
  if (key === "conversion") {
    const enq = rows.reduce((a, r) => a + r.enquiryCount, 0);
    const sales = rows.reduce((a, r) => a + r.salesCount, 0);
    return enq > 0 ? `${((sales / enq) * 100).toFixed(1)}%` : "—";
  }
  if (key === "orders")     return String(rows.reduce((a, r) => a + r.orderCount, 0));
  if (key === "deliveries") return String(rows.reduce((a, r) => a + r.deliveryCount, 0));
  return String(rows.reduce((a, r) => a + r.insuranceCount, 0));
}
