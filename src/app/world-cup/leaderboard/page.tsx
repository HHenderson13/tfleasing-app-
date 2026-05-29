import Link from "next/link";
import { requireWcAccess } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import { loadLeaderboard } from "@/lib/world-cup-data";

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
              />
            ))}
          </section>
        )}

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Rank</th>
                <th className="px-4 py-2.5 text-left font-semibold">Player</th>
                <th className="px-4 py-2.5 text-right font-semibold">Picks</th>
                <th className="px-4 py-2.5 text-right font-semibold">Correct</th>
                <th className="px-4 py-2.5 text-right font-semibold">Exact</th>
                <th className="px-4 py-2.5 text-right font-semibold">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranked.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    No players yet — admins can grant World Cup access from the admin page (batch 3).
                  </td>
                </tr>
              ) : (
                ranked.map((r) => (
                  <tr key={r.userId} className={r.isMe ? "bg-emerald-50/50" : ""}>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{r.rank}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {r.name}{r.isMe && <span className="ml-1.5 rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">you</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">{r.predictionsMade}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">{r.correctResults}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">{r.exactScores}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-base font-semibold text-slate-900">{r.totalPoints}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function PodiumCard({ position, name, points, exact, isMe }: { position: number; name: string; points: number; exact: number; isMe: boolean }) {
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
    </div>
  );
}
