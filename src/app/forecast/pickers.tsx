"use client";
// Reusable pickers that bind to the URL ?month= / ?quarter= / ?year=
// search params. Both use plain <select> elements styled as buttons so
// the user gets a real dropdown of named options ("June 2026") rather
// than a date input. Quick "current" jump button alongside.

import { useTransition } from "react";
import { useRouter } from "next/navigation";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return yyyymm;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentQuarter(): { quarter: number; year: number } {
  const d = new Date();
  return { quarter: Math.floor(d.getMonth() / 3) + 1, year: d.getFullYear() };
}

// Build 24 months — 12 back, this one, 12 forward — for the dropdown.
function recentMonths(active: string): string[] {
  const [y, m] = active.split("-").map((s) => parseInt(s, 10));
  const set = new Set<string>();
  for (let offset = -12; offset <= 12; offset++) {
    const d = new Date(y, m - 1 + offset, 1);
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  set.add(currentMonth());
  return Array.from(set).sort();
}

export function MonthPicker({ value, label = "Month" }: { value: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const months = recentMonths(value);

  function selectMonth(m: string) {
    start(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("month", m);
      router.push(url.pathname + "?" + url.searchParams.toString());
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => selectMonth(e.target.value)}
        disabled={pending}
        className="rounded border-0 bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 focus:outline-none disabled:opacity-50"
      >
        {months.map((m) => (
          <option key={m} value={m}>{monthLabel(m)}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => selectMonth(currentMonth())}
        disabled={pending}
        className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
      >
        Today
      </button>
    </div>
  );
}

export function QuarterPicker({
  quarter, year,
}: {
  quarter: number; year: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function selectQuarter(q: number, y: number) {
    start(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("quarter", String(q));
      url.searchParams.set("year", String(y));
      router.push(url.pathname + "?" + url.searchParams.toString());
    });
  }

  const years = [year - 1, year, year + 1];

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Quarter</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => selectQuarter(q, year)}
            disabled={pending}
            className={`px-2.5 py-1 text-xs font-semibold ${
              q === quarter ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            } disabled:opacity-50`}
          >
            Q{q}
          </button>
        ))}
      </div>
      <select
        value={year}
        onChange={(e) => selectQuarter(quarter, parseInt(e.target.value, 10))}
        disabled={pending}
        className="rounded border-0 bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 focus:outline-none disabled:opacity-50"
      >
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <button
        type="button"
        onClick={() => {
          const cq = currentQuarter();
          selectQuarter(cq.quarter, cq.year);
        }}
        disabled={pending}
        className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
      >
        This Q
      </button>
    </div>
  );
}
