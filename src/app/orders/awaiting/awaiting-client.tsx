"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { StatTile } from "@/components/stat-tile";
import { TrackerCard, type TrackerCardData } from "./tracker-card";
import { DeliveryCalendar, type CalendarEntry } from "./delivery-calendar";
import type { Match } from "./types";

// The whole awaiting page in one client component — tab + exec filter live
// here so neither one triggers a server round-trip. Server hands down the
// fully-flattened list of TrackerCardData once; everything from filtering
// to bucketing to view-swap happens in memory.
//
// Before this refactor:
//   - Tab change → URL update → server re-render of the whole page
//   - Exec filter → URL update → server re-render
//   - First load → listProposals across ALL order statuses + full stock
// All three felt slow because they all paid the same server cost.
// Now: server runs once when the page is first loaded, and the user pays
// nothing extra to switch tabs or flip the exec filter.

export type AwaitingView = "tracker" | "calendar";

export interface AwaitingItemPayload {
  card: TrackerCardData;          // Pre-flattened tracker card data
  match: Match;                   // Stock-match snapshot (for buckets + calendar entry)
  salesExecId: string | null;     // For client-side filter
  isGroupBq: boolean;
  deliveryBookedAtIso: string | null;
  calendarEntry: CalendarEntry | null;   // Pre-built for calendar view
}

