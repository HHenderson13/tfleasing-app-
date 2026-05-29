import Link from "next/link";
import { db } from "@/db";
import { wcFixtures } from "@/db/schema";
import { count, eq, gte, sql } from "drizzle-orm";
import { requireWcAccess } from "@/lib/auth-guard";
import { isWcAdmin } from "@/lib/auth";
import { signOutAction } from "../login/actions";
import { loadLeaderboard } from "@/lib/world-cup-data";

export const dynamic = "force-dynamic";

export default async function WorldCupPage() {
  const user = await requireWcAccess();
  const admin = isWcAdmin(user);

  const now = new Date();

  // Cheap counts + leaderboard so the page can show personalised standing.
  const [groupCountRow, upcomingRow, totalRow, leaderboard] = await Promise.all([
    db.select({ n: count() }).from(wcFixtures).where(eq(wcFixtures.stage, "group")),
    db.select({ n: count() }).from(wcFixtures).where(gte(wcFixtures.kickoffAt, now)),
    db.select({ n: count() }).from(wcFixtures),
    loadLeaderboard(),
  ]);

  let myRank: number | null = null;
  let myPoints = 0;
  let myExact = 0;
  // Tied players share a rank — same algorithm as the leaderboard page.
  let cursor = 0;
  let lastPoints: number | null = null;
  for (let i = 0; i < leaderboard.length; i++) {
    if (leaderboard[i].totalPoints !== lastPoints) {
      cursor = i + 1;
      lastPoints = leaderboard[i].totalPoints;
    }
    if (leaderboard[i].userId === user.id) {
      myRank = cursor;
      myPoints = leaderboard[i].totalPoints;
      myExact = leaderboard[i].exactScores;
      break;
    }
  }
  const playerCount = leaderboard.length;

  const groupCount = groupCountRow[0]?.n ?? 0;
  const upcomingCount = upcomingRow[0]?.n ?? 0;
  const totalCount = totalRow[0]?.n ?? 0;

  // Next 5 group fixtures by kickoff — the "what's coming up" rail.
  const next5 = await db
    .select()
    .from(wcFixtures)
    .where(sql`${wcFixtures.kickoffAt} >= ${Math.floor(now.getTime() / 1000)}`)
    .orderBy(wcFixtures.kickoffAt)
    .limit(5);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/" className="text-slate-500 hover:text-slate-900">← Back to portal</Link>
          <div className="flex items-center gap-3">
            <span className="text-slate-700">{user.name}</span>
            <form action={signOutAction}>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-700" />
          <div className="px-7 pt-7 pb-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {admin ? "Admin · Play + manage" : "Office prediction game"}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">FIFA World Cup 2026</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Predict scorelines for every match. Score 2 pts for the right total goals,
              3 pts for the right result, and 5 pts when you call the exact scoreline.
              Group games open now; knockout rounds unlock as results land.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/world-cup/predictions"
                className="inline-flex rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Make predictions →
              </Link>
              <Link
                href="/world-cup/leaderboard"
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Leaderboard
              </Link>
              <Link
                href="/world-cup/groups"
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Group tables
              </Link>
              {admin && (
                <Link
                  href="/world-cup/admin"
                  className="inline-flex rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-emerald-50/40">
            <Pill label="Group games" value={groupCount.toLocaleString()} />
            <Pill label="Upcoming matches" value={upcomingCount.toLocaleString()} />
            <Pill label="Total fixtures" value={totalCount.toLocaleString()} />
          </div>
        </section>

        {myRank !== null && (
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <StandingCard label="Your rank" value={`#${myRank}`} sub={`of ${playerCount} player${playerCount === 1 ? "" : "s"}`} tone={myRank <= 3 ? "amber" : "slate"} />
            <StandingCard label="Your points" value={myPoints.toString()} sub="total this tournament" tone="emerald" />
            <StandingCard label="Exact scorelines" value={myExact.toString()} sub="5 points each" tone="teal" />
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Coming up</h2>
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {next5.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-slate-400">No upcoming fixtures yet — kicks off June 2026.</li>
            ) : (
              next5.map((f) => (
                <li key={f.fixtureNumber} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex shrink-0 items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      {stageChip(f.stage, f.groupName)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">
                        {f.team1 ?? "TBD"} <span className="text-slate-400">vs</span> {f.team2 ?? "TBD"}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">{f.stadium}{f.city ? ` · ${f.city}` : ""}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-500">
                    {f.kickoffAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    <div className="text-[10px] text-slate-400">
                      {f.kickoffAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} UK
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 text-xs text-slate-600">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scoring</h3>
          <table className="mt-3 w-full max-w-md text-left">
            <tbody>
              <tr><td className="py-1 font-mono font-semibold text-slate-900">+5 pts</td><td className="py-1 text-slate-600">Exact scoreline (e.g. you said 2-1, it ended 2-1)</td></tr>
              <tr><td className="py-1 font-mono font-semibold text-slate-900">+3 pts</td><td className="py-1 text-slate-600">Correct result — win, draw, or loss</td></tr>
              <tr><td className="py-1 font-mono font-semibold text-slate-900">+2 pts</td><td className="py-1 text-slate-600">Correct total goals scored</td></tr>
              <tr><td className="py-1 font-mono font-semibold text-slate-900">10 pts max</td><td className="py-1 text-slate-600">Per match</td></tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function StandingCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "amber" | "emerald" | "teal" | "slate" }) {
  const t = {
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", num: "text-amber-900" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", num: "text-emerald-900" },
    teal: { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", num: "text-teal-900" },
    slate: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", num: "text-slate-900" },
  }[tone];
  return (
    <div className={`rounded-2xl border ${t.border} ${t.bg} p-5 shadow-sm`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className={`mt-0.5 text-3xl font-semibold tabular-nums ${t.num}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function stageChip(stage: string, group: string | null): string {
  if (stage === "group" && group) return `GRP ${group}`;
  if (stage === "r32") return "R32";
  if (stage === "r16") return "R16";
  if (stage === "qf") return "QF";
  if (stage === "sf") return "SF";
  if (stage === "third") return "3rd";
  if (stage === "final") return "FINAL";
  return stage.toUpperCase();
}
