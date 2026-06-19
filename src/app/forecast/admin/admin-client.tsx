"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ForecastPageHeader } from "../page-shell";
import { MonthPicker } from "../pickers";
import { setConfigAction, addConfigAction, deleteConfigAction, setActualAction } from "../actions";
import { getLinesForSheet, type ForecastLine, type SheetKey } from "../line-definitions";

export interface ConfigPayload {
  key: string;
  value: number;
  description: string | null;
  category: string;
}

interface Props {
  tab: "math" | "baselines" | "published";
  sheet: SheetKey;
  month: string;
  config: ConfigPayload[];
  actuals: { lineKey: string; value: number }[];
}

const SHEET_LABELS: Record<SheetKey, string> = {
  car: "Lease New Cars",
  cv: "Lease New Commercial",
  overheads: "General Overheads",
};

const TABS: { key: Props["tab"]; label: string; description: string }[] = [
  { key: "math",       label: "Math",                description: "Percentages, multipliers and constants the forecast and quarterly views use." },
  { key: "baselines",  label: "Prior Year + Budget", description: "Per-sheet, per-month prior-year and budget values driving the monthly variances." },
  { key: "published",  label: "Published Accounts",  description: "Final published account numbers — once entered they overwrite that month's forecast." },
];

export function AdminClient({ tab, sheet, month, config, actuals }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go(updates: Partial<{ tab: string; sheet: string; month: string }>) {
    const url = new URL(window.location.href);
    if (updates.tab !== undefined) url.searchParams.set("tab", updates.tab);
    if (updates.sheet !== undefined) url.searchParams.set("sheet", updates.sheet);
    if (updates.month !== undefined) url.searchParams.set("month", updates.month);
    start(() => router.push(url.pathname + "?" + url.searchParams.toString()));
  }

  return (
    <>
      <ForecastPageHeader
        title="Admin"
        description="Math config, baseline numbers (prior year + budget) and final published accounts that drive the forecasts."
        picker={tab !== "math" ? <MonthPicker value={month} /> : undefined}
      />

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {err && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
        )}

        {/* Tabs */}
        <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => go({ tab: t.key })}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <p className="text-xs text-slate-500">
          {TABS.find((t) => t.key === tab)?.description}
        </p>

        {tab === "math" && (
          <MathTab
            config={config}
            pending={pending}
            onError={setErr}
            onRefresh={() => router.refresh()}
          />
        )}

        {tab !== "math" && (
          <DataTab
            tab={tab}
            sheet={sheet}
            month={month}
            actuals={actuals}
            pending={pending}
            onError={setErr}
            onRefresh={() => router.refresh()}
            onPickSheet={(s) => go({ sheet: s })}
          />
        )}
      </main>
    </>
  );
}

// ────────────────────────── Math tab ────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  car: "Lease New Cars",
  cv: "Lease New Commercial",
  overheads: "General Overheads",
  bpm: "Quarterly (BPM)",
  general: "General",
};
const CATEGORY_ORDER = ["car", "cv", "overheads", "bpm", "general"];

