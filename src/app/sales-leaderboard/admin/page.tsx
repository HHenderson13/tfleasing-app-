import { AppBar } from "@/components/ui";
import { requireAdmin } from "@/lib/auth-guard";
import { loadAdminContext } from "./actions";
import { LeaderboardAdminView } from "./view";
import { currentYearMonth } from "@/lib/sales-leaderboard";
import { loadDeptDashboard } from "@/lib/sales-leaderboard-data";

export const dynamic = "force-dynamic";

export default async function SalesLeaderboardAdminPage() {
  await requireAdmin();
  const month = currentYearMonth();
  const [ctx, dashboard] = await Promise.all([
    loadAdminContext(),
    loadDeptDashboard(month),
  ]);
  return (
    <div className="min-h-screen bg-slate-50">
      <AppBar back="/sales-leaderboard" backLabel="Pole Position" width="5xl" />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <h1 className="font-semibold text-slate-900 text-[28px] leading-tight tracking-tight sm:text-[34px]">Pole Position admin</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">
          Pick which execs compete and map their report short-codes. The Dealerweb reports are uploaded once, on 10 at 10, which feeds the board.
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
