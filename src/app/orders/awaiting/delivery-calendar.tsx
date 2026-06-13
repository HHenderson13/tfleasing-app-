"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

export interface CalendarEntry {
  proposalId: string;
  customerName: string;
  customerId: string;
  model: string;
  funderName: string;
  execName: string | null;
  isEv: boolean;
  isGroupBq: boolean;
  deliveryBookedAt: string;     // ISO yyyy-mm-dd
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function DeliveryCalendar({ entries }: { entries: CalendarEntry[] }) {
  // Anchor at today's month by default. Navigation moves whole months.
  const now = new Date();
  const [anchor, setAnchor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  // Group entries by ISO date so each day cell can look up its bookings
  // in O(1) without re-filtering the full list.
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const list = map.get(e.deliveryBookedAt) ?? [];
      list.push(e);
      map.set(e.deliveryBookedAt, list);
    }
    return map;
  }, [entries]);

  // Build the 6-row grid: pad leading days from previous month and trailing
  // from next month so the calendar is always rectangular.
  const days = useMemo(() => buildMonthGrid(anchor.year, anchor.month), [anchor]);
  const monthLabel = `${MONTH_NAMES[anchor.month]} ${anchor.year}`;
  const todayKey = isoDate(now);

  // Selected day for the bottom detail panel. Defaults to the first day in
  // the current month that has bookings, so users see something useful
  // immediately on landing.
  const firstBookingThisMonth = days.find(
    (d) => d.thisMonth && (entriesByDate.get(d.iso)?.length ?? 0) > 0,
  )?.iso ?? null;
  const [selectedIso, setSelectedIso] = useState<string | null>(firstBookingThisMonth);
  const selectedEntries = selectedIso ? (entriesByDate.get(selectedIso) ?? []) : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header — month label + navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor((a) => stepMonth(a, -1))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setAnchor({ year: now.getFullYear(), month: now.getMonth() })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => stepMonth(a, 1))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Next →
          </button>
        </div>
        <div className="text-base font-semibold text-slate-900">{monthLabel}</div>
        <div className="text-[11px] text-slate-500">
          {entries.length} booking{entries.length === 1 ? "" : "s"} on tracker
        </div>
      </div>

      {/* Weekday header — Mon–Sun (UK convention) */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="px-1 py-1.5">{w}</div>
        ))}
      </div>

      {/* Day grid — 6 weeks × 7 days */}
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const bookings = entriesByDate.get(d.iso) ?? [];
          const isToday = d.iso === todayKey;
          const isSelected = selectedIso === d.iso;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSelectedIso(d.iso)}
              className={`relative min-h-[68px] border-b border-r border-slate-100 px-1.5 py-1 text-left transition sm:min-h-[88px] ${
                d.thisMonth ? "bg-white" : "bg-slate-50/60 text-slate-400"
              } ${isSelected ? "ring-2 ring-inset ring-emerald-500" : "hover:bg-emerald-50/30"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-[11px] font-semibold ${isToday ? "rounded-full bg-emerald-600 px-1.5 py-0.5 text-white" : "text-slate-700"}`}>
                  {d.day}
                </span>
                {bookings.length > 0 && (
                  <span className="rounded-full bg-teal-100 px-1 text-[9px] font-bold text-teal-800">{bookings.length}</span>
                )}
              </div>
              {/* Up to 2 names inline for desktop; mobile collapses to the count badge */}
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {bookings.slice(0, 2).map((e) => (
                  <div key={e.proposalId} className="truncate text-[10px] text-slate-700" title={e.customerName}>
                    {e.isEv && <span className="mr-0.5 text-emerald-700">⚡</span>}{e.customerName}
                  </div>
                ))}
                {bookings.length > 2 && (
                  <div className="text-[9px] italic text-slate-500">+{bookings.length - 2} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom detail panel — list of customers booked on the selected day */}
      <DetailPanel iso={selectedIso} entries={selectedEntries} />
    </div>
  );
}

function DetailPanel({ iso, entries }: { iso: string | null; entries: CalendarEntry[] }) {
  if (!iso) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/40 px-4 py-3 text-xs text-slate-500">
        Tap a day to see the deliveries booked.
      </div>
    );
  }
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  const date = new Date(y, m - 1, d);
  const label = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="border-t border-slate-200 bg-slate-50/40 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500">{entries.length} booking{entries.length === 1 ? "" : "s"}</div>
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs italic text-slate-500">No deliveries booked for this day.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {entries.map((e) => (
            <li key={e.proposalId}>
              <Link
                href={`/orders/${e.proposalId}`}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-semibold text-slate-900">{e.customerName}</span>
                    {e.isGroupBq && <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold uppercase text-violet-800">BQ</span>}
                    {e.isEv && <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold uppercase text-emerald-800">⚡ EV</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-600">
                    {e.model} · {e.funderName}
                    {e.execName && <> · {e.execName}</>}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">View →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface GridDay { day: number; iso: string; thisMonth: boolean; }

function buildMonthGrid(year: number, month: number): GridDay[] {
  // Pad to a Monday-start week (UK convention). 6 rows × 7 columns = 42 cells
  // — covers every month layout including the longest 31-day month starting
  // on a Sunday.
  const first = new Date(year, month, 1);
  // getDay() returns 0=Sun, 1=Mon, ... 6=Sat. We want days before Monday
  // (0-indexed Monday-first) to be padding.
  const dow = (first.getDay() + 6) % 7; // 0 = Monday
  const startCell = new Date(year, month, 1 - dow);
  const days: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startCell);
    d.setDate(startCell.getDate() + i);
    days.push({
      day: d.getDate(),
      iso: isoDate(d),
      thisMonth: d.getMonth() === month,
    });
  }
  return days;
}

function stepMonth(a: { year: number; month: number }, by: number) {
  const m = a.month + by;
  return {
    year: a.year + Math.floor(m / 12),
    month: ((m % 12) + 12) % 12,
  };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
