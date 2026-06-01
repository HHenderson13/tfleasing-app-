import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";

export const dynamic = "force-dynamic";

// Phase 1 stub. Phase 2 wires up participants, photo upload, name mapping,
// and the three report uploads with parsing.
export default async function SalesLeaderboardAdminPage() {
  const user = await requireAdmin();
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
        <p className="mt-1 text-sm text-slate-500">Participants, name mapping and daily report uploads.</p>
        <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Admin tools are being built next.
        </div>
      </main>
    </div>
  );
}
