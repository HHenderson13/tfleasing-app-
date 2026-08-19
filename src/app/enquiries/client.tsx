"use client";

import { useMemo, useState } from "react";
import type { EnquiryRow, Summary } from "@/lib/enquiries";
import {
  ALLOCATION_TARGET_MINS,
  CONTACT_TARGET_MINS,
  formatMins,
  formatWall,
} from "@/lib/business-hours";
import {
  isContactMissing,
  isSameDayReportable,
  isTransferMissing,
  partitionByReportability,
} from "@/lib/enquiry-reporting";
import {
  buildPeriod,
  canStep,
  clampAnchor,
  inPeriod,
  shiftAnchor,
  type Granularity,
} from "@/lib/period";

type Tab = "department" | "exec" | "daily";

// A drill-down is just a filtered slice of the rows the page already
// holds, so opening one is instant — no round trip. Every clickable
// number on the page produces one of these.
interface Drill {
  title: string;
  subtitle?: string;
  rows: EnquiryRow[];
  focus: "alloc" | "contact" | "sameday";
}

type DashboardSummary = Summary;

// Every row reaching here has already had a full working day to be
// actioned (see partitionByReportability), so a blank transfer or contact
// is a genuine miss rather than data still in flight.
function summarise(rows: EnquiryRow[]): DashboardSummary {
  const alloc = rows.map((r) => r.allocMins).filter((n): n is number => n != null);
  const contact = rows.map((r) => r.contactMins).filter((n): n is number => n != null);
  const sde = rows.filter((r) => isSameDayReportable(r));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    total: rows.length,
    allocMeasured: alloc.length,
    allocHit: alloc.filter((n) => n <= ALLOCATION_TARGET_MINS).length,
    allocMissed: alloc.filter((n) => n > ALLOCATION_TARGET_MINS).length,
    allocAvg: avg(alloc),
    allocMedian: null,
    contactMeasured: contact.length,
    contactHit: contact.filter((n) => n <= CONTACT_TARGET_MINS).length,
    contactMissed: contact.filter((n) => n > CONTACT_TARGET_MINS).length,
    contactAvg: avg(contact),
    contactMedian: null,
    neverContacted: rows.filter((r) => isContactMissing(r)).length,
    awaitingTransfer: rows.filter((r) => isTransferMissing(r)).length,
    sameDayExpected: sde.length,
    sameDayMet: sde.filter((r) => r.sameDayMet).length,
    sameDayMissed: sde.filter((r) => !r.sameDayMet).length,
  };
}

const pct = (hit: number, of: number) => (of === 0 ? null : Math.round((hit / of) * 100));

/** Average time against target: green when at or under, red when over. */
const timeTone = (avg: number | null, target: number) =>
  avg == null ? "text-slate-400" : avg <= target ? "text-emerald-600" : "text-red-600";

/** Same-day contact: neutral with no completed data, green only at a clean sweep. */
const missTone = (missed: number, expected: number) =>
  expected === 0 ? "text-slate-400" : missed === 0 ? "text-emerald-600" : "text-red-600";
const missBadge = (missed: number, expected: number) =>
  expected === 0
    ? "bg-slate-100 text-slate-500"
    : missed === 0
      ? "bg-emerald-100 text-emerald-900"
      : "bg-red-100 text-red-900";

