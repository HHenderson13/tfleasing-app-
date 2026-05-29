import Link from "next/link";
import { db } from "@/db";
import { users, wcFixtures, wcResults } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireWcAdmin } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import { AdminClient } from "./client";

export const dynamic = "force-dynamic";

export default async function WcAdminPage() {
  const user = await requireWcAdmin();

  const [fixtures, results, allUsers] = await Promise.all([
    db.select().from(wcFixtures).orderBy(wcFixtures.kickoffAt, wcFixtures.fixtureNumber),
    db.select().from(wcResults),
    db.select({ id: users.id, name: users.name, email: users.email, roles: users.roles }).from(users).orderBy(users.name),
  ]);

  const resultByFx = new Map(results.map((r) => [r.fixtureNumber, r]));
  const fixturesWithResults = fixtures.map((f) => ({
    fixtureNumber: f.fixtureNumber,
    stage: f.stage,
    groupName: f.groupName,
    kickoffAt: f.kickoffAt.toISOString(),
    stadium: f.stadium,
    team1: f.team1,
    team2: f.team2,
    nextFixtureNumber: f.nextFixtureNumber,
    nextSlot: f.nextSlot,
    result: resultByFx.has(f.fixtureNumber)
      ? {
          team1Goals: resultByFx.get(f.fixtureNumber)!.team1Goals,
          team2Goals: resultByFx.get(f.fixtureNumber)!.team2Goals,
          etTeam1Goals: resultByFx.get(f.fixtureNumber)!.etTeam1Goals,
          etTeam2Goals: resultByFx.get(f.fixtureNumber)!.etTeam2Goals,
          penTeam1: resultByFx.get(f.fixtureNumber)!.penTeam1,
          penTeam2: resultByFx.get(f.fixtureNumber)!.penTeam2,
          winnerTeam: resultByFx.get(f.fixtureNumber)!.winnerTeam,
        }
      : null,
  }));

  const usersWithLevel = allUsers.map((u) => {
    const roles: string[] = JSON.parse(u.roles || "[]");
    const level: "none" | "wc" | "wc_admin" | "admin" = roles.includes("admin")
      ? "admin"
      : roles.includes("wc_admin")
        ? "wc_admin"
        : roles.includes("wc")
          ? "wc"
          : "none";
    return { id: u.id, name: u.name, email: u.email, level };
  });

  // Quick counters for the page header.
  const settledCount = results.length;
  const playerCount = usersWithLevel.filter((u) => u.level !== "none").length;

  // Cheap aggregate of total points distributed — helps admin verify the
  // scoring engine is wired up correctly.
  const totalPointsRow = await db.all<{ total: number }>(sql`
    SELECT COALESCE(SUM(points), 0) AS total FROM wc_predictions
  `);
  const totalPoints = Number(totalPointsRow[0]?.total ?? 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-sm">
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

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">World Cup · Admin</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Enter results · Manage players · Resolve bracket</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Type the final score, hit Save — the system scores everyone's predictions, advances the winner to the next round
              (knockouts), and refreshes the leaderboard.
            </p>
          </div>
          <div className="flex gap-6 text-right text-sm">
            <Counter label="Results entered" value={`${settledCount} / 104`} />
            <Counter label="Players" value={String(playerCount)} />
            <Counter label="Points awarded" value={totalPoints.toLocaleString()} />
          </div>
        </div>

        <AdminClient
          fixtures={fixturesWithResults}
          users={usersWithLevel}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