function MathTab({
  config, pending, onError, onRefresh,
}: {
  config: ConfigPayload[];
  pending: boolean;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  const [, start] = useTransition();
  const byCat = new Map<string, ConfigPayload[]>();
  for (const c of config) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category)!.push(c);
  }

  function commitValue(key: string, value: number) {
    onError(null);
    start(async () => {
      const res = await setConfigAction(key, value);
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  function remove(key: string) {
    if (!confirm(`Delete config "${key}"?`)) return;
    start(async () => {
      const res = await deleteConfigAction(key);
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  return (
    <div className="space-y-6">
      <AddConfigCard pending={pending} onError={onError} onAdded={onRefresh} />

      {CATEGORY_ORDER.map((cat) => {
        const rows = byCat.get(cat);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={cat} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-3">
              <h3 className="text-sm font-semibold text-slate-900">{CATEGORY_LABELS[cat] ?? cat}</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-6 py-2.5 text-left font-medium w-1/3">Key</th>
                  <th className="px-3 py-2.5 text-left font-medium">Description</th>
                  <th className="px-3 py-2.5 text-right font-medium w-32">Value</th>
                  <th className="px-6 py-2.5 text-right font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, idx) => (
                  <tr key={c.key} className={`border-t border-slate-100 ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                    <td className="px-6 py-2 font-mono text-xs text-slate-700">{c.key}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{c.description ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="0.01" defaultValue={c.value} disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== c.value) commitValue(c.key, v);
                        }}
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-2 text-right">
                      <button
                        type="button" disabled={pending} onClick={() => remove(c.key)}
                        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function AddConfigCard({
  pending, onError, onAdded,
}: {
  pending: boolean;
  onError: (e: string | null) => void;
  onAdded: () => void;
}) {
  const [, start] = useTransition();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-transparent px-6 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Add a new value</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          For example <code className="rounded bg-slate-100 px-1">car_dpa_pct = 2.5</code>.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onError(null);
          const v = Number(value);
          if (!Number.isFinite(v)) { onError("Value must be a number."); return; }
          start(async () => {
            const res = await addConfigAction({ key, value: v, description, category });
            if (!res.ok) { onError(res.error); return; }
            setKey(""); setValue(""); setDescription("");
            onAdded();
          });
        }}
        className="grid gap-3 p-6 sm:grid-cols-[1fr_2fr_1fr_120px_auto]"
      >
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="my_new_pct"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this?"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" type="number" step="0.01"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums" />
        <button type="submit" disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Add</button>
      </form>
    </section>
  );
}

// ────────────────────────── Baselines / Published tab ──────────────

const SHEET_PICKER_TABS: { key: SheetKey; label: string }[] = [
  { key: "car",       label: "Lease New Cars" },
  { key: "cv",        label: "Lease New Commercial" },
  { key: "overheads", label: "General Overheads" },
];

function DataTab({
  tab, sheet, month, actuals, pending, onError, onRefresh, onPickSheet,
}: {
  tab: "baselines" | "published";
  sheet: SheetKey;
  month: string;
  actuals: { lineKey: string; value: number }[];
  pending: boolean;
  onError: (e: string | null) => void;
  onRefresh: () => void;
  onPickSheet: (s: SheetKey) => void;
}) {
  const [, start] = useTransition();
  const lines = getLinesForSheet(sheet);
  const byKey = new Map<string, number>();
  for (const a of actuals) byKey.set(a.lineKey, a.value);

  function commit(prefix: string, lineKey: string, value: number | null) {
    onError(null);
    start(async () => {
      const res = await setActualAction({
        monthYyyymm: month,
        sheet,
        lineKey: `${prefix}_${lineKey}`,
        value,
      });
      if (!res.ok) onError(res.error); else onRefresh();
    });
  }

  // Published actuals — the user may not have all lines filled in, so we
  // also allow skipping irrelevant lines (e.g. only enter the totals).
  // Baselines view shows two columns; published shows one.

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Sheet
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {SHEET_PICKER_TABS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onPickSheet(s.key)}
                className={`rounded-xl border p-3 text-left text-sm font-semibold transition ${
                  sheet === s.key
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-slate-200 px-5 py-2.5 text-[11px] text-slate-500">
          {tab === "baselines"
            ? "Key prior-year and budget figures for each line — these drive the variance columns on the monthly view."
            : "Once the official accounts publish, key the final figures here. They'll overwrite that month's forecast on the monthly + quarterly views."}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Line</th>
                {tab === "baselines" ? (
                  <>
                    <th className="px-3 py-3 text-right font-medium">Prior year</th>
                    <th className="px-5 py-3 text-right font-medium">Budget</th>
                  </>
                ) : (
                  <th className="px-5 py-3 text-right font-medium">Published actual</th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                if (l.kind === "header") {
                  return (
                    <tr key={l.key} className="bg-gradient-to-r from-slate-100 to-transparent">
                      <td colSpan={tab === "baselines" ? 3 : 2} className="px-5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                        {l.label}
                      </td>
                    </tr>
                  );
                }
                if (l.kind === "total" || l.kind === "perUnit") {
                  return (
                    <tr key={l.key} className="border-t border-slate-100 bg-slate-50/60">
                      <td className="px-5 py-2 text-slate-500 font-semibold">{l.label}</td>
                      {tab === "baselines" ? (
                        <>
                          <td className="px-3 py-2 text-right text-slate-300">auto</td>
                          <td className="px-5 py-2 text-right text-slate-300">auto</td>
                        </>
                      ) : (
                        <td className="px-5 py-2 text-right text-slate-300">auto</td>
                      )}
                    </tr>
                  );
                }
                const stripe = idx % 2 === 0 ? "" : "bg-slate-50/40";
                return (
                  <tr key={l.key} className={`border-t border-slate-100 ${stripe}`}>
                    <td className="px-5 py-2 text-slate-800">{l.label}</td>
                    {tab === "baselines" ? (
                      <>
                        <ValueCell value={byKey.get(`prior_year_${l.key}`)} kind={l.kind} pending={pending}
                          onCommit={(v) => commit("prior_year", l.key, v)} />
                        <ValueCell value={byKey.get(`budget_${l.key}`)} kind={l.kind} pending={pending}
                          onCommit={(v) => commit("budget", l.key, v)} padding="px-5" />
                      </>
                    ) : (
                      <ValueCell value={byKey.get(`published_${l.key}`)} kind={l.kind} pending={pending}
                        onCommit={(v) => commit("published", l.key, v)} padding="px-5" />
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-slate-500">
        Working in <strong>{SHEET_LABELS[sheet]}</strong>. Editing here only affects {month};
        switch month with the picker above, or sheet with the buttons. Total / per-unit rows derive
        themselves on the Monthly view — you only need to key the source lines.
      </p>
    </div>
  );
}

function ValueCell({
  value, kind, pending, onCommit, padding = "px-3",
}: {
  value: number | undefined;
  kind: ForecastLine["kind"];
  pending: boolean;
  onCommit: (v: number | null) => void;
  padding?: string;
}) {
  return (
    <td className={`${padding} py-1.5 text-right`}>
      <input
        type="number"
        step={kind === "unit" ? "1" : "0.01"}
        defaultValue={value ?? ""}
        disabled={pending}
        onBlur={(e) => {
          if (e.target.value === "") {
            if (value !== undefined) onCommit(null);
          } else {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v !== value) onCommit(v);
          }
        }}
        className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
      />
    </td>
  );
}
