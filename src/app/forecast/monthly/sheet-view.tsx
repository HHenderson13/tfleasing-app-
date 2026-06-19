"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActualAction, setInputAction } from "../actions";
import type { ForecastLine, SheetKey } from "../line-definitions";
import type { DealbookRollup } from "../rollup";

interface Props {
  sheet: SheetKey;
  month: string;
  lines: ForecastLine[];
  rollup: DealbookRollup;
  actuals: Map<string, number>;
  inputs: Map<string, number>;
  config: Map<string, number>;
}

// Pretty single-sheet view — matches the Excel template's row order but
// trades the cramped Day-10/20/30 columns for a cleaner layout:
//
//   PRIOR YEAR | BUDGET | DEALBOOK | FORECAST | Δ BUDGET | Δ PY
//
// Section headers visually divide the sheet (showroom totals, F&I, other
// income, variables, expenses, KPIs). Cells are inline-editable; totals
// + per-unit lines derive automatically.

export function SheetView({ sheet, month, lines, rollup, actuals, inputs }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const resolved = useMemo(() => resolveValues(lines, rollup, actuals), [lines, rollup, actuals]);

  function commitActual(column: "actual" | "budget" | "forecast", lineKey: string, value: number | null) {
    setErr(null);
    start(async () => {
      const res = await setActualAction({
        monthYyyymm: month,
        sheet,
        lineKey: `${column}_${lineKey}`,
        value,
      });
      if (!res.ok) setErr(res.error); else router.refresh();
    });
  }

  function commitInput(scenarioKey: string, value: number | null) {
    setErr(null);
    start(async () => {
      const res = await setInputAction({ monthYyyymm: month, sheet, scenarioKey, value });
      if (!res.ok) setErr(res.error); else router.refresh();
    });
  }

  const additionalUnits = inputs.get("additional_units") ?? 0;
  const additionalMarginPerUnit = inputs.get("additional_margin_per_unit") ?? 0;

  return (
    <div className="space-y-6">
      {sheet !== "overheads" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Forecast scenario</h3>
              <p className="mt-1 text-sm text-slate-500">
                On top of the dealbook so far, how many more units and at what chassis margin per unit?
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Extra units</span>
                <input
                  type="number" step="1" defaultValue={additionalUnits} disabled={pending}
                  onBlur={(e) => commitInput("additional_units", e.target.value === "" ? null : Number(e.target.value))}
                  className="mt-1 w-28 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none disabled:opacity-50"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">£ per unit</span>
                <input
                  type="number" step="0.01" defaultValue={additionalMarginPerUnit} disabled={pending}
                  onBlur={(e) => commitInput("additional_margin_per_unit", e.target.value === "" ? null : Number(e.target.value))}
                  className="mt-1 w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none disabled:opacity-50"
                />
              </label>
              <div className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                +{" "}£{(additionalUnits * additionalMarginPerUnit).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {sheet === "car" ? "Lease New Cars" : sheet === "cv" ? "Lease New Commercial" : "General Overheads"}
          </h3>
          {err && <span className="text-xs text-rose-600">{err}</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Line</th>
                <th className="px-3 py-3 text-right font-medium">Prior year</th>
                <th className="px-3 py-3 text-right font-medium">Budget</th>
                <th className="px-3 py-3 text-right font-medium">Dealbook</th>
                <th className="px-3 py-3 text-right font-medium">Forecast</th>
                <th className="px-3 py-3 text-right font-medium">vs Budget</th>
                <th className="px-5 py-3 text-right font-medium">vs PY</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                if (l.kind === "header") {
                  return (
                    <tr key={l.key} className="bg-gradient-to-r from-slate-100 to-transparent">
                      <td colSpan={7} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                        {l.label}
                      </td>
                    </tr>
                  );
                }
                const a = resolved.actual.get(l.key) ?? 0;
                const b = resolved.budget.get(l.key) ?? 0;
                const f = resolved.forecast.get(l.key) ?? 0;
                const dbVal = resolved.dealbook.get(l.key);
                const vsB = f - b;
                const vsA = f - a;
                const editable = l.kind === "money" || l.kind === "unit" || l.kind === "pct";
                const isTotal = l.kind === "total";
                const stripe = idx % 2 === 0 ? "" : "bg-slate-50/40";
                const totalClass = isTotal ? "bg-slate-50 font-semibold text-slate-900" : "";
                return (
                  <tr key={l.key} className={`border-t border-slate-100 ${stripe} ${totalClass}`}>
                    <td className="px-5 py-2 text-slate-800">{l.label}</td>
                    <Cell value={a} kind={l.kind} editable={editable} pending={pending}
                      onCommit={(v) => commitActual("actual", l.key, v)} />
                    <Cell value={b} kind={l.kind} editable={editable} pending={pending}
                      onCommit={(v) => commitActual("budget", l.key, v)} />
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {dbVal === undefined ? "—" : formatNumber(dbVal, l.kind)}
                    </td>
                    <Cell value={f} kind={l.kind} editable={editable} pending={pending}
                      onCommit={(v) => commitActual("forecast", l.key, v)} highlight />
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(vsB)}`}>
                      {formatNumber(vsB, l.kind === "unit" ? "unit" : "money")}
                    </td>
                    <td className={`px-5 py-2 text-right tabular-nums ${tone(vsA)}`}>
                      {formatNumber(vsA, l.kind === "unit" ? "unit" : "money")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Cell({
  value, kind, editable, pending, onCommit, highlight,
}: {
  value: number;
  kind: ForecastLine["kind"];
  editable: boolean;
  pending: boolean;
  onCommit: (v: number | null) => void;
  highlight?: boolean;
}) {
  if (!editable) {
    return (
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
        {formatNumber(value, kind)}
      </td>
    );
  }
  return (
    <td className="px-3 py-1.5 text-right">
      <input
        type="number"
        step={kind === "unit" ? "1" : "0.01"}
        defaultValue={value || ""}
        disabled={pending}
        onBlur={(e) => {
          if (e.target.value === "") onCommit(null);
          else if (Number(e.target.value) !== value) onCommit(Number(e.target.value));
        }}
        className={`w-28 rounded-lg border bg-white px-2.5 py-1 text-right text-sm tabular-nums focus:outline-none disabled:opacity-50 ${
          highlight
            ? "border-slate-300 hover:border-slate-400 focus:border-slate-700 focus:ring-1 focus:ring-slate-200"
            : "border-transparent hover:border-slate-200 focus:border-slate-400"
        }`}
      />
    </td>
  );
}

function tone(v: number): string {
  if (Math.abs(v) < 0.005) return "text-slate-300";
  return v > 0 ? "text-emerald-700" : "text-rose-700";
}

function formatNumber(v: number, kind: ForecastLine["kind"]): string {
  if (kind === "unit") return Math.round(v).toString();
  if (kind === "pct") return `${v.toFixed(2)}%`;
  if (Math.abs(v) < 0.005) return "0";
  return v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Single resolution pass. Leaves are set first (dealbook + user actuals),
// then totals + per-unit lines derive in a few sweep passes so nested
// rollups settle.
function resolveValues(lines: ForecastLine[], rollup: DealbookRollup, actuals: Map<string, number>) {
  const actual = new Map<string, number>();
  const budget = new Map<string, number>();
  const forecast = new Map<string, number>();
  const dealbook = new Map<string, number>();

  for (const l of lines) {
    if (l.kind === "header") continue;
    if (l.dealbookKey) dealbook.set(l.key, rollup[l.dealbookKey] ?? 0);
    const a = actuals.get(`actual_${l.key}`);
    if (a !== undefined) actual.set(l.key, a);
    const b = actuals.get(`budget_${l.key}`);
    if (b !== undefined) budget.set(l.key, b);
    const f = actuals.get(`forecast_${l.key}`);
    if (f !== undefined) forecast.set(l.key, f);
  }
  // Default forecast falls back to dealbook so far.
  for (const l of lines) {
    if (forecast.has(l.key)) continue;
    const v = dealbook.get(l.key);
    if (v !== undefined) forecast.set(l.key, v);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const l of lines) {
      if (l.kind === "total" && l.totalOf) {
        const sum = (m: Map<string, number>) => l.totalOf!.reduce((acc, k) => acc + (m.get(k) ?? 0), 0);
        actual.set(l.key, sum(actual));
        budget.set(l.key, sum(budget));
        forecast.set(l.key, sum(forecast));
      } else if (l.kind === "perUnit" && l.perUnitOf) {
        const calc = (m: Map<string, number>) => {
          const money = m.get(l.perUnitOf!.money);
          const units = m.get(l.perUnitOf!.units);
          return money !== undefined && units && units !== 0 ? money / units : 0;
        };
        actual.set(l.key, calc(actual));
        budget.set(l.key, calc(budget));
        forecast.set(l.key, calc(forecast));
      }
    }
  }
  return { actual, budget, forecast, dealbook };
}
