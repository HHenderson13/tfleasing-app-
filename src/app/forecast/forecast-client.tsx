"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  rollupDealbookLines,
  type DealbookRollup,
} from "./rollup";
import {
  getLinesForSheet,
  type SheetKey,
} from "./line-definitions";
import { UploadsTab, type LinePayload, type UploadPayload } from "./uploads-tab";
import { SheetTab } from "./sheet-tab";
import { BpmTab } from "./bpm-tab";
import { AdminTab, type ConfigPayload } from "./admin-tab";

export interface ActualPayload {
  sheet: string;
  lineKey: string;
  value: number;
}
export interface InputPayload {
  sheet: string;
  scenarioKey: string;
  value: number;
}

interface Props {
  month: string;
  months: string[];
  uploads: UploadPayload[];
  lines: LinePayload[];
  actuals: ActualPayload[];
  inputs: InputPayload[];
  config: ConfigPayload[];
}

type TabKey = "uploads" | "car" | "cv" | "overheads" | "bpm" | "admin";

const TABS: { key: TabKey; label: string }[] = [
  { key: "uploads",   label: "Uploads" },
  { key: "car",       label: "New Retail Car" },
  { key: "cv",        label: "New Retail CV" },
  { key: "overheads", label: "Overheads" },
  { key: "bpm",       label: "BPM (Quarter / YTD)" },
  { key: "admin",     label: "Admin" },
];

export function ForecastClient({ month, months, uploads, lines, actuals, inputs, config }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("uploads");
  const [pendingMonth, startMonth] = useTransition();

  function selectMonth(m: string) {
    startMonth(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("month", m);
      router.push(url.pathname + "?" + url.searchParams.toString());
    });
  }

  // Per-sheet rollups, computed once and memoised. The same dealbook line
  // set feeds Car (vehicle_type=Car) and CV (vehicle_type=LCV/Van); the
  // Overheads sheet doesn't use dealbook actuals so it gets an empty
  // rollup.
  const rollups = useMemo<Record<SheetKey, DealbookRollup>>(() => ({
    car: rollupDealbookLines(lines, "car"),
    cv: rollupDealbookLines(lines, "cv"),
    overheads: rollupDealbookLines([], "all"),
  }), [lines]);

  const actualsBySheet = useMemo(() => {
    const m: Record<string, Map<string, number>> = { car: new Map(), cv: new Map(), overheads: new Map() };
    for (const a of actuals) {
      if (!m[a.sheet]) m[a.sheet] = new Map();
      m[a.sheet].set(a.lineKey, a.value);
    }
    return m;
  }, [actuals]);

  const inputsBySheet = useMemo(() => {
    const m: Record<string, Map<string, number>> = { car: new Map(), cv: new Map(), overheads: new Map() };
    for (const i of inputs) {
      if (!m[i.sheet]) m[i.sheet] = new Map();
      m[i.sheet].set(i.scenarioKey, i.value);
    }
    return m;
  }, [inputs]);

  const configByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of config) m.set(c.key, c.value);
    return m;
  }, [config]);

  // The dealbook lines visible in the Uploads tab — narrowed to the
  // selected month so the user sees what they've got, regardless of which
  // upload they came from.
  const linesForMonth = useMemo(() => lines, [lines]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-500">Month</label>
        <select
          value={month}
          onChange={(e) => selectMonth(e.target.value)}
          disabled={pendingMonth}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums disabled:opacity-50"
        >
          {months.includes(month) ? null : <option value={month}>{month}</option>}
          {months.map((m) => (<option key={m} value={m}>{m}</option>))}
        </select>
        <span className="text-[11px] text-slate-400">
          {pendingMonth ? "Loading…" : `Showing data for ${month}`}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto">
        <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
          {TABS.map((t) => (
            <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </TabButton>
          ))}
        </nav>
      </div>

      <div className="mt-4">
        {tab === "uploads" && (
          <UploadsTab month={month} uploads={uploads} lines={linesForMonth} />
        )}
        {tab === "car" && (
          <SheetTab
            sheet="car"
            month={month}
            lines={getLinesForSheet("car")}
            rollup={rollups.car}
            actuals={actualsBySheet.car}
            inputs={inputsBySheet.car}
            config={configByKey}
          />
        )}
        {tab === "cv" && (
          <SheetTab
            sheet="cv"
            month={month}
            lines={getLinesForSheet("cv")}
            rollup={rollups.cv}
            actuals={actualsBySheet.cv}
            inputs={inputsBySheet.cv}
            config={configByKey}
          />
        )}
        {tab === "overheads" && (
          <SheetTab
            sheet="overheads"
            month={month}
            lines={getLinesForSheet("overheads")}
            rollup={rollups.overheads}
            actuals={actualsBySheet.overheads}
            inputs={inputsBySheet.overheads}
            config={configByKey}
          />
        )}
        {tab === "bpm" && (
          <BpmTab month={month} />
        )}
        {tab === "admin" && (
          <AdminTab config={config} />
        )}
      </div>
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}