interface Props {
  items: AwaitingItemPayload[];
  execs: { id: string; name: string }[];
  defaultExecId: string | null;   // Server-computed default (own deals for execs, all for admins)
  myExecId: string | null;
  adminAddDealHref: string | null;   // Non-null shows the "+ Add deal" button
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function AwaitingClient({ items, execs, defaultExecId, myExecId, adminAddDealHref }: Props) {
  const [view, setView] = useState<AwaitingView>("tracker");
  const [execFilter, setExecFilter] = useState<string | null>(defaultExecId);

  // Filter items by exec — entirely in memory. Reused for buckets, stats,
  // and the calendar so each derived structure stays in sync.
  const filtered = useMemo(() => {
    if (execFilter === null) return items;
    return items.filter((it) => it.salesExecId === execFilter);
  }, [items, execFilter]);

  // Bucket + sort for the tracker view. Same logic as the old server-side
  // code lived in `awaiting/page.tsx` — keep behaviour identical so the
  // existing user mental model holds.
  const trackerBuckets = useMemo(() => bucketByEta(filtered), [filtered]);

  // Calendar entries: any item with a confirmed customer delivery date.
  const calendarEntries = useMemo(
    () => filtered.flatMap((it) => (it.calendarEntry ? [it.calendarEntry] : [])),
    [filtered],
  );
  const calendarMissing = filtered.length - calendarEntries.length;

  // Stats card — recompute on every filter change but they're cheap counts.
  const stats = useMemo(() => {
    const total = filtered.length;
    let etaConfirmed = 0, etaTba = 0, arrived = 0, deliveryBooked = 0;
    let monthlySum = 0;
    for (const it of filtered) {
      monthlySum += it.card.monthlyRental;
      if (it.match.delivered) arrived++;
      else if (it.match.etaAt) etaConfirmed++;
      else etaTba++;
      if (!it.match.delivered && it.deliveryBookedAtIso) deliveryBooked++;
    }
    return { total, etaConfirmed, etaTba, arrived, deliveryBooked, monthlySum };
  }, [filtered]);

  return (
    <>
      {/* Top action bar — add-deal + exec filter */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {adminAddDealHref && (
          <Link href={adminAddDealHref} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
            + Add deal
          </Link>
        )}
        <ExecFilterClient execs={execs} value={execFilter} onChange={setExecFilter} myExecId={myExecId} />
      </div>

      {/* Stat tiles */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Awaiting" value={stats.total} tone="slate" />
        <StatTile label="ETA confirmed" value={stats.etaConfirmed} tone="sky" />
        <StatTile label="ETA TBA" value={stats.etaTba} tone="amber" />
        <StatTile label="Arrived at us" value={stats.arrived} tone="emerald" />
        <StatTile label="Delivery booked" value={stats.deliveryBooked} tone="teal" />
      </section>
      <div className="mt-2 text-right text-[11px] text-slate-400">
        Total monthly rental in pipeline: £{stats.monthlySum.toFixed(2)}
      </div>

      {/* Tab nav — purely client state */}
      <div className="mt-6">
        <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
          <TabButton active={view === "tracker"} onClick={() => setView("tracker")}>📋 Delivery tracker</TabButton>
          <TabButton active={view === "calendar"} onClick={() => setView("calendar")}>📅 Calendar</TabButton>
        </nav>
      </div>

      {view === "tracker" ? (
        filtered.length === 0 ? (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No deals waiting on delivery — {execFilter ? "try clearing the exec filter." : "you're all caught up."}
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {trackerBuckets.sortedKeys.map((key) => (
              <section key={key}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {bucketLabel(key)}
                  <span className="ml-2 text-slate-400">({trackerBuckets.groups.get(key)!.length})</span>
                </h2>
                <div className="space-y-2">
                  {trackerBuckets.groups.get(key)!.map((it) => (
                    <TrackerCard key={it.card.id} data={it.card} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="mt-4 space-y-3">
          <DeliveryCalendar entries={calendarEntries} />
          {calendarMissing > 0 && (
            <p className="text-[11px] italic text-slate-500">
              {calendarMissing} deal{calendarMissing === 1 ? "" : "s"} on the tracker without a confirmed delivery date — set one on the Tracker tab to surface them here.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ─── Exec filter (client) ──────────────────────────────────────────────────
// Replaces the URL-based ExecFilter component for this page. State lives in
// the parent so changing exec doesn't even round-trip through the URL.
function ExecFilterClient({
  execs, value, onChange, myExecId,
}: {
  execs: { id: string; name: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  myExecId: string | null;
}) {
  return (
    <select
      value={value === null ? "all" : value}
      onChange={(e) => onChange(e.target.value === "all" ? null : e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      <option value="all">All execs ({execs.length})</option>
      {myExecId && <option value={myExecId}>— My deals —</option>}
      {execs.map((e) => (
        <option key={e.id} value={e.id}>{e.name}</option>
      ))}
    </select>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Bucketing helpers ─────────────────────────────────────────────────────
// Same buckets the server-rendered version used so the page reads exactly
// the same after the refactor. Pure functions over the in-memory items so
// React can re-compute them on filter changes in <1ms.

function bucketKey(item: AwaitingItemPayload): string {
  if (item.isGroupBq) return "bq";
  if (item.match.delivered) return "delivered";
  if (!item.match.etaAt) return "tba";
  // Both Match.etaAt and the client-side reconstruction agree on the ISO
  // form so we can use it directly here without re-parsing.
  const d = new Date(item.match.etaAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(key: string): string {
  if (key === "delivered") return "Delivered (at TF, awaiting customer)";
  if (key === "tba") return "ETA to be confirmed";
  if (key === "bq") return "Group BQ";
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function bucketSortValue(key: string): number {
  if (key === "delivered") return -Infinity;
  if (key === "bq") return Number.MAX_SAFE_INTEGER - 1;
  if (key === "tba") return Number.MAX_SAFE_INTEGER;
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  return y * 12 + m;
}

function bucketByEta(items: AwaitingItemPayload[]): {
  groups: Map<string, AwaitingItemPayload[]>;
  sortedKeys: string[];
} {
  const groups = new Map<string, AwaitingItemPayload[]>();
  for (const it of items) {
    const k = bucketKey(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  // Within each month bucket sort by ETA asc so earliest dates float to top.
  for (const [k, arr] of groups) {
    if (k === "tba" || k === "bq") continue;
    if (k === "delivered") {
      // Adopted (worst) → IB → plain delivered. Pure presentation order so
      // the most-at-risk vehicles surface first inside the delivered group.
      arr.sort((a, b) => ibStage(b.match) - ibStage(a.match));
      continue;
    }
    arr.sort((a, b) => {
      const ax = a.match.etaAt ? new Date(a.match.etaAt).getTime() : 0;
      const bx = b.match.etaAt ? new Date(b.match.etaAt).getTime() : 0;
      return ax - bx;
    });
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => bucketSortValue(a) - bucketSortValue(b));
  return { groups, sortedKeys };
}

function ibStage(m: Match): number {
  const now = Date.now();
  if (m.registeredReview) return 3;
  if (m.adoptedAt && new Date(m.adoptedAt).getTime() <= now) return 2;
  if (m.interestBearingAt && new Date(m.interestBearingAt).getTime() <= now) return 1;
  return 0;
}