export function EnquiriesClient({
  rows, min, max, reportHorizon, today,
}: {
  rows: EnquiryRow[];
  min: string | null; max: string | null;
  /** Today in Europe/London, resolved server-side to avoid a hydration mismatch. */
  today: string;
  /**
   * Exclusive data horizon (midnight of the latest upload day). Anything
   * that has not had a full working day to be actioned by this point is
   * held back rather than counted as a miss. Null when nothing has been
   * uploaded yet, in which case everything is reportable.
   */
  reportHorizon: number | null;
}) {
  const [tab, setTab] = useState<Tab>("department");
  const [drill, setDrill] = useState<Drill | null>(null);
  // Default to the current month, as that is the view people open the page
  // wanting. Clamped into the data we hold so an empty month never greets
  // someone who has not uploaded this month yet.
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [anchor, setAnchor] = useState<string>(() => clampAnchor(today, min, max) ?? today);

  const period = useMemo(() => buildPeriod(granularity, anchor), [granularity, anchor]);
  const periodRows = useMemo(() => inPeriod(rows, period), [rows, period]);

  // Hold back anything that has not yet had a full working day. Doing the
  // split once here means every tab, total and drill-down below is working
  // from the same settled set.
  const { reportable, held } = useMemo(
    () => partitionByReportability(periodRows, reportHorizon),
    [periodRows, reportHorizon],
  );

  const dept = useMemo(() => summarise(reportable), [reportable]);
  const byExec = useMemo(() => {
    const m = new Map<string, EnquiryRow[]>();
    for (const r of reportable) {
      const l = m.get(r.salesExec) ?? [];
      l.push(r);
      m.set(r.salesExec, l);
    }
    return [...m.entries()]
      .map(([exec, rs]) => ({ exec, rows: rs, s: summarise(rs) }))
      // Worst first: most same-day misses, then slowest average response.
      .sort((a, b) =>
        b.s.sameDayMissed - a.s.sameDayMissed ||
        (b.s.contactAvg ?? -1) - (a.s.contactAvg ?? -1));
  }, [reportable]);
  const byDay = useMemo(() => {
    const m = new Map<string, EnquiryRow[]>();
    for (const r of reportable) {
      const l = m.get(r.enquiryDay) ?? [];
      l.push(r);
      m.set(r.enquiryDay, l);
    }
    return [...m.entries()]
      .map(([day, rs]) => ({ day, rows: rs, s: summarise(rs) }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [reportable]);

  return (
    <div className="mt-6">
      {/* Period bar: granularity on the left, the period itself in the
          middle with arrows either side, view tabs on the right. One row
          on desktop, wrapping cleanly on a phone. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          {([["day", "Day"], ["week", "Week"], ["month", "Month"]] as const).map(([g, label]) => (
            <button
              key={g}
              onClick={() => {
                setGranularity(g);
                // Keep the anchor, so switching Month → Week lands on the
                // week you were already looking at rather than jumping.
                setAnchor((a) => clampAnchor(a, min, max) ?? a);
              }}
              className={`rounded-lg px-3 py-1.5 transition ${
                granularity === g ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <StepButton
            dir="prev"
            disabled={!canStep(granularity, anchor, -1, min, max)}
            onClick={() => setAnchor(shiftAnchor(granularity, anchor, -1))}
          />
          <div className="min-w-[168px] px-2 text-center">
            <div className="text-sm font-semibold text-slate-900">{period.label}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              {periodRows.length} {periodRows.length === 1 ? "enquiry" : "enquiries"}
            </div>
          </div>
          <StepButton
            dir="next"
            disabled={!canStep(granularity, anchor, 1, min, max)}
            onClick={() => setAnchor(shiftAnchor(granularity, anchor, 1))}
          />
          {anchor !== (clampAnchor(today, min, max) ?? today) && (
            <button
              onClick={() => setAnchor(clampAnchor(today, min, max) ?? today)}
              className="ml-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {granularity === "day" ? "Today" : granularity === "week" ? "This week" : "This month"}
            </button>
          )}
        </div>

        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          {([["department", "Department"], ["exec", "By exec"], ["daily", "Daily log"]] as const).map(([k, label]) => (
            <button
              key={k} onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 transition ${
                tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {held.length > 0 && (
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-2.5">
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-900">
              {held.length} {held.length === 1 ? "enquiry is" : "enquiries are"} not shown yet
            </span>
            {" — "}raised too recently to have had a full working day to be actioned. They
            appear once that day has closed, so every figure below is settled.
          </p>
          <button
            onClick={() => setDrill({
              title: "Not yet reportable",
              subtitle: "Still inside their first working day",
              rows: held,
              focus: "contact",
            })}
            className="shrink-0 text-xs font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
          >
            See them
          </button>
        </div>
      )}

      {tab === "department" && (
        <DepartmentView
          s={dept}
          rows={reportable}
          onDrill={setDrill}
        />
      )}
      {tab === "exec" && (
        <ExecView data={byExec} onDrill={setDrill} />
      )}
      {tab === "daily" && (
        <DailyView data={byDay} onDrill={setDrill} />
      )}

      {drill && (
        <DrillPanel
          drill={drill}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function StepButton({
  dir, disabled, onClick,
}: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous period" : "Next period"}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-white"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === "prev" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}

// ── Department ────────────────────────────────────────────────────────
function DepartmentView({
  s, rows, onDrill,
}: {
  s: DashboardSummary;
  rows: EnquiryRow[];
  onDrill: (d: Drill) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Sales support — allocation */}
        <AvgCard
          title="Sales support — allocation"
          hint="Enquiry raised → passed to an exec"
          target={ALLOCATION_TARGET_MINS}
          avg={s.allocAvg}
          measured={s.allocMeasured}
          hit={s.allocHit} missed={s.allocMissed}
          onAll={() => onDrill({
            title: "Allocation — all enquiries",
            subtitle: `On target and over, against the ${ALLOCATION_TARGET_MINS} minute target`,
            rows: rows.filter((r) => r.allocMins != null),
            focus: "alloc",
          })}
          onHit={() => onDrill({
            title: `Allocated within ${ALLOCATION_TARGET_MINS} min`,
            rows: rows.filter((r) => r.allocMins != null && r.allocMins <= ALLOCATION_TARGET_MINS),
            focus: "alloc",
          })}
          onMiss={() => onDrill({
            title: `Allocation over ${ALLOCATION_TARGET_MINS} min`,
            rows: rows.filter((r) => r.allocMins != null && r.allocMins > ALLOCATION_TARGET_MINS),
            focus: "alloc",
          })}
        />

        {/* Sales exec — first contact */}
        <AvgCard
          title="Sales exec — first contact"
          hint="Passed to exec → first contact made"
          target={CONTACT_TARGET_MINS}
          avg={s.contactAvg}
          measured={s.contactMeasured}
          hit={s.contactHit} missed={s.contactMissed}
          onAll={() => onDrill({
            title: "First contact — all enquiries",
            subtitle: `On target and over, against the ${CONTACT_TARGET_MINS} minute target`,
            rows: rows.filter((r) => r.contactMins != null),
            focus: "contact",
          })}
          onHit={() => onDrill({
            title: `Contacted within ${CONTACT_TARGET_MINS} min`,
            rows: rows.filter((r) => r.contactMins != null && r.contactMins <= CONTACT_TARGET_MINS),
            focus: "contact",
          })}
          onMiss={() => onDrill({
            title: `First contact over ${CONTACT_TARGET_MINS} min`,
            rows: rows.filter((r) => r.contactMins != null && r.contactMins > CONTACT_TARGET_MINS),
            focus: "contact",
          })}
        />

        {/* Same-day — misses are the headline number */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Missed same-day contact
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Enquired before 17:30, not contacted that day
          </div>
          <button
            onClick={() => onDrill({
              title: "Same-day contact — all enquiries",
              subtitle: "Everything in scope: contacted same day and not",
              rows: rows.filter((r) => isSameDayReportable(r)),
              focus: "sameday",
            })}
            disabled={s.sameDayExpected === 0}
            title="Show every enquiry in scope for the same-day rule"
            className="mt-2 block w-full text-left disabled:cursor-default"
          >
            <span className={`text-4xl font-extrabold tabular-nums ${missTone(s.sameDayMissed, s.sameDayExpected)} ${s.sameDayExpected > 0 ? "hover:underline" : ""}`}>
              {s.sameDayMissed}
            </span>
            <span className="mt-1 block text-[11px] font-medium text-slate-500">
              missed{s.sameDayExpected > 0 ? " — tap for all" : ""}
            </span>
          </button>
          <div className="mt-3 flex gap-2 text-xs">
            <button
              onClick={() => onDrill({
                title: "Contacted same day",
                rows: rows.filter((r) => isSameDayReportable(r) && r.sameDayMet),
                focus: "sameday",
              })}
              className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              {s.sameDayMet} same day
            </button>
            <button
              onClick={() => onDrill({
                title: "NOT contacted same day",
                subtitle: "Enquired before 17:30 on a working day",
                rows: rows.filter((r) => isSameDayReportable(r) && !r.sameDayMet),
                focus: "sameday",
              })}
              className="flex-1 rounded-lg bg-red-50 px-2 py-1.5 font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-100"
            >
              {s.sameDayMissed} missed
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <span>out of {s.sameDayExpected} in scope</span>
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${missBadge(s.sameDayMissed, s.sameDayExpected)}`}>
              {pct(s.sameDayMet, s.sameDayExpected) == null
                ? "—"
                : `${pct(s.sameDayMet, s.sameDayExpected)}% same day`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          label="Total enquiries" value={s.total.toLocaleString()}
          onClick={() => onDrill({ title: "All enquiries", rows, focus: "contact" })}
        />
        <MiniStat
          label="Never contacted" value={s.neverContacted.toLocaleString()}
          tone={s.neverContacted > 0 ? "red" : "slate"}
          onClick={() => onDrill({
            title: "Never contacted", subtitle: "No first-contact recorded after the reporting grace window",
            rows: rows.filter((r) => isContactMissing(r)), focus: "contact",
          })}
        />
        <MiniStat
          label="No transfer recorded" value={s.awaitingTransfer.toLocaleString()}
          onClick={() => onDrill({
            title: "No transfer recorded", subtitle: "Blank after the reporting grace window",
            rows: rows.filter((r) => isTransferMissing(r)), focus: "alloc",
          })}
        />
      </div>
    </div>
  );
}

/** Average response time as the headline, bold and colour-coded. */
function AvgCard({
  title, hint, target, avg, measured, hit, missed, onAll, onHit, onMiss,
}: {
  title: string; hint: string; target: number;
  avg: number | null; measured: number; hit: number; missed: number;
  /** The headline average opens everything measured — on target and over. */
  onAll: () => void;
  onHit: () => void; onMiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
          Target {target}m
        </span>
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
      <button
        onClick={onAll}
        disabled={measured === 0}
        title="Show every enquiry behind this average"
        className="mt-2 block w-full text-left disabled:cursor-default"
      >
        <span className={`text-4xl font-extrabold tabular-nums ${timeTone(avg, target)} ${measured > 0 ? "hover:underline" : ""}`}>
          {formatMins(avg)}
        </span>
        <span className="mt-1 block text-[11px] font-medium text-slate-500">
          average{measured > 0 ? " — tap for all" : ""}
        </span>
      </button>
      <div className="mt-3 flex gap-2 text-xs">
        <button
          onClick={onHit}
          className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
        >
          {hit} on target
        </button>
        <button
          onClick={onMiss}
          className="flex-1 rounded-lg bg-red-50 px-2 py-1.5 font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-100"
        >
          {missed} over
        </button>
      </div>
      <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        {measured} measured
      </div>
    </div>
  );
}

function MiniStat({
  label, value, onClick, tone = "slate",
}: { label: string; value: string; onClick: () => void; tone?: "slate" | "red" }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-400 hover:shadow"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === "red" ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </div>
    </button>
  );
}

// ── By exec ───────────────────────────────────────────────────────────
// Allocation is sales support's job, not the exec's, so it is not shown
// here at all — an exec can't influence how long a lead sat before it
// reached them. Two things only: how fast they respond once it lands,
// and how many customers they left waiting overnight.
function ExecView({
  data, onDrill,
}: {
  data: Array<{ exec: string; rows: EnquiryRow[]; s: DashboardSummary }>;
  onDrill: (d: Drill) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-100/70 px-5 py-3">
        <p className="text-sm font-semibold text-slate-900">
          Two things count here: answer within {CONTACT_TARGET_MINS} minutes, and never let a
          customer go home unanswered.
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          The clock starts when the enquiry reaches you, and only runs 09:00–17:30 Mon–Fri —
          you are never charged for evenings or weekends. Time before it was passed to you is
          sales support&apos;s to answer for, so it is not counted against you.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Sales exec</th>
                <th className="px-3 py-2.5 text-right font-semibold">Enquiries</th>
                <th className="px-4 py-2.5 text-right font-semibold">
                  Average response
                  <span className="ml-1 font-normal text-slate-400">(target {CONTACT_TARGET_MINS}m)</span>
                </th>
                <th className="px-3 py-2.5 text-right font-semibold">Over target</th>
                <th className="px-4 py-2.5 text-right font-semibold">Missed same day</th>
                <th className="px-3 py-2.5 text-right font-semibold">Never contacted</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pending update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map(({ exec, rows, s }) => (
                <tr key={exec} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-semibold text-slate-900">{exec}</td>
                  <td className="px-3 py-3 text-right">
                    <Cell onClick={() => onDrill({ title: exec, subtitle: "All enquiries", rows, focus: "contact" })}>
                      {s.total}
                    </Cell>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xl font-bold tabular-nums ${timeTone(s.contactAvg, CONTACT_TARGET_MINS)}`}>
                      {formatMins(s.contactAvg)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Cell tone={s.contactMissed > 0 ? "red" : "slate"} onClick={() => onDrill({
                      title: exec, subtitle: `First contact over ${CONTACT_TARGET_MINS} min`,
                      rows: rows.filter((r) => r.contactMins != null && r.contactMins > CONTACT_TARGET_MINS),
                      focus: "contact",
                    })}>
                      {s.contactMissed}
                    </Cell>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDrill({
                        title: exec, subtitle: "Not contacted same day",
                        rows: rows.filter((r) => isSameDayReportable(r) && !r.sameDayMet),
                        focus: "sameday",
                      })}
                      className={`text-xl font-bold tabular-nums hover:underline ${missTone(s.sameDayMissed, s.sameDayExpected)}`}
                    >
                      {s.sameDayMissed}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Cell tone={s.neverContacted > 0 ? "red" : "slate"} onClick={() => onDrill({
                      title: exec, subtitle: "Never contacted",
                      rows: rows.filter((r) => isContactMissing(r)), focus: "contact",
                    })}>
                      {s.neverContacted}
                    </Cell>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Cell({
  children, onClick, tone = "slate",
}: { children: React.ReactNode; onClick: () => void; tone?: "slate" | "red" }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 font-bold tabular-nums underline-offset-2 hover:underline ${
        tone === "red" ? "text-red-600 hover:bg-red-50" : "text-slate-900 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

// ── Daily log ─────────────────────────────────────────────────────────
function DailyView({
  data, onDrill,
}: {
  data: Array<{ day: string; rows: EnquiryRow[]; s: DashboardSummary }>;
  onDrill: (d: Drill) => void;
}) {
  const dow = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Daily missed same-day contact</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Enquiries in before 17:30 that were not contacted that day. Click a number for the
          customers behind it. Green only when the completed report day is a clean sweep.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Date</th>
              <th className="px-3 py-2.5 text-right font-semibold">Enquiries</th>
              <th className="px-3 py-2.5 text-right font-semibold">In scope</th>
              <th className="px-4 py-2.5 text-right font-semibold">Missed</th>
              <th className="px-3 py-2.5 text-right font-semibold">Same day</th>
              <th className="px-3 py-2.5 text-right font-semibold">Avg response</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pending update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map(({ day, rows, s }) => (
              <tr key={day} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">
                    {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
                      day: "2-digit", month: "short", timeZone: "UTC",
                    })}
                  </span>
                  <span className="ml-1.5 text-[11px] text-slate-400">{dow(day)}</span>
                </td>
                <td className="px-3 py-3 text-right">
                  <Cell onClick={() => onDrill({ title: day, subtitle: "All enquiries raised", rows, focus: "sameday" })}>
                    {s.total}
                  </Cell>
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs text-slate-600">{s.sameDayExpected}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDrill({
                      title: day, subtitle: "NOT contacted same day",
                      rows: rows.filter((r) => isSameDayReportable(r) && !r.sameDayMet), focus: "sameday",
                    })}
                    className={`text-xl font-bold tabular-nums hover:underline ${missTone(s.sameDayMissed, s.sameDayExpected)}`}
                  >
                    {s.sameDayMissed}
                  </button>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${missBadge(s.sameDayMissed, s.sameDayExpected)}`}>
                    {pct(s.sameDayMet, s.sameDayExpected) == null
                      ? "—"
                      : `${pct(s.sameDayMet, s.sameDayExpected)}%`}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className={`font-bold tabular-nums ${timeTone(s.contactAvg, CONTACT_TARGET_MINS)}`}>
                    {formatMins(s.contactAvg)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Drill-down ────────────────────────────────────────────────────────
function DrillPanel({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rs = needle
      ? drill.rows.filter((r) =>
          r.customer.toLowerCase().includes(needle) || r.salesExec.toLowerCase().includes(needle))
      : drill.rows;
    return [...rs].sort((a, b) => {
      if (drill.focus === "alloc") return (b.allocMins ?? -1) - (a.allocMins ?? -1);
      if (drill.focus === "contact") return (b.contactMins ?? -1) - (a.contactMins ?? -1);
      return b.enquiryAt - a.enquiryAt;
    });
  }, [drill, q]);

  function exportCsv() {
    const isAlloc = drill.focus === "alloc";
    const head = [
      "Customer", "Sales exec", "Enquiry", "Transferred", "First contact",
      isAlloc ? "Allocation mins" : "Response mins", "Same day",
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(",")];
    for (const r of shown) {
      lines.push([
        esc(r.customer), esc(r.salesExec), esc(formatWall(r.enquiryAt)),
        esc(formatWall(r.transferredAt)), esc(formatWall(r.contactedAt)),
        String(r.contactMins ?? ""),
        isSameDayReportable(r)
          ? (r.sameDayMet ? "yes" : "NO")
          : "n/a",
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enquiries-${drill.title.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{drill.title}</h2>
            {drill.subtitle && <p className="mt-0.5 text-xs text-slate-500">{drill.subtitle}</p>}
            <p className="mt-1 text-xs font-medium text-slate-700">
              {drill.rows.length} {drill.rows.length === 1 ? "customer" : "customers"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={exportCsv}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              CSV
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </header>

        <div className="border-b border-slate-100 px-5 py-2">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by customer or exec…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Nothing matches.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Customer</th>
                  <th className="px-3 py-2 text-left font-semibold">Exec</th>
                  <th className="px-3 py-2 text-left font-semibold">Timeline</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {drill.focus === "alloc" ? "Allocation" : "Response"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{r.customer}</div>
                      {r.source && <div className="text-[11px] text-slate-400">{r.source}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.salesExec}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                      <div>in {formatWall(r.enquiryAt)}</div>
                      <div className="text-slate-400">
                        → passed {formatWall(r.transferredAt)}
                      </div>
                      <div className="text-slate-400">
                        → contact {formatWall(r.contactedAt)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {/* Allocation drill-downs are about sales support's
                          clock (enquiry → transfer); everything else is the
                          exec's (transfer → contact). Showing the wrong one
                          would have people arguing about the wrong number. */}
                      {drill.focus === "alloc" ? (
                        <MinsBadge mins={r.allocMins} target={ALLOCATION_TARGET_MINS} />
                      ) : (
                        <MinsBadge mins={r.contactMins} target={CONTACT_TARGET_MINS} />
                      )}
                      {isSameDayReportable(r) && !r.sameDayMet && (
                        <div className="mt-0.5 text-[10px] font-bold uppercase text-red-600">not same day</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
}

function MinsBadge({ mins, target }: { mins: number | null; target: number }) {
  if (mins == null) {
    return <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">—</span>;
  }
  const ok = mins <= target;
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
        ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
      }`}
    >
      {formatMins(mins)}
    </span>
  );
}
