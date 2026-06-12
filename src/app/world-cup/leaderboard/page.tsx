import Link from "next/link";
import { Suspense } from "react";
import { requireWcAccess } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import { loadLeaderboard } from "@/lib/world-cup-data";
import { calculatePrizePool, fmtGbp } from "@/lib/world-cup-prize";
import { PaymentBanner } from "../payment-banner";

// Stays dynamic — the leaderboard highlights the current user's row, which
// can't be safely shared across users via ISR. Snappy navigation comes from
// loading.tsx in this directory.
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

  // Relegation zone — bottom 3, only when there's a meaningful field to be
  // "at the bottom" of (6+ players). Tracked separately from the table so
  // both the row renderer and the footer card can flag the same set.
  const relegationActive = ranked.length >= 6;
  const relegationIds = new Set(
    relegationActive ? ranked.slice(-3).map((r) => r.userId) : [],
  );
  const meInRelegation = relegationActive && relegationIds.has(user.id);

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
        <Suspense fallback={null}>
          <PaymentBanner userId={user.id} />
        </Suspense>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Updates the instant a result is entered. {ranked.length} player{ranked.length === 1 ? "" : "s"} in the running
          {relegationActive && <> — top 3 win the prize money, bottom 3 face relegation 🪦</>}.
        </p>

        {meInRelegation && (
          <div className="mt-4 rounded-2xl border-2 border-rose-300 bg-gradient-to-r from-rose-50 to-red-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl">😬</span>
              <div>
                <div className="text-sm font-bold text-rose-900">You&apos;re in the drop zone.</div>
                <p className="mt-1 text-xs text-rose-900/80">
                  Currently sitting in the bottom 3. Time to start nailing some predictions before this turns into a real
                  story you&apos;ll be telling at Christmas. There&apos;s no actual relegation — just the shame.
                </p>
              </div>
            </div>
          </div>
        )}

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
                  ranked.map((r) => {
                    const inRelegation = relegationIds.has(r.userId);
                    return (
                    <tr key={r.userId} className={`group transition hover:bg-emerald-50/60 ${r.isMe ? "bg-emerald-50/50" : ""} ${inRelegation ? "bg-rose-50/60" : ""}`}>
                      <td className="px-3 py-0 font-mono text-slate-500 sm:px-4">
                        <Link href={`/world-cup/leaderboard/${r.userId}`} className="block py-2.5 group-hover:text-slate-700">{r.rank}</Link>
                      </td>
                      <td className="px-3 py-0 font-medium text-slate-900 sm:px-4">
                        <Link href={`/world-cup/leaderboard/${r.userId}`} className="flex items-center gap-1.5 py-2.5 group-hover:underline">
                          <span className="truncate">{r.name}</span>
                          {r.isMe && <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">you</span>}
                          {inRelegation && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded bg-rose-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-900"
                              title="In the relegation zone — bottom 3"
                            >
                              ⚠ Drop
                            </span>
                          )}
                          {r.streak >= 2 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800 tabular-nums"
                              title={`${r.streak} correct results in a row`}
                            >
                              🔥 {r.streak}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-2 py-0 text-right font-mono text-slate-700 sm:px-4">
                        <Link href={`/world-cup/leaderboard/${r.userId}`} className="block py-2.5">{r.predictionsMade}</Link>
                      </td>
                      <td className="hidden px-2 py-0 text-right font-mono text-slate-700 sm:table-cell sm:px-4">
                        <Link href={`/world-cup/leaderboard/${r.userId}`} className="block py-2.5">{r.correctResults}</Link>
                      </td>
                      <td className="px-2 py-0 text-right font-mono text-slate-700 sm:px-4">
                        <Link href={`/world-cup/leaderboard/${r.userId}`} className="block py-2.5">{r.exactScores}</Link>
                      </td>
                      <td className="px-3 py-0 text-right font-mono text-base font-semibold text-slate-900 sm:px-4">
                        <Link href={`/world-cup/leaderboard/${r.userId}`} className="block py-2.5">{r.totalPoints}</Link>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {relegationActive && (
          <RelegationCard
            bottom3={ranked.slice(-3).map((r) => ({ name: r.name, points: r.totalPoints, isMe: r.isMe }))}
          />
        )}
      </main>
    </div>
  );
}

function RelegationCard({ bottom3 }: { bottom3: { name: string; points: number; isMe: boolean }[] }) {
  // bottom3 arrives in leaderboard order — so last entry is dead last. Render
  // dead-last first so the eye lands on the saddest case immediately.
  const ordered = [...bottom3].reverse();
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">🪦 Relegation zone</div>
          <h2 className="mt-0.5 text-lg font-bold text-rose-900">The bottom 3</h2>
        </div>
        <span className="text-[11px] italic text-rose-700/80">no actual relegation, just public humiliation</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {ordered.map((p, i) => {
          // i=0 is dead last, i=1 is second-last, i=2 is third-from-last
          const place = ["💀 Dead last", "🪤 Second from bottom", "🩹 Third from bottom"][i];
          return (
            <div
              key={p.name}
              className={`rounded-xl border bg-white/70 p-3 shadow-sm ${p.isMe ? "border-rose-400 ring-2 ring-rose-200" : "border-rose-200"}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">{place}</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-base font-bold text-slate-900">
                  {p.name}{p.isMe && " (you)"}
                </span>
                <span className="shrink-0 font-mono text-base font-semibold tabular-nums text-rose-700">{p.points} pts</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] italic text-rose-800/80">
        Climb out before the group stage ends or risk becoming this office&apos;s ongoing punchline.
      </p>
    </section>
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
