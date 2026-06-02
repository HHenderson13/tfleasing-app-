import Link from "next/link";
import Image from "next/image";
import { requireLeaderboardAccess } from "@/lib/auth-guard";
import { isAdmin } from "@/lib/auth";
import { signOutAction } from "../login/actions";
import {
  currentYearMonth,
  formatMonthLabel,
  MONTH_LABELS,
  type ExecMonthStats,
  type LeaderboardMetric,
} from "@/lib/sales-leaderboard";
import { loadLeaderboard } from "@/lib/sales-leaderboard-data";

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

export default async function SalesLeaderboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireLeaderboardAccess();
  const admin = isAdmin(user);
  const params = await searchParams;
  const yearMonth = normaliseMonth(params.month);
  const view: "month" | "ytd" = params.view === "ytd" ? "ytd" : "month";
  const snapshot = await loadLeaderboard({ yearMonth, view });
  const year = yearMonth.slice(0, 4);

  // Build the leader-by-metric breakdown — top 3 ranks per metric for the
  // four scoring cards.
  const leaders: Record<LeaderboardMetric, ExecMonthStats[]> = {
    orders: [], deliveries: [], insurance: [], conversion: [],
  };
  for (const m of METRIC_META) {
    leaders[m.key] = [...snapshot.rows]
      .filter((r) => r.metricRanks[m.key] !== null && r.metricRanks[m.key]! <= 3)
      .sort((a, b) => (a.metricRanks[m.key]! - b.metricRanks[m.key]!));
  }

  // "Interesting fact" — pick the row with the most recent latestVehicle.
  // For monthly view this is simply the participant with the largest
  // orderCount who has a vehicle attached; if multiple, pick the first.
  const factRow = snapshot.rows.find((r) => r.latestVehicle && r.orderCount > 0) ?? null;

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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Sales exec leaderboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              1st in each metric scores <strong>3</strong>, 2nd <strong>2</strong>, 3rd <strong>1</strong>. Four metrics: Order Take, Deliveries, Insurance Products, Conversion %.
            </p>
          </div>
          {admin && (
            <Link href="/sales-leaderboard/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Manage
            </Link>
          )}
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

        {/* Month tabs */}
        <div className="mt-3 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
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
        <p className="mt-2 text-xs text-slate-500">
          Showing <strong>{view === "ytd" ? `${year} year to date` : formatMonthLabel(yearMonth)}</strong>.
          {!snapshot.hasAnyData && " No reports uploaded yet."}
        </p>

        {/* Metric leader cards */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {METRIC_META.map((m) => (
            <MetricCard key={m.key} meta={m} leaders={leaders[m.key]} />
          ))}
        </div>

        {/* Total points table */}
        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Total points</h2>
        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
              {snapshot.rows.map((r, idx) => (
                <tr key={r.salesExecId} className={idx < 3 ? "bg-amber-50/30" : undefined}>
                  <td className="px-4 py-3 font-semibold text-slate-700">{idx + 1}</td>
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
              ))}
              {snapshot.rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No participants yet. Admin can add execs on the Manage page.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Interesting fact */}
        {factRow && (
          <div className="mt-6 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 p-4 text-white shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-pink-100">Interesting fact</div>
            <div className="mt-1 text-sm">
              Most recent vehicle ordered: <strong>{factRow.latestVehicle}</strong> — taken by <strong>{factRow.name}</strong>.
            </div>
          </div>
        )}

        {/* Scorecards */}
        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Scorecards</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.rows.map((r, idx) => (
            <Scorecard key={r.salesExecId} rank={idx + 1} stats={r} />
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

function MetricCard({ meta, leaders }: { meta: { key: LeaderboardMetric; label: string; tone: string; format: (s: ExecMonthStats) => string }; leaders: ExecMonthStats[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`bg-gradient-to-r ${meta.tone} px-4 py-3 text-white`}>
        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">{meta.label}</div>
        <div className="mt-0.5 text-lg font-semibold">3 / 2 / 1 pts</div>
      </div>
      <div className="divide-y divide-slate-100">
        {leaders.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-500">No data yet</div>
        )}
        {leaders.map((r) => (
          <div key={r.salesExecId} className="flex items-center gap-3 px-4 py-2">
            <span className="w-5 text-sm font-semibold text-slate-500">{r.metricRanks[meta.key]}</span>
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
        ))}
      </div>
    </div>
  );
}

function Scorecard({ rank, stats }: { rank: number; stats: ExecMonthStats }) {
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
      {stats.latestVehicle && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          Latest vehicle: <span className="font-medium text-slate-800">{stats.latestVehicle}</span>
        </div>
      )}
    </div>
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
        <div className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          rank === 1 ? "bg-amber-100 text-amber-800" :
          rank === 2 ? "bg-slate-200 text-slate-800" :
                       "bg-orange-100 text-orange-800"
        }`}>
          {rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd"}
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
