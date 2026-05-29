import Link from "next/link";
import { requireWcAccess } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import { loadLeaderboard } from "@/lib/world-cup-data";
import { calculatePrizePool, fmtGbp } from "@/lib/world-cup-prize";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await requireWcAccess();
  const rows = await loadLeaderboard();

  // Rank with ties — same points = same rank.
  let currentRank = 0;
  let lastPoints: number | null = null;
  const ranked = rows.map((r, i) => {
    if (r.totalPoints !== lastPoints) {
      currentRank = i + 1;
      lastPoints = r.totalPoints;
    }
    return { ...r, rank: currentRank, isMe: r.userId === user.id };
  });

  const top = ranked.slice(0, 3);
  const prize = calculatePrizePool(rows.length);
  const prizeByRank: Record<number, number> = { 1: prize.first, 2: prize.second, 3: prize.third };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/world-cup" className="text-slate-500 hover:text-slate-900">← World Cup</Link>
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

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Updates the instant a result is entered. {ranked.length} player{ranked.length === 1 ? "" : "s"} in the running.
        </p>

        {top.length > 0 && (
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            {top.map((p, i) => (
              <PodiumCard
                key={p.userId}
                position={i + 1}
                name={p.name}
                points={p.totalPoints}
                exact={p.exactScores}
                isMe={p.isMe}
                prize={prizeByRank[i + 1]}
              />
            ))}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Prize pool</div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{fmtGbp(prize.totalPool)}</div>
            </div>
            <div className="flex gap-4 text-xs text-amber-800">
              <span><span className="font-semibold">1st</span> {fmtGbp(prize.first)}</span>
              <span><span className="font-semibold">2nd</span> {fmtGbp(prize.second)}</span>
              <span><span className="font-semibold">3rd</span> {fmtGbp(prize.third)}</span>
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold sm:px-4">Rank</th>
                  <th className="px-3 py-2.5 text-left font-semibold sm:px-4">Player</th>
                  <th className="px-2 py-2.5 text-right font-semibold sm:px-4">Picks</th>
                  <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell sm:px-4">Correct</th>
                  <th className="px-2 py-2.5 text-right font-semibold sm:px-4">Exact</th>
                  <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranked.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                      No players yet — admin can grant access from the Players tab.
                    </td>
                  </tr>
                ) : (
                  ranked.map((r) => (
                    <tr key={r.userId} className={r.isMe ? "bg-emerald-50/50" : ""}>
                      <td className="px-3 py-2.5 font-mono text-slate-500 sm:px-4">{r.rank}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 sm:px-4">
                        <span className="truncate">{r.name}</span>{r.isMe && <span className="ml-1.5 rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">you</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-slate-700 sm:px-4">{r.predictionsMade}</td>
                      <td className="hidden px-2 py-2.5 text-right font-mono text-slate-700 sm:table-cell sm:px-4">{r.correctResults}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-slate-700 sm:px-4">{r.exactScores}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-base font-semibold text-slate-900 sm:px-4">{r.totalPoints}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function PodiumCard({ position, name, points, exact, isMe, prize }: { position: number; name: string; points: number; exact: number; isMe: boolean; prize: number | undefined }) {
  const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : "🥉";
  const tone =
    position === 1 ? "border-amber-300 bg-amber-50" :
    position === 2 ? "border-slate-300 bg-slate-50" :
    "border-orange-300 bg-orange-50";
  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 ${tone} p-5 shadow-sm`}>
      <div className="flex items-baseline justify-between">
        <span className="text-3xl">{medal}</span>
        <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900">{points}</span>
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-slate-900">{name}{isMe && " (you)"}</div>
      <div className="mt-0.5 text-xs text-slate-500">{exact} exact scoreline{exact === 1 ? "" : "s"}</div>
      {prize !== undefined && prize > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-white/60 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
          On track for {fmtGbp(prize)}
        </div>
      )}
    </div>
  );
}
