"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActualAction, setInputAction } from "./actions";
import type { ForecastLine, SheetKey } from "./line-definitions";
import type { DealbookRollup } from "./rollup";

interface Props {
  sheet: SheetKey;
  month: string;
  lines: ForecastLine[];
  rollup: DealbookRollup;
  actuals: Map<string, number>;     // user-keyed final accounts
  inputs: Map<string, number>;      // scenario inputs (additional units etc)
  config: Map<string, number>;
}

// The sheet renders one row per line definition. Columns mirror the Excel
// template the user works from:
//
//   Actual (last year) — keyed by the user via the Actuals input
//   Budget             — user-keyed
//   Dealbook so far    — read-only, summed from uploaded dealbook lines
//   Forecast           — user-keyed (e.g. Day10/20/30 column)
//   vs Budget / vs PY  — derived
//
// First version is intentionally simple: Actuals is a single cell per row,
// not split by Day-10/20/30. We can extend later — the schema already
// keys (month, sheet, line_key) so adding columns is purely UI.

export function SheetTab({ sheet, month, lines, rollup, actuals, inputs, config }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Build the "Dealbook so far" column. The rollup gives us numeric totals
  // per dealbook column; the line definition tells us which column to use.
  const dealbookByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (!l.dealbookKey) continue;
      m.set(l.key, rollup[l.dealbookKey] ?? 0);
    }
    return m;
  }, [lines, rollup]);

  // Resolve numeric values per (column × line). We resolve in this order:
  //   1. If the user has keyed an actual → use that
  //   2. Else if the line is a total/perUnit → derive from other resolved
  //      values
  //   3. Else if the line has a dealbookKey → use the dealbook sum
  //   4. Else 0
  // Forecast column = Dealbook so far + scenario inputs (additional_units
  // × additional_margin_per_unit when set).
  const resolved = useMemo(() => {
    const actual = new Map<string, number>();
    const budget = new Map<string, number>();
    const forecast = new Map<string, number>();
    const dealbook = new Map<string, number>();

    // Pass 1: leaf values for dealbook + actuals + budget.
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
    // Default forecast = dealbook so far if user hasn't typed one.
    for (const l of lines) {
      if (forecast.has(l.key)) continue;
      const v = dealbook.get(l.key);
      if (v !== undefined) forecast.set(l.key, v);
    }
    // Pass 2: derive totals + perUnits (multiple passes to handle nesting).
    for (let pass = 0; pass < 3; pass++) {
      for (const l of lines) {
        if (l.kind === "total" && l.totalOf) {
          const sum = (map: Map<string, number>) => l.totalOf!.reduce((acc, k) => acc + (map.get(k) ?? 0), 0);
          actual.set(l.key, sum(actual));
          budget.set(l.key, sum(budget));
          forecast.set(l.key, sum(forecast));
        } else if (l.kind === "perUnit" && l.perUnitOf) {
          const calc = (map: Map<string, number>) => {
            const m = map.get(l.perUnitOf!.money);
            const u = map.get(l.perUnitOf!.units);
            return m !== undefined && u && u !== 0 ? m / u : 0;
          };
          actual.set(l.key, calc(actual));
          budget.set(l.key, calc(budget));
          forecast.set(l.key, calc(forecast));
        }
      }
    }
    return { actual, budget, forecast, dealbook };
  }, [lines, rollup, actuals]);

  // Used by the inline editors so a save against a single cell doesn't
  // need to re-key the whole sheet.
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

  // Scenario inputs that drive the forecast on top of the dealbook so far.
  const additionalUnits = inputs.get("additional_units") ?? 0;
  const additionalMarginPerUnit = inputs.get("additional_margin_per_unit") ?? 0;

  return (
    <div className="space-y-4">
      {sheet !== "overheads" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Forecast scenario</h3>
          <p className="mt-1 text-xs text-slate-500">
            On top of the dealbook actuals so far this month, how many more units do you expect, and
            at what chassis margin per unit?
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-slate-500">
              Additional units
              <input
                type="number"
                step="1"
                defaultValue={additionalUnits}
                disabled={pending}
                onBlur={(e) => commitInput("additional_units", e.target.value === "" ? null : Number(e.target.value))}
                className="mt-1 w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col text-xs text-slate-500">
              Chassis £ margin / unit
              <input
                type="number"
                step="0.01"
                defaultValue={additionalMarginPerUnit}
                disabled={pending}
                onBlur={(e) => commitInput("additional_margin_per_unit", e.target.value === "" ? null : Number(e.target.value))}
                className="mt-1 w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums disabled:opacity-50"
              />
            </label>
            <span className="text-[11px] text-slate-500">
              Adds {additionalUnits} unit{additionalUnits === 1 ? "" : "s"} × £{additionalMarginPerUnit.toFixed(2)}
              {" "}= £{(additionalUnits * additionalMarginPerUnit).toFixed(2)} to the chassis-margin
              forecast (we'll wire this into specific lines once you've confirmed the mapping).
            </span>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {sheet === "car" ? "New Retail Car" : sheet === "cv" ? "New Retail CV" : "General Overheads"} — {month}
          </h3>
          <span className="text-[11px] text-slate-400">Click a cell to edit. Totals + per-unit calc automatically.</span>
        </div>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-2 py-2 w-1/3">Line</th>
                <th className="px-2 py-2 text-right">Actual (prior year)</th>
                <th className="px-2 py-2 text-right">Budget</th>
                <th className="px-2 py-2 text-right">Dealbook so far</th>
                <th className="px-2 py-2 text-right">Forecast</th>
                <th className="px-2 py-2 text-right">vs Budget</th>
                <th className="px-2 py-2 text-right">vs PY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => {
                if (l.kind === "header") {
                  return (
                    <tr key={l.key} className="bg-slate-50">
                      <td colSpan={7} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
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
                return (
                  <tr key={l.key} className="hover:bg-slate-50">
                    <td className={`px-2 py-1.5 text-slate-800 ${l.kind === "total" ? "font-semibold" : ""}`}>
                      {l.indent ? "  ".repeat(l.indent) : ""}{l.label}
                    </td>
                    <CellEdit value={a} kind={l.kind} editable={editable} pending={pending}
                      onCommit={(v) => commitActual("actual", l.key, v)} />
                    <CellEdit value={b} kind={l.kind} editable={editable} pending={pending}
                      onCommit={(v) => commitActual("budget", l.key, v)} />
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                      {dbVal === undefined ? "—" : formatNumber(dbVal, l.kind)}
                    </td>
                    <CellEdit value={f} kind={l.kind} editable={editable} pending={pending}
                      onCommit={(v) => commitActual("forecast", l.key, v)} />
                    <td className={`px-2 py-1.5 text-right tabular-nums ${vsB > 0 ? "text-emerald-700" : vsB < 0 ? "text-rose-700" : "text-slate-400"}`}>
                      {formatNumber(vsB, l.kind === "unit" ? "unit" : "money")}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${vsA > 0 ? "text-emerald-700" : vsA < 0 ? "text-rose-700" : "text-slate-400"}`}>
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

function CellEdit({
  value, kind, editable, pending, onCommit,
}: {
  value: number;
  kind: ForecastLine["kind"];
  editable: boolean;
  pending: boolean;
  onCommit: (v: number | null) => void;
}) {
  if (!editable) {
    return (
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{formatNumber(value, kind)}</td>
    );
  }
  return (
    <td className="px-2 py-1.5 text-right">
      <input
        type="number"
        step={kind === "unit" ? "1" : "0.01"}
        defaultValue={value || ""}
        disabled={pending}
        onBlur={(e) => {
          if (e.target.value === "") onCommit(null);
          else if (Number(e.target.value) !== value) onCommit(Number(e.target.value));
        }}
        className="w-24 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none disabled:opacity-50"
      />
    </td>
  );
}

function formatNumber(v: number, kind: ForecastLine["kind"]): string {
  if (kind === "unit") return Math.round(v).toString();
  if (kind === "pct") return `${(v).toFixed(2)}%`;
  if (Math.abs(v) < 0.005) return "0";
  return v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
