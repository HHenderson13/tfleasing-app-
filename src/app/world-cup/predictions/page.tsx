import Link from "next/link";
import { requireWcAccess } from "@/lib/auth-guard";
import { signOutAction } from "../../login/actions";
import { listFixturesWithMyPredictions } from "@/lib/world-cup-data";
import { PredictionsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const user = await requireWcAccess();
  const fixtures = await listFixturesWithMyPredictions(user.id);

  // Group fixtures by stage so the page reads as a tournament timeline.
  const byStage = new Map<string, typeof fixtures>();
  for (const f of fixtures) {
    if (!byStage.has(f.stage)) byStage.set(f.stage, []);
    byStage.get(f.stage)!.push(f);
  }

  // Stable stage order: group → r32 → r16 → qf → sf → third → final.
  const STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "third", "final"];
  const ordered = STAGE_ORDER.filter((s) => byStage.has(s)).map((s) => ({
    stage: s,
    fixtures: byStage.get(s)!,
  }));

  // Quick summary numbers for the page header.
  const totalPickable = fixtures.filter((f) => f.team1 && f.team2).length;
  const myPicks = fixtures.filter((f) => f.myPrediction).length;
  const lockedAndUnpicked = fixtures.filter((f) => f.isLocked && !f.myPrediction && f.team1 && f.team2).length;

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
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My predictions</h1>
          <div className="text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-900">{myPicks}</span> /
            <span className="font-mono"> {totalPickable}</span> matches picked
            {lockedAndUnpicked > 0 && (
              <span className="ml-3 text-red-600">{lockedAndUnpicked} missed</span>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Predictions lock at kick-off (UK time). After that, you can still see your pick but can't change it.
          Knockout matches unlock as the bracket advances.
        </p>

        <PredictionsClient stages={ordered} />
      </main>
    </div>
  );
}
