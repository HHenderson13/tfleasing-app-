import Link from "next/link";
import { requireWcAccess } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import { loadGroupViews } from "@/lib/world-cup-data";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await requireWcAccess();
  const groups = await loadGroupViews();

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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Group standings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live tables — recompute the instant a group-stage result is entered. Top two from each group advance automatically;
          the eight best third-placed teams join them in the Round of 32.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.groupName} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <div className="text-base font-semibold text-slate-900">Group {g.groupName}</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="pl-4 pr-2 py-2 text-left font-semibold sm:pl-5">Team</th>
                    <th className="px-1 py-2 text-right font-semibold sm:px-1.5">P</th>
                    <th className="px-1 py-2 text-right font-semibold sm:px-1.5">W</th>
                    <th className="hidden px-1 py-2 text-right font-semibold sm:table-cell sm:px-1.5">D</th>
                    <th className="hidden px-1 py-2 text-right font-semibold sm:table-cell sm:px-1.5">L</th>
                    <th className="px-1 py-2 text-right font-semibold sm:px-1.5">GD</th>
                    <th className="pl-1 pr-4 py-2 text-right font-semibold sm:pl-1.5 sm:pr-5">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.standings.map((row, i) => (
                    <tr key={row.team} className={i < 2 ? "bg-emerald-50/40" : ""}>
                      <td className="pl-4 pr-2 py-2 font-medium text-slate-900 sm:pl-5">
                        <span className="inline-block min-w-[20px] text-slate-400 mr-1.5">{i + 1}</span>{row.team}
                      </td>
                      <td className="px-1 py-2 text-right font-mono text-xs text-slate-700 sm:px-1.5">{row.played}</td>
                      <td className="px-1 py-2 text-right font-mono text-xs text-slate-700 sm:px-1.5">{row.won}</td>
                      <td className="hidden px-1 py-2 text-right font-mono text-xs text-slate-700 sm:table-cell sm:px-1.5">{row.drawn}</td>
                      <td className="hidden px-1 py-2 text-right font-mono text-xs text-slate-700 sm:table-cell sm:px-1.5">{row.lost}</td>
                      <td className={`px-1 py-2 text-right font-mono text-xs sm:px-1.5 ${row.goalDiff > 0 ? "text-emerald-700" : row.goalDiff < 0 ? "text-red-700" : "text-slate-500"}`}>
                        {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                      </td>
                      <td className="pl-1 pr-4 py-2 text-right font-mono text-sm font-semibold text-slate-900 sm:pl-1.5 sm:pr-5">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-2 text-[11px] text-slate-500">
                {g.fixtures.filter((f) => f.result).length}/{g.fixtures.length} matches played
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
