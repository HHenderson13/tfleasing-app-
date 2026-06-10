"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveApiResponse, LivePlayerEntry } from "@/app/api/world-cup/live/route";

type MatchData = LiveApiResponse["matches"][number];

// One detected goal — accumulated client-side by diffing consecutive polls.
interface GoalEvent {
  id: string;             // unique key (`fx-team-counter`)
  team: 1 | 2;
  teamName: string;
  minute: number | null;
  scoreAtGoal: string;    // "1-0"
  at: number;             // Date.now() when we detected it
}

// Polls /api/world-cup/live every 15 seconds while the page is open. The
// route caches the upstream ESPN call for 10s, so the bandwidth cost upstream
// stays flat regardless of how many tabs are watching. Hides itself when
// there are no live matches.
export function LiveWidget() {
  const [data, setData] = useState<LiveApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Previous data ref — used by the diff effect to detect goals + score
  // movement between polls. Held as a ref so we don't re-render on update.
  const prevDataRef = useRef<LiveApiResponse | null>(null);

  // Accumulated goal events per fixture, in chronological order.
  // {fixtureNumber: GoalEvent[]} — drives the timeline strip and confetti.
  const [goalEvents, setGoalEvents] = useState<Record<number, GoalEvent[]>>({});

  // Score-flash state per fixture: which team's score just changed, and a
  // monotonically increasing key so CSS animation re-fires on each goal.
  const [flashes, setFlashes] = useState<Record<number, { team: 1 | 2; key: number }>>({});

  // Active confetti bursts — rendered as absolutely-positioned divs with CSS
  // animations. Cleared after the animation duration.
  const [confettiBursts, setConfettiBursts] = useState<Array<{ id: string; fixtureNumber: number; side: "left" | "right" }>>([]);

  // Sound is opt-in (default off) — flagged in localStorage so the user's
  // pref survives reloads. Goal ping uses Web Audio API, no asset shipped.
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    try { setSoundOn(localStorage.getItem("wc-live-sound") === "1"); } catch { /* ignore */ }
  }, []);
  function toggleSound() {
    setSoundOn((s) => {
      const next = !s;
      try { localStorage.setItem("wc-live-sound", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  // ── Poll loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const res = await fetch("/api/world-cup/live", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as LiveApiResponse;
        if (!cancelled) { setData(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      }
    }

    // Only poll while the tab is actually visible. Background tabs and
    // mobile devices with the app in the background were re-firing every
    // 15s for no benefit — wastes function invocations + battery on mobile.
    function start() { if (!interval) interval = setInterval(poll, 15_000); }
    function stop() { if (interval) { clearInterval(interval); interval = null; } }
    function onVisibility() {
      if (document.hidden) stop();
      else { poll(); start(); }
    }

    poll();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  // ── Diff effect: detect goals, fire flash + confetti + sound ──────────
  useEffect(() => {
    if (!data) return;
    const prev = prevDataRef.current;
    prevDataRef.current = data;
    if (!prev) return; // First poll — nothing to diff against; just baseline.

    for (const m of data.matches) {
      const p = prev.matches.find((x) => x.fixtureNumber === m.fixtureNumber);
      if (!p) continue; // First time we're seeing this fixture — don't fire.

      const t1Scored = m.team1Goals > p.team1Goals;
      const t2Scored = m.team2Goals > p.team2Goals;
      if (!t1Scored && !t2Scored) continue;

      const team = t1Scored ? 1 : 2;
      const scoringTeamName = team === 1 ? m.team1 : m.team2;
      const goalId = `${m.fixtureNumber}-${team}-${m.team1Goals}-${m.team2Goals}-${Date.now()}`;

      setGoalEvents((g) => {
        const list = g[m.fixtureNumber] ?? [];
        return {
          ...g,
          [m.fixtureNumber]: [
            ...list,
            { id: goalId, team, teamName: scoringTeamName, minute: m.minute, scoreAtGoal: `${m.team1Goals}-${m.team2Goals}`, at: Date.now() },
          ],
        };
      });
      setFlashes((f) => ({ ...f, [m.fixtureNumber]: { team, key: Date.now() } }));
      setConfettiBursts((b) => [...b, { id: goalId, fixtureNumber: m.fixtureNumber, side: team === 1 ? "left" : "right" }]);
      if (soundOn) playGoalPing();

      // Auto-clear flash + confetti after their animation duration.
      setTimeout(() => setFlashes((f) => {
        const next = { ...f };
        if (next[m.fixtureNumber]?.key === Date.now()) delete next[m.fixtureNumber];
        return next;
      }), 2500);
      setTimeout(() => setConfettiBursts((b) => b.filter((x) => x.id !== goalId)), 4000);
    }
  }, [data, soundOn]);

  // Compute previous points map per fixture so the player rows can show
  // ↑+3 / ↓−2 movement arrows since the last poll. Recomputed every render
  // but only consumes the names from prevDataRef — cheap.
  const previousPointsByFx = useMemo(() => {
    const prev = prevDataRef.current;
    const map = new Map<number, Map<string, number>>();
    if (!prev) return map;
    for (const m of prev.matches) {
      const inner = new Map<string, number>();
      for (const p of m.players) inner.set(p.name, p.points);
      map.set(m.fixtureNumber, inner);
    }
    return map;
  }, [data]);

  if (!data || data.matches.length === 0) return null;

  return (
    <section className="mt-6 space-y-3">
      <SoundToggle on={soundOn} onClick={toggleSound} />
      {data.matches.map((m) => (
        <MatchCard
          key={m.fixtureNumber}
          match={m}
          viewer={data.viewer}
          flash={flashes[m.fixtureNumber] ?? null}
          previousPoints={previousPointsByFx.get(m.fixtureNumber) ?? null}
          goalEvents={goalEvents[m.fixtureNumber] ?? []}
          confettiBursts={confettiBursts.filter((b) => b.fixtureNumber === m.fixtureNumber)}
        />
      ))}
      {error && (
        <p className="px-2 text-[10px] text-slate-400">Feed hiccup — retrying. {error}</p>
      )}
    </section>
  );
}

// ── Match card ─────────────────────────────────────────────────────────
function MatchCard({
  match: m,
  viewer,
  flash,
  previousPoints,
  goalEvents,
  confettiBursts,
}: {
  match: MatchData;
  viewer: LiveApiResponse["viewer"];
  flash: { team: 1 | 2; key: number } | null;
  previousPoints: Map<string, number> | null;
  goalEvents: GoalEvent[];
  confettiBursts: Array<{ id: string; fixtureNumber: number; side: "left" | "right" }>;
}) {
  const myPlayer = m.players.find((p) => p.isMe) ?? null;
  // "On for the perfect" — exact match of pick to current live score.
  const perfectPlayers = m.players.filter((p) => p.pickT1 === m.team1Goals && p.pickT2 === m.team2Goals);

  return (
    <article className="relative overflow-hidden rounded-2xl border-2 border-red-300 bg-white shadow-md">
      {/* Goal confetti overlay — non-interactive, lives above the score */}
      <ConfettiLayer bursts={confettiBursts} />

      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-gradient-to-r from-red-50 to-rose-50 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]" />
          <span className="font-bold uppercase tracking-wide text-red-700">
            {m.status === "halftime" ? "Half-time" : m.status === "final" ? "Full-time" : "Live"}
          </span>
          {m.minute !== null && m.status === "live" && (
            <span className="font-mono text-red-700">{m.minute}&apos;</span>
          )}
        </div>
        <span className="text-[10px] text-red-700/60">via ESPN · refreshes every 15s</span>
      </div>

      {/* Banter ribbon — rotating one-liner across the top */}
      <BanterRibbon match={m} viewer={viewer} />

      {/* Big score with goal-flash animations */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4">
        <div className={`text-right text-base font-semibold text-slate-900 sm:text-lg ${flash?.team === 1 ? "wc-goal-flash" : ""}`}>{m.team1}</div>
        <div className="flex items-baseline gap-1 font-mono text-3xl font-bold tabular-nums text-slate-900 sm:text-4xl">
          <span className={flash?.team === 1 ? "wc-goal-pop" : ""} key={`t1-${flash?.team === 1 ? flash.key : "stable"}`}>{m.team1Goals}</span>
          <span className="text-slate-300">–</span>
          <span className={flash?.team === 2 ? "wc-goal-pop" : ""} key={`t2-${flash?.team === 2 ? flash.key : "stable"}`}>{m.team2Goals}</span>
        </div>
        <div className={`text-left text-base font-semibold text-slate-900 sm:text-lg ${flash?.team === 2 ? "wc-goal-flash" : ""}`}>{m.team2}</div>
      </div>

      {/* GOAL! burst — overlays the score area briefly when flash fires */}
      {flash && (
        <div key={flash.key} className="pointer-events-none absolute left-1/2 top-[40%] z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="wc-goal-burst inline-block rounded-full bg-gradient-to-r from-amber-400 to-red-500 px-4 py-1 text-base font-extrabold tracking-wider text-white shadow-lg">
            ⚽ GOAL!
          </span>
        </div>
      )}

      {/* "On for the perfect" — highlight if someone's picking exactly the live score */}
      {perfectPlayers.length > 0 && (m.team1Goals + m.team2Goals > 0) && (
        <div className="border-t border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-emerald-700">🎯 On for the perfect:</span>
          <span className="ml-2 font-medium text-emerald-900">
            {perfectPlayers.map((p) => p.name).join(", ")}
          </span>
          <span className="ml-2 text-emerald-700/70">— picked {m.team1Goals}–{m.team2Goals} dead on</span>
        </div>
      )}

      {/* Leaderboard delta — viewer's overall rank now vs if FT now */}
      {viewer && myPlayer && <LeaderboardDelta viewer={viewer} />}

      {/* Goal-by-goal timeline strip */}
      {goalEvents.length > 0 && <GoalTimeline events={goalEvents} />}

      {/* Full player list — everyone with a pick on this match */}
      <PlayerList players={m.players} previousPoints={previousPoints} liveScore={`${m.team1Goals}-${m.team2Goals}`} status={m.status} />
    </article>
  );
}

// ── Banter ribbon ───────────────────────────────────────────────────────
function BanterRibbon({ match, viewer }: { match: MatchData; viewer: LiveApiResponse["viewer"] }) {
  const phrases = useMemo(() => buildBanter(match, viewer), [match, viewer]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (phrases.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % phrases.length), 6000);
    return () => clearInterval(t);
  }, [phrases.length]);
  if (phrases.length === 0) return null;
  return (
    <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 px-4 py-2 text-center text-xs italic text-amber-900">
      <span key={idx} className="wc-banter-fade inline-block">{phrases[idx]}</span>
    </div>
  );
}

function buildBanter(m: MatchData, viewer: LiveApiResponse["viewer"]): string[] {
  const phrases: string[] = [];
  const goals = m.team1Goals + m.team2Goals;
  const leader = m.players[0] ?? null;
  const perfect = m.players.filter((p) => p.pickT1 === m.team1Goals && p.pickT2 === m.team2Goals);
  const zeros = m.players.filter((p) => p.points === 0);
  const eights = m.players.filter((p) => p.points >= 8 && !perfect.includes(p));
  const me = m.players.find((p) => p.isMe);

  if (perfect.length === 1) phrases.push(`${perfect[0].name} called ${m.team1Goals}–${m.team2Goals} dead on — full 10 if it ends here 🎯`);
  if (perfect.length > 1) phrases.push(`${perfect.length} players nailed ${m.team1Goals}–${m.team2Goals} — bloodbath for the rest 🩸`);
  if (leader && leader.points >= 8) phrases.push(`${leader.name} sitting pretty on ${leader.points} pts — anyone going to catch them?`);
  if (eights.length >= 3) phrases.push(`${eights.length} players in the 8+ zone — this match is *carrying* the leaderboard`);
  if (zeros.length >= 3 && goals > 0) phrases.push(`${zeros.length} players still on zero — rough one for ${pickName(zeros)} and co`);
  if (goals === 0 && m.status === "live" && (m.minute ?? 0) > 30) phrases.push(`Still 0–0 after ${m.minute}' — the goalless draw merchants are loving this`);
  if (me && me.points >= 8) phrases.push(`You're on ${me.points} pts here 🔥 keep this score and bank the lot`);
  if (me && me.points === 0 && goals > 0) phrases.push(`You picked ${me.pickT1}–${me.pickT2}, currently ${m.team1Goals}–${m.team2Goals} — this isn't going your way`);
  if (viewer && me && viewer.projectedRank < viewer.currentRank) {
    phrases.push(`You're climbing — projected to jump ${viewer.currentRank} → ${viewer.projectedRank} on the leaderboard`);
  }
  if (viewer && me && viewer.projectedRank > viewer.currentRank) {
    phrases.push(`Watch out — you'd drop ${viewer.currentRank} → ${viewer.projectedRank} if this finishes like this`);
  }
  if (m.status === "halftime") phrases.push(`Half-time. Currently ${m.team1Goals}–${m.team2Goals}. 45 minutes to make or break.`);
  if (m.status === "final" && perfect.length === 0) phrases.push(`Full-time. No-one nailed it — best of the bunch: ${leader?.name ?? "nobody"} on ${leader?.points ?? 0}`);

  // Always seed something so the ribbon never goes blank.
  if (phrases.length === 0) phrases.push(`${m.team1} vs ${m.team2} — ${m.players.length} players in on this one`);
  return phrases;
}

function pickName(arr: { name: string }[]): string {
  return arr[0]?.name ?? "everyone";
}

// ── Leaderboard delta ───────────────────────────────────────────────────
function LeaderboardDelta({ viewer }: { viewer: NonNullable<LiveApiResponse["viewer"]> }) {
  const climbing = viewer.projectedRank < viewer.currentRank;
  const falling = viewer.projectedRank > viewer.currentRank;
  const flat = viewer.projectedRank === viewer.currentRank;
  const tone = climbing ? "bg-emerald-50 text-emerald-900 border-emerald-200" : falling ? "bg-rose-50 text-rose-900 border-rose-200" : "bg-slate-50 text-slate-700 border-slate-200";
  const arrow = climbing ? "↑" : falling ? "↓" : "→";
  const pointsDelta = viewer.projectedTotalPoints - viewer.currentTotalPoints;
  return (
    <div className={`border-t px-4 py-2.5 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">If FT now</span>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-mono text-base font-bold tabular-nums">
              {viewer.currentRank} {arrow} {viewer.projectedRank}
            </span>
            <span className="text-[11px] opacity-80">of {viewer.totalPlayers}</span>
            {flat && <span className="text-[11px] italic opacity-70">— no change</span>}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Total pts</span>
          <div className="mt-0.5 font-mono text-base font-bold tabular-nums">
            {viewer.currentTotalPoints}
            {pointsDelta !== 0 && (
              <span className="ml-1.5 text-[12px] font-bold">
                ({pointsDelta > 0 ? "+" : ""}{pointsDelta})
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Goal timeline strip ─────────────────────────────────────────────────
function GoalTimeline({ events }: { events: GoalEvent[] }) {
  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Goals so far</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {events.map((e) => (
          <span key={e.id} className="wc-goal-chip inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
            <span aria-hidden>⚽</span>
            <span>{e.teamName}</span>
            {e.minute !== null && <span className="text-slate-400">· {e.minute}&apos;</span>}
            <span className="font-mono text-slate-400">{e.scoreAtGoal}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Player list ─────────────────────────────────────────────────────────
function PlayerList({
  players, previousPoints, liveScore, status,
}: {
  players: LivePlayerEntry[];
  previousPoints: Map<string, number> | null;
  liveScore: string;
  status: MatchData["status"];
}) {
  if (players.length === 0) {
    return (
      <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-2 text-center text-[11px] text-slate-500">
        No-one predicted this match
      </div>
    );
  }
  return (
    <div className="border-t border-red-100 bg-red-50/30 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
          {status === "final" ? "Where they finished" : "Standings live"}
        </div>
        <div className="text-[10px] text-red-700/60">{players.length} player{players.length === 1 ? "" : "s"}</div>
      </div>
      <ol className="mt-2 space-y-1 max-h-72 overflow-y-auto">
        {players.map((p, i) => {
          const prev = previousPoints?.get(p.name) ?? null;
          const delta = prev === null ? null : p.points - prev;
          const isPerfect = `${p.pickT1}-${p.pickT2}` === liveScore && (p.points >= 5);
          return (
            <li
              key={`${p.name}-${i}`}
              className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm ${p.isMe ? "bg-amber-100 ring-1 ring-amber-300" : "bg-white"}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                  {i === 0 ? "👑" : i + 1}
                </span>
                <span className={`truncate font-medium ${p.isMe ? "text-amber-900" : "text-slate-900"}`}>
                  {p.name}
                  {p.isMe && <span className="ml-1 text-[10px] font-bold uppercase tracking-wide">you</span>}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-slate-500">{p.pickT1}–{p.pickT2}</span>
                {isPerfect && <span className="shrink-0 rounded bg-emerald-200 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900">🎯 Perfect</span>}
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {delta !== null && delta !== 0 && (
                  <span className={`text-[10px] font-bold tabular-nums ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {delta > 0 ? `↑+${delta}` : `↓${delta}`}
                  </span>
                )}
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${pointsTone(p.points)}`}>
                  {p.points}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Confetti layer ──────────────────────────────────────────────────────
// Hand-rolled CSS confetti so we don't need to ship a dep. Each burst spawns
// 24 absolutely-positioned spans with randomised colour / drift / rotation
// and a 3.5s fall + fade keyframe. They auto-clear from state after 4s.
function ConfettiLayer({ bursts }: { bursts: Array<{ id: string; side: "left" | "right" }> }) {
  if (bursts.length === 0) return null;
  const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#f97316"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {bursts.map((b) =>
        Array.from({ length: 24 }, (_, i) => {
          const driftX = (Math.random() - 0.5) * 200; // horizontal drift in px
          const rotate = Math.random() * 720 - 360;
          const delay = Math.random() * 0.2;
          const color = colors[i % colors.length];
          const leftPct = b.side === "left" ? 5 + Math.random() * 30 : 65 + Math.random() * 30;
          return (
            <span
              key={`${b.id}-${i}`}
              className="wc-confetti-piece absolute top-[20%] block h-2 w-2 rounded-sm"
              style={{
                left: `${leftPct}%`,
                backgroundColor: color,
                ["--drift-x" as string]: `${driftX}px`,
                ["--rotate" as string]: `${rotate}deg`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        }),
      )}
    </div>
  );
}

// ── Sound toggle ────────────────────────────────────────────────────────
function SoundToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
      aria-pressed={on}
    >
      <span aria-hidden>{on ? "🔔" : "🔕"}</span>
      <span>{on ? "Goal sound on" : "Goal sound off"}</span>
    </button>
  );
}

// Web Audio API "ding" — a rising two-tone blip. No asset needed; runs in
// browsers natively. Falls through silently if AudioContext isn't available.
function playGoalPing() {
  try {
    type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowWithLegacyAudio;
    const AudioCtx = window.AudioContext ?? w.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1320, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* ignore */ }
}

function pointsTone(p: number): string {
  if (p >= 8) return "bg-emerald-200 text-emerald-900";
  if (p >= 3) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-500";
}
