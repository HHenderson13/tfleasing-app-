"use client";

import { useEffect, useState } from "react";
import type { LiveApiResponse } from "@/app/api/world-cup/live/route";

// Polls /api/world-cup/live every 15 seconds while the page is open. The
// route caches the upstream ESPN call for 10s, so the bandwidth cost upstream
// stays flat regardless of how many tabs are watching. Hides itself when
// there are no live matches — the landing page reads as quiet outside the
// tournament window.
export function LiveWidget() {
  const [data, setData] = useState<LiveApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/world-cup/live", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as LiveApiResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      }
    }
    poll();
    const interval = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!data || data.matches.length === 0) return null;

  return (
    <section className="mt-6 space-y-3">
      {data.matches.map((m) => (
        <article key={m.fixtureNumber} className="overflow-hidden rounded-2xl border-2 border-red-300 bg-white shadow-md">
          <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-gradient-to-r from-red-50 to-rose-50 px-4 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]" />
              <span className="font-bold uppercase tracking-wide text-red-700">
                {m.status === "halftime" ? "Half-time" : m.status === "final" ? "Full-time" : "Live"}
              </span>
              {m.minute !== null && m.status === "live" && (
                <span className="font-mono text-red-700">{m.minute}'</span>
              )}
            </div>
            <span className="text-[10px] text-red-700/60">via ESPN · refreshes every 15s</span>
          </div>

          {/* Big score */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4">
            <div className="text-right text-base font-semibold text-slate-900 sm:text-lg">{m.team1}</div>
            <div className="flex items-baseline gap-1 font-mono text-3xl font-bold tabular-nums text-slate-900 sm:text-4xl">
              <span>{m.team1Goals}</span><span className="text-slate-300">–</span><span>{m.team2Goals}</span>
            </div>
            <div className="text-left text-base font-semibold text-slate-900 sm:text-lg">{m.team2}</div>
          </div>

          {/* Your projection — bigger and prominent, your pick & projected points */}
          {m.me ? (
            <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Your projection</div>
                <span className={`rounded-md px-2.5 py-1 text-sm font-bold tabular-nums ${pointsTone(m.me.points)}`}>
                  {m.me.points} {m.me.points === 1 ? "pt" : "pts"}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 text-xs text-amber-900">
                <span>You picked</span>
                <span className="font-mono text-base font-bold tabular-nums text-amber-950">{m.me.pickT1}–{m.me.pickT2}</span>
                <span className="text-amber-700/70">{m.status === "final" ? "— locked in" : "— if it ended now"}</span>
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-2 text-center text-[11px] text-slate-500">
              You didn't predict this match
            </div>
          )}

          {/* Leading on this match */}
          {m.projected.length > 0 && (
            <div className="border-t border-red-100 bg-red-50/40 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
                {m.status === "final" ? "Top of the match" : "Leading on this match if it ended now"}
              </div>
              <ol className="mt-2 space-y-1.5 text-sm">
                {m.projected.slice(0, 3).map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{i + 1}</span>
                      <span className="truncate font-medium text-slate-900">{p.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500">{p.pickT1}–{p.pickT2}</span>
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${pointsTone(p.points)}`}>
                      {p.points}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </article>
      ))}
      {error && (
        <p className="px-2 text-[10px] text-slate-400">
          Feed hiccup — retrying. {error}
        </p>
      )}
    </section>
  );
}

function pointsTone(p: number): string {
  if (p >= 8) return "bg-emerald-200 text-emerald-900";
  if (p >= 3) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-500";
}
