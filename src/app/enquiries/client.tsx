"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EnquiryRow, Summary } from "@/lib/enquiries";
import {
  ALLOCATION_TARGET_MINS,
  CONTACT_TARGET_MINS,
  formatMins,
  formatWall,
} from "@/lib/business-hours";
import {
  isContactMissing,
  isReportDataPending,
  isSameDayReportable,
  isTransferMissing,
} from "@/lib/enquiry-reporting";

type Tab = "department" | "exec" | "daily";

// A drill-down is just a filtered slice of the rows the page already
// holds, so opening one is instant — no round trip. Every clickable
// number on the page produces one of these.
interface Drill {
  title: string;
  subtitle?: string;
  rows: EnquiryRow[];
  focus: "alloc" | "contact" | "sameday" | "pending";
}

type DashboardSummary = Summary;

function summarise(
  rows: EnquiryRow[],
  reportHorizon: number | null,
): DashboardSummary {
  const alloc = rows.map((r) => r.allocMins).filter((n): n is number => n != null);
  const contact = rows.map((r) => r.contactMins).filter((n): n is number => n != null);
  const sde = rows.filter((r) => isSameDayReportable(r, reportHorizon));
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
    neverContacted: rows.filter((r) => isContactMissing(r, reportHorizon)).length,
    awaitingTransfer: rows.filter((r) => isTransferMissing(r, reportHorizon)).length,
    reportPending: rows.filter((r) => isReportDataPending(r, reportHorizon)).length,
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
  rows, from, to, min, max, reportHorizon,
}: {
  rows: EnquiryRow[];
  from: string; to: string;
  min: string | null; max: string | null;
  reportHorizon: number | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("department");
  const [drill, setDrill] = useState<Drill | null>(null);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const dept = useMemo(() => summarise(rows, reportHorizon), [rows, reportHorizon]);
  const byExec = useMemo(() => {
    const m = new Map<string, EnquiryRow[]>();
    for (const r of rows) {
      const l = m.get(r.salesExec) ?? [];
      l.push(r);
      m.set(r.salesExec, l);
    }
    return [...m.entries()]
      .map(([exec, rs]) => ({ exec, rows: rs, s: summarise(rs, reportHorizon) }))
      // Worst first: most same-day misses, then slowest average response.
      .sort((a, b) =>
        b.s.sameDayMissed - a.s.sameDayMissed ||
        (b.s.contactAvg ?? -1) - (a.s.contactAvg ?? -1));
  }, [rows, reportHorizon]);
  const byDay = useMemo(() => {
    const m = new Map<string, EnquiryRow[]>();
    for (const r of rows) {
      const l = m.get(r.enquiryDay) ?? [];
      l.push(r);
      m.set(r.enquiryDay, l);
    }
    return [...m.entries()]
      .map(([day, rs]) => ({ day, rows: rs, s: summarise(rs, reportHorizon) }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [rows, reportHorizon]);

  function applyRange() {
    const p = new URLSearchParams();
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    router.push(`/enquiries?${p.toString()}`);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-600">
            From
            <input
              type="date" value={f} min={min ?? undefined} max={max ?? undefined}
              onChange={(e) => setF(e.target.value)}
              className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input
              type="date" value={t} min={min ?? undefined} max={max ?? undefined}
              onChange={(e) => setT(e.target.value)}
              className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>
          <button
            onClick={applyRange}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            Apply
          </button>
          {(from !== (min ?? "") || to !== (max ?? "")) && (
            <button
              onClick={() => { setF(min ?? ""); setT(max ?? ""); router.push("/enquiries"); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Reset
            </button>
          )}
        </div>
        <nav className="flex gap-1 rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
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

      {dept.reportPending > 0 && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
          <span className="font-semibold">
            {dept.reportPending} recent {dept.reportPending === 1 ? "enquiry has" : "enquiries have"} data awaiting the next daily export.
          </span>{" "}
          Each blank field is only counted as a failure once its own reporting grace window has elapsed.
        </div>
      )}

      {tab === "department" && (
        <DepartmentView
          s={dept}
          rows={rows}
          reportHorizon={reportHorizon}
          onDrill={setDrill}
        />
      )}
      {tab === "exec" && (
        <ExecView data={byExec} reportHorizon={reportHorizon} onDrill={setDrill} />
      )}
      {tab === "daily" && (
        <DailyView data={byDay} reportHorizon={reportHorizon} onDrill={setDrill} />
      )}

      {drill && (
        <DrillPanel
          drill={drill}
          reportHorizon={reportHorizon}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

// ── Department ────────────────────────────────────────────────────────
function DepartmentView({
  s, rows, reportHorizon, onDrill,
}: {
  s: DashboardSummary;
  rows: EnquiryRow[];
  reportHorizon: number | null;
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
              title: "NOT contacted same day",
              subtitle: "Completed report days; enquired before 17:30 on a working day",
              rows: rows.filter((r) => isSameDayReportable(r, reportHorizon) && !r.sameDayMet),
              focus: "sameday",
            })}
            className="mt-2 block w-full text-left"
          >
            <span className={`text-4xl font-extrabold tabular-nums ${missTone(s.sameDayMissed, s.sameDayExpected)} hover:underline`}>
              {s.sameDayMissed}
            </span>
          </button>
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
            rows: rows.filter((r) => isContactMissing(r, reportHorizon)), focus: "contact",
          })}
        />
        <MiniStat
          label="No transfer recorded" value={s.awaitingTransfer.toLocaleString()}
          onClick={() => onDrill({
            title: "No transfer recorded", subtitle: "Blank after the reporting grace window",
            rows: rows.filter((r) => isTransferMissing(r, reportHorizon)), focus: "alloc",
          })}
        />
        <MiniStat
          label="Awaiting report update" value={s.reportPending.toLocaleString()}
          onClick={() => onDrill({
            title: "Awaiting report update",
            subtitle: "Recent blank outcomes expected in the next daily export",
            rows: rows.filter((r) => isReportDataPending(r, reportHorizon)), focus: "pending",
          })}
        />
      </div>
    </div>
  );
}

/** Average response time as the headline, bold and colour-coded. */
function AvgCard({
  title, hint, target, avg, measured, hit, missed, onHit, onMiss,
}: {
  title: string; hint: string; target: number;
  avg: number | null; measured: number; hit: number; missed: number;
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
      <div className={`mt-2 text-4xl font-extrabold tabular-nums ${timeTone(avg, target)}`}>
        {formatMins(avg)}
      </div>
      <div className="mt-1 text-[11px] font-medium text-slate-500">average</div>
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
  data, reportHorizon, onDrill,
}: {
  data: Array<{ exec: string; rows: EnquiryRow[]; s: DashboardSummary }>;
  reportHorizon: number | null;
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
                        rows: rows.filter((r) => isSameDayReportable(r, reportHorizon) && !r.sameDayMet),
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
                      rows: rows.filter((r) => isContactMissing(r, reportHorizon)), focus: "contact",
                    })}>
                      {s.neverContacted}
                    </Cell>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Cell onClick={() => onDrill({
                      title: exec,
                      subtitle: "Awaiting the next daily export",
                      rows: rows.filter((r) => isReportDataPending(r, reportHorizon)),
                      focus: "pending",
                    })}>
                      {s.reportPending}
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
  data, reportHorizon, onDrill,
}: {
  data: Array<{ day: string; rows: EnquiryRow[]; s: DashboardSummary }>;
  reportHorizon: number | null;
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
                      rows: rows.filter((r) => isSameDayReportable(r, reportHorizon) && !r.sameDayMet), focus: "sameday",
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
                <td className="px-3 py-3 text-right">
                  <Cell onClick={() => onDrill({
                    title: day,
                    subtitle: "Awaiting the next daily export",
                    rows: rows.filter((r) => isReportDataPending(r, reportHorizon)),
                    focus: "pending",
                  })}>
                    {s.reportPending}
                  </Cell>
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
function DrillPanel({
  drill, reportHorizon, onClose,
}: {
  drill: Drill;
  reportHorizon: number | null;
  onClose: () => void;
}) {
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
    const head = ["Customer", "Sales exec", "Enquiry", "Transferred", "First contact", "Response mins", "Same day"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(",")];
    for (const r of shown) {
      lines.push([
        esc(r.customer), esc(r.salesExec), esc(formatWall(r.enquiryAt)),
        esc(formatWall(r.transferredAt)), esc(formatWall(r.contactedAt)),
        String(r.contactMins ?? ""),
        isSameDayReportable(r, reportHorizon)
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
                  <th className="px-3 py-2 text-right font-semibold">Response</th>
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
                      <MinsBadge mins={r.contactMins} target={CONTACT_TARGET_MINS} />
                      {isReportDataPending(r, reportHorizon) && (
                        <div className="mt-0.5 text-[10px] font-bold uppercase text-sky-700">awaiting report</div>
                      )}
                      {isSameDayReportable(r, reportHorizon) && !r.sameDayMet && (
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
