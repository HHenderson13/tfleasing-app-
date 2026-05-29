"use client";

import { useState, useTransition } from "react";
import { savePredictionAction } from "../actions";
import type { FixtureWithMyPrediction } from "@/lib/world-cup-data";

interface StageGroup {
  stage: string;
  fixtures: FixtureWithMyPrediction[];
}

export function PredictionsClient({ stages }: { stages: StageGroup[] }) {
  return (
    <div className="mt-6 space-y-8">
      {stages.map((s) => (
        <section key={s.stage}>
          <StageHeading stage={s.stage} count={s.fixtures.length} />
          <ul className="mt-3 space-y-2">
            {s.fixtures.map((f) => (
              <li key={f.fixtureNumber}>
                <FixtureRow fixture={f} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StageHeading({ stage, count }: { stage: string; count: number }) {
  const label = {
    group: "Group stage",
    r32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarter-finals",
    sf: "Semi-finals",
    third: "Third-place playoff",
    final: "Final",
  }[stage] ?? stage;
  return (
    <div className="flex items-baseline justify-between border-b border-slate-200 pb-1.5">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{label}</h2>
      <span className="text-xs text-slate-500">{count} match{count === 1 ? "" : "es"}</span>
    </div>
  );
}

function FixtureRow({ fixture: f }: { fixture: FixtureWithMyPrediction }) {
  const settled = !!f.result;
  const locked = f.isLocked;
  const teamsKnown = !!(f.team1 && f.team2);

  return (
    <div className={`overflow-hidden rounded-xl border ${settled ? "border-emerald-200 bg-emerald-50/30" : locked ? "border-slate-200 bg-slate-50/50" : "border-slate-200 bg-white"} shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <StageChip stage={f.stage} group={f.groupName} />
          <div className="min-w-0">
            <div className={`truncate font-medium ${teamsKnown ? "text-slate-900" : "text-slate-400"}`}>
              {f.team1 ?? "TBD"} <span className="text-slate-400">vs</span> {f.team2 ?? "TBD"}
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {f.kickoffAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              {" · "}
              {f.kickoffAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} UK
              {f.stadium ? ` · ${f.stadium}` : ""}
            </div>
          </div>
        </div>
        <PredictionWidget fixture={f} />
      </div>
    </div>
  );
}

function PredictionWidget({ fixture: f }: { fixture: FixtureWithMyPrediction }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [t1, setT1] = useState<string>(f.myPrediction?.team1Goals.toString() ?? "");
  const [t2, setT2] = useState<string>(f.myPrediction?.team2Goals.toString() ?? "");

  const teamsKnown = !!(f.team1 && f.team2);
  if (!teamsKnown) {
    return <span className="text-xs italic text-slate-400">Teams not set yet</span>;
  }

  if (f.result) {
    return (
      <div className="flex items-center gap-3">
        <ResultPill result={f.result} />
        {f.myPrediction ? (
          <PointsBadge points={f.myPrediction.points} prediction={f.myPrediction} />
        ) : (
          <span className="text-[11px] uppercase tracking-wide text-slate-400">No pick · 0 pts</span>
        )}
      </div>
    );
  }

  if (f.isLocked) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Locked</span>
        {f.myPrediction ? (
          <span className="font-mono text-sm text-slate-700">{f.myPrediction.team1Goals}–{f.myPrediction.team2Goals}</span>
        ) : (
          <span className="text-slate-400">No pick</span>
        )}
      </div>
    );
  }

  function save(nextT1: string, nextT2: string) {
    const n1 = Number(nextT1);
    const n2 = Number(nextT2);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) return;
    if (n1 < 0 || n2 < 0 || n1 > 20 || n2 > 20) return;
    start(async () => {
      const res = await savePredictionAction({
        fixtureNumber: f.fixtureNumber,
        team1Goals: n1,
        team2Goals: n2,
      });
      if (!res.ok) setErr(res.error ?? "Save failed");
      else setErr(null);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <GoalsInput value={t1} onChange={(v) => { setT1(v); }} onBlur={() => { if (t1 !== "" && t2 !== "") save(t1, t2); }} ariaLabel={`${f.team1 ?? ""} goals`} />
      <span className="text-slate-400">–</span>
      <GoalsInput value={t2} onChange={(v) => { setT2(v); }} onBlur={() => { if (t1 !== "" && t2 !== "") save(t1, t2); }} ariaLabel={`${f.team2 ?? ""} goals`} />
      <span className={`text-[10px] uppercase tracking-wide ${err ? "text-red-600" : pending ? "text-emerald-600" : f.myPrediction ? "text-emerald-700" : "text-slate-400"}`}>
        {err ?? (pending ? "Saving…" : f.myPrediction ? "Saved" : "Pick a score")}
      </span>
    </div>
  );
}

function GoalsInput({ value, onChange, onBlur, ariaLabel }: { value: string; onChange: (v: string) => void; onBlur: () => void; ariaLabel: string }) {
  return (
    <input
      type="number"
      min="0"
      max="20"
      step="1"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="w-12 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono text-base text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
    />
  );
}

function ResultPill({ result }: { result: { team1Goals: number; team2Goals: number; winnerTeam: string } }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-emerald-900">
      {result.team1Goals}–{result.team2Goals}
    </span>
  );
}

function PointsBadge({ points, prediction }: { points: number | null; prediction: { team1Goals: number; team2Goals: number } }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-mono text-slate-500">you: {prediction.team1Goals}–{prediction.team2Goals}</span>
      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${pointsTone(points)}`}>
        {points === null ? "Pending" : `${points} pt${points === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

function pointsTone(p: number | null): string {
  if (p === null) return "bg-slate-100 text-slate-500";
  if (p >= 8) return "bg-emerald-200 text-emerald-900";
  if (p >= 3) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-500";
}

function StageChip({ stage, group }: { stage: string; group: string | null }) {
  const chip = stage === "group" && group ? `GRP ${group}` :
    stage === "r32" ? "R32" :
    stage === "r16" ? "R16" :
    stage === "qf" ? "QF" :
    stage === "sf" ? "SF" :
    stage === "third" ? "3rd" :
    stage === "final" ? "FINAL" : stage.toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
      {chip}
    </span>
  );
}
