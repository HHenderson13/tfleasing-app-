"use client";

import { useState, useTransition } from "react";
import { savePredictionAction } from "../actions";
import type { FixtureConsensus, FixtureWithMyPrediction } from "@/lib/world-cup-data";

interface StageGroup {
  stage: string;
  fixtures: FixtureWithMyPrediction[];
}

const STAGE_LABELS: Record<string, string> = {
  group: "Group stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  third: "Third-place playoff",
  final: "Final",
};

export function PredictionsClient({ stages, consensusByFx }: { stages: StageGroup[]; consensusByFx: Record<string, FixtureConsensus> }) {
  return (
    <div className="mt-6 space-y-8">
      {/* Sticky stage jump-nav — quick way to skip ahead on a long list,
          especially useful on mobile where scroll is the main interaction. */}
      <nav className="sticky top-0 z-10 -mx-6 overflow-x-auto bg-slate-50/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/70">
        <ul className="flex gap-1.5 text-xs">
          {stages.map((s) => (
            <li key={s.stage}>
              <a
                href={`#stage-${s.stage}`}
                className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                {STAGE_LABELS[s.stage] ?? s.stage}
                <span className="ml-1.5 text-slate-400">{s.fixtures.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {stages.map((s) => (
        <section key={s.stage} id={`stage-${s.stage}`} className="scroll-mt-20">
          <StageHeading stage={s.stage} count={s.fixtures.length} />
          <ul className="mt-3 space-y-3">
            {s.fixtures.map((f) => (
              <li key={f.fixtureNumber}>
                <FixtureCard fixture={f} consensus={consensusByFx[f.fixtureNumber]} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StageHeading({ stage, count }: { stage: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{STAGE_LABELS[stage] ?? stage}</h2>
      <span className="text-xs text-slate-500">{count} match{count === 1 ? "" : "es"}</span>
    </div>
  );
}

// Card layout — stacks vertically on phones, lays out horizontally only when
// there's room (≥ sm). The score input takes centre stage on mobile so the
// thumb can hit it without zooming.
function FixtureCard({ fixture: f, consensus }: { fixture: FixtureWithMyPrediction; consensus?: FixtureConsensus }) {
  const settled = !!f.result;
  const teamsKnown = !!(f.team1 && f.team2);
  const cardTone = settled
    ? "border-emerald-200 bg-emerald-50/30"
    : f.isLocked
      ? "border-slate-200 bg-slate-50/60"
      : "border-slate-200 bg-white";

  return (
    <div className={`overflow-hidden rounded-2xl border ${cardTone} shadow-sm`}>
      {/* Meta strip */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <StageChip stage={f.stage} group={f.groupName} />
          {f.stadium && <span className="truncate text-slate-500">{f.stadium}</span>}
        </div>
        <div className="shrink-0 text-right text-slate-500">
          <div className="font-medium text-slate-700">
            {f.kickoffAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </div>
          <div className="text-[10px] text-slate-400">
            {f.kickoffAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} UK
          </div>
        </div>
      </div>

      {/* Teams + score input — stacked on mobile, big touch targets */}
      <div className="px-4 py-4">
        {teamsKnown ? (
          settled ? <SettledTeams fixture={f} consensus={consensus} /> :
          f.isLocked ? <LockedTeams fixture={f} /> :
          <EditableTeams fixture={f} />
        ) : (
          <p className="py-2 text-center text-sm italic text-slate-400">
            Teams not set yet — waiting for the bracket to advance.
          </p>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Editable state — mobile-first stacked layout with big inputs
// ──────────────────────────────────────────────────────────────
function EditableTeams({ fixture: f }: { fixture: FixtureWithMyPrediction }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(!!f.myPrediction);
  const [t1, setT1] = useState<string>(f.myPrediction?.team1Goals.toString() ?? "");
  const [t2, setT2] = useState<string>(f.myPrediction?.team2Goals.toString() ?? "");

  function attemptSave(nextT1: string, nextT2: string) {
    setErr(null); setSaved(false);
    if (nextT1 === "" || nextT2 === "") return;
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
      if (!res.ok) { setErr(res.error ?? "Save failed"); setSaved(false); }
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      {/* Team names — equal weight either side */}
      <div className="flex items-center justify-between text-base font-semibold text-slate-900 sm:text-lg">
        <span className="truncate text-right" style={{ maxWidth: "44%" }}>{f.team1}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">vs</span>
        <span className="truncate text-left" style={{ maxWidth: "44%" }}>{f.team2}</span>
      </div>
      {/* Score input — two big numeric boxes with a dash between */}
      <div className="flex items-center justify-center gap-3">
        <GoalsInput
          value={t1}
          ariaLabel={`${f.team1} goals`}
          onChange={(v) => { setT1(v); attemptSave(v, t2); }}
        />
        <span className="font-mono text-2xl text-slate-300">–</span>
        <GoalsInput
          value={t2}
          ariaLabel={`${f.team2} goals`}
          onChange={(v) => { setT2(v); attemptSave(t1, v); }}
        />
      </div>
      <div className="text-center">
        <PickStatus pending={pending} saved={saved} err={err} hasPrediction={!!f.myPrediction} />
      </div>
    </div>
  );
}

function PickStatus({ pending, saved, err, hasPrediction }: { pending: boolean; saved: boolean; err: string | null; hasPrediction: boolean }) {
  if (err) return <span className="text-[11px] text-red-600">{err}</span>;
  if (pending) return <span className="text-[11px] uppercase tracking-wide text-emerald-700">Saving…</span>;
  if (saved || hasPrediction) return <span className="text-[11px] uppercase tracking-wide text-emerald-700">Saved</span>;
  return <span className="text-[11px] uppercase tracking-wide text-slate-400">Pick a score</span>;
}

// ──────────────────────────────────────────────────────────────
// Locked / Settled states
// ──────────────────────────────────────────────────────────────
function LockedTeams({ fixture: f }: { fixture: FixtureWithMyPrediction }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-slate-900 sm:text-lg">{f.team1}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">vs</span>
        <span className="text-base font-semibold text-slate-900 sm:text-lg">{f.team2}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Locked
        </span>
        {f.myPrediction ? (
          <span className="font-mono text-base text-slate-700">
            You: <span className="text-slate-900">{f.myPrediction.team1Goals}–{f.myPrediction.team2Goals}</span>
          </span>
        ) : (
          <span className="text-red-600">Missed</span>
        )}
      </div>
    </div>
  );
}

function SettledTeams({ fixture: f, consensus }: { fixture: FixtureWithMyPrediction; consensus?: FixtureConsensus }) {
  const r = f.result!;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-right text-base font-semibold text-slate-900 sm:text-lg">{f.team1}</div>
        <div className="flex items-baseline gap-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
          <span>{r.team1Goals}</span>
          <span className="text-slate-400">–</span>
          <span>{r.team2Goals}</span>
        </div>
        <div className="text-left text-base font-semibold text-slate-900 sm:text-lg">{f.team2}</div>
      </div>
      {f.myPrediction ? (
        <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 text-xs ring-1 ring-emerald-100">
          <span className="text-slate-600">
            You: <span className="font-mono font-semibold text-slate-900">{f.myPrediction.team1Goals}–{f.myPrediction.team2Goals}</span>
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${pointsTone(f.myPrediction.points)}`}>
            {f.myPrediction.points === null ? "Pending" : `${f.myPrediction.points} pt${f.myPrediction.points === 1 ? "" : "s"}`}
          </span>
        </div>
      ) : (
        <div className="rounded-lg bg-white/60 px-3 py-2 text-center text-xs text-slate-400 ring-1 ring-slate-100">
          No prediction · 0 pts
        </div>
      )}
      <ConsensusChip consensus={consensus} />
    </div>
  );
}

// Subtle stat: how many players got it right, no "vs. the office" labelling.
// Hidden when there are fewer than 2 predictions in total.
function ConsensusChip({ consensus }: { consensus?: FixtureConsensus }) {
  if (!consensus || consensus.total < 2) return null;
  const exactPct = Math.round((consensus.exact / consensus.total) * 100);
  return (
    <div className="flex flex-wrap justify-center gap-1.5 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
        <span className="font-semibold text-slate-700">{consensus.exact}</span>
        <span>of {consensus.total} on the score</span>
        {exactPct > 0 && <span className="text-slate-400">({exactPct}%)</span>}
      </span>
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
        <span className="font-semibold text-slate-700">{consensus.sameResult}</span>
        <span>same result</span>
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

// Big numeric input — 44pt min height on mobile (Apple HIG touch target).
function GoalsInput({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min="0"
      max="20"
      step="1"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 rounded-xl border-2 border-slate-300 bg-white py-2 text-center font-mono text-2xl font-bold tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 sm:w-20 sm:py-3 sm:text-3xl"
    />
  );
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
