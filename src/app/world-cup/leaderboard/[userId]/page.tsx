import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWcAccess } from "@/lib/auth-guard";
import { signOutAction } from "../../../login/actions";
import { loadConsensus, loadPlayerHistory } from "@/lib/world-cup-data";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  group: "Group", r32: "R32", r16: "R16", qf: "QF", sf: "SF", third: "3rd", final: "Final",
};

export default async function PlayerHistoryPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const me = await requireWcAccess();
  const { userId } = await params;
  const data = await loadPlayerHistory(userId);
  if (!data) notFound();

  const { player, rows } = data;
  const isMe = player.id === me.id;
  const consensus = await loadConsensus(rows.map((r) => r.fixtureNumber));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/world-cup/leaderboard" className="text-slate-500 hover:text-slate-900">← Leaderboard</Link>
          <div className="flex items-center gap-3">
            <span className="text-slate-700">{me.name}</span>
            <form action={signOutAction}>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {player.name}{isMe && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-900">you</span>}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {player.totalPoints} pts across {player.predictionsMade} settled prediction{player.predictionsMade === 1 ? "" : "s"}.
          Only matches that have been played are shown — future picks stay hidden.
        </p>

        {rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            No settled matches yet — check back once games have been played.
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((r) => (
              <li key={r.fixtureNumber}>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {/* Meta strip */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        {STAGE_LABEL[r.stage] ?? r.stage}{r.groupName ? ` ${r.groupName}` : ""}
                      </span>
                      <span className="text-slate-500">
                        {r.kickoffAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    {r.pick ? (
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${pointsTone(r.pick.points)}`}>
                        {r.pick.points === null ? "Pending" : `${r.pick.points} pt${r.pick.points === 1 ? "" : "s"}`}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">No pick · 0 pts</span>
                    )}
                  </div>

                  {/* Result vs pick */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                      <span className="truncate text-right" style={{ maxWidth: "44%" }}>{r.team1}</span>
                      <span className="font-mono text-2xl font-bold tabular-nums">
                        {r.actual.team1Goals}<span className="text-slate-300 mx-1">–</span>{r.actual.team2Goals}
                      </span>
                      <span className="truncate text-left" style={{ maxWidth: "44%" }}>{r.team2}</span>
                    </div>
                    {r.pick && (
                      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
                        <span>{isMe ? "You" : player.name} picked</span>
                        <span className="font-mono font-semibold text-slate-900">{r.pick.team1Goals}–{r.pick.team2Goals}</span>
                      </div>
                    )}
                    {(() => {
                      const c = consensus.get(r.fixtureNumber);
                      if (!c || c.total < 2) return null;
                      return (
                        <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[10px] text-slate-500">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5">
                            <span className="font-semibold text-slate-700">{c.exact}</span> of {c.total} on the score
                          </span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5">
                            <span className="font-semibold text-slate-700">{c.sameResult}</span> same result
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function pointsTone(p: number | null): string {
  if (p === null) return "bg-slate-100 text-slate-500";
  if (p >= 8) return "bg-emerald-200 text-emerald-900";
  if (p >= 3) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-500";
}
