import Link from "next/link";
import { requireLeaderboardAccess } from "@/lib/auth-guard";
import { isAdmin } from "@/lib/auth";
import { signOutAction } from "../login/actions";

export const dynamic = "force-dynamic";

// Phase 1 stub — the full leaderboard renders in phase 3. For now, point
// admins at the management page so they can configure participants and
// start uploading reports.
export default async function SalesLeaderboardPage() {
  const user = await requireLeaderboardAccess();
  const admin = isAdmin(user);
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
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Sales exec leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monthly competition across Order Take, Deliveries, Insurance Products, and
          Conversion %. 1st in each metric scores 3 pts, 2nd scores 2, 3rd scores 1.
        </p>
        <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">Leaderboard view is being built.</p>
          {admin && (
            <Link href="/sales-leaderboard/admin" className="mt-3 inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              Manage participants & uploads →
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
