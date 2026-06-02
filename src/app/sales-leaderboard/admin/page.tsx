import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import { loadAdminContext } from "./actions";
import { LeaderboardAdminView } from "./view";
import { currentYearMonth } from "@/lib/sales-leaderboard";
import { loadDeptDashboard } from "@/lib/sales-leaderboard-data";

export const dynamic = "force-dynamic";

export default async function SalesLeaderboardAdminPage() {
  const user = await requireAdmin();
  const month = currentYearMonth();
  const [ctx, dashboard] = await Promise.all([
    loadAdminContext(),
    loadDeptDashboard(month),
  ]);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/sales-leaderboard" className="text-slate-500 hover:text-slate-900">← Leaderboard</Link>
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
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Leaderboard admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick which execs compete, map their report short-codes, and upload the Dealerweb reports each day.
        </p>
        <LeaderboardAdminView
          execs={ctx.execs}
          nameMap={ctx.nameMap}
          lastUploads={ctx.lastUploads}
          initialYearMonth={month}
          dashboard={dashboard}
        />
      </main>
    </div>
  );
}
