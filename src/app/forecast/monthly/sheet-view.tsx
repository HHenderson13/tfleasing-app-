"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInputAction } from "../actions";
import type { ForecastLine, SheetKey } from "../line-definitions";
import type { DealbookRollup } from "../rollup";

interface Props {
  sheet: SheetKey;
  month: string;
  lines: ForecastLine[];
  rollup: DealbookRollup;
  baselines: Map<string, number>;        // prior_year_* + budget_*
  published: Map<string, number>;         // published_* — overrides forecast when present
  inputs: Map<string, number>;            // scenario inputs
}

// Read-only sheet view. The only editable inputs live at the top of the
// page (scenario: extra units + £ per unit). Everything else is driven
// by:
//   - Prior year + Budget    → keyed in Admin → Baselines
//   - Dealbook so far         → CSV uploads + per-line month allocation
//   - Forecast               → Dealbook + scenario  (or Published actual,
//                              once Admin → Published Accounts has values
//                              for the month — that overwrites Forecast)
//
// Columns mirror the BPM / sheet templates the user copies into.

export function SheetView({ sheet, month, lines, rollup, baselines, published, inputs }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const additionalUnits = inputs.get("additional_units") ?? 0;
  const additionalMarginPerUnit = inputs.get("additional_margin_per_unit") ?? 0;

  const resolved = useMemo(
    () => resolveValues(lines, rollup, baselines, published, additionalUnits, additionalMarginPerUnit),
    [lines, rollup, baselines, published, additionalUnits, additionalMarginPerUnit],
  );

  // Tells the user whether any published actuals exist for this slot.
  const isPublished = published.size > 0;

  function commitInput(scenarioKey: string, value: number | null) {
    setErr(null);
    start(async () => {
      const res = await setInputAction({ monthYyyymm: month, sheet, scenarioKey, value });
      if (!res.ok) setErr(res.error); else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {sheet !== "overheads" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Forecast scenario</h3>
              <p className="mt-1 text-sm text-slate-500">
                On top of dealbook units already in for this month, how many more do you expect — and at what chassis margin per unit?
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
                + £{(additionalUnits * additionalMarginPerUnit).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {sheet === "car" ? "Lease New Cars" : sheet === "cv" ? "Lease New Commercial" : "General Overheads"}
            </h3>
            {isPublished && (
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 ring-1 ring-emerald-200">
                Published actuals
              </span>
            )}
          </div>
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
                <th className="px-3 py-3 text-right font-medium">{isPublished ? "Actual" : "Forecast"}</th>
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
                const py = resolved.priorYear.get(l.key) ?? 0;
                const bud = resolved.budget.get(l.key) ?? 0;
                const db = resolved.dealbook.get(l.key);
                const fc = resolved.display.get(l.key) ?? 0;
                const vsB = fc - bud;
                const vsP = fc - py;
                const isTotal = l.kind === "total";
                const stripe = idx % 2 === 0 ? "" : "bg-slate-50/40";
                const totalClass = isTotal ? "bg-slate-50 font-semibold text-slate-900" : "";
                return (
                  <tr key={l.key} className={`border-t border-slate-100 ${stripe} ${totalClass}`}>
                    <td className="px-5 py-2 text-slate-800">{l.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatNumber(py, l.kind)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatNumber(bud, l.kind)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {db === undefined ? "—" : formatNumber(db, l.kind)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatNumber(fc, l.kind)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(vsB)}`}>
                      {formatNumber(vsB, l.kind === "unit" ? "unit" : "money")}
                    </td>
                    <td className={`px-5 py-2 text-right tabular-nums ${tone(vsP)}`}>
                      {formatNumber(vsP, l.kind === "unit" ? "unit" : "money")}
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

function resolveValues(
  lines: ForecastLine[],
  rollup: DealbookRollup,
  baselines: Map<string, number>,
  published: Map<string, number>,
  additionalUnits: number,
  additionalMarginPerUnit: number,
) {
  const priorYear = new Map<string, number>();
  const budget = new Map<string, number>();
  const dealbook = new Map<string, number>();
  const forecast = new Map<string, number>();
  const display = new Map<string, number>();
  const publishedMap = new Map<string, number>();

  // Pass 1: leaf values.
  for (const l of lines) {
    if (l.kind === "header") continue;
    if (l.dealbookKey) dealbook.set(l.key, rollup[l.dealbookKey] ?? 0);
    const py = baselines.get(`prior_year_${l.key}`);
    if (py !== undefined) priorYear.set(l.key, py);
    const bud = baselines.get(`budget_${l.key}`);
    if (bud !== undefined) budget.set(l.key, bud);
    const pub = published.get(`published_${l.key}`);
    if (pub !== undefined) publishedMap.set(l.key, pub);
  }

  // Apply scenario uplift to the chassis-margin lines so the forecast
  // reflects "I expect N more deals at £X chassis margin". For now the
  // uplift lands on Chassis GP of the relevant retail bucket; per-sheet
  // wiring can be refined when the math lands.
  const scenarioChassis = additionalUnits * additionalMarginPerUnit;
  const scenarioUnitsKey = lines.find((l) => l.kind === "unit" && l.dealbookKey === "units")?.key ?? null;
  const scenarioChassisKey = lines.find((l) => l.kind === "money" && l.dealbookKey === "chassisProfit")?.key ?? null;

  for (const l of lines) {
    if (l.kind === "header") continue;
    let f = dealbook.get(l.key) ?? 0;
    if (l.key === scenarioUnitsKey) f += additionalUnits;
    if (l.key === scenarioChassisKey) f += scenarioChassis;
    forecast.set(l.key, f);
  }

  // Pass 2: totals + per-unit, multiple sweeps to settle nested rollups.
  for (let pass = 0; pass < 3; pass++) {
    for (const l of lines) {
      if (l.kind === "total" && l.totalOf) {
        const sum = (m: Map<string, number>) => l.totalOf!.reduce((acc, k) => acc + (m.get(k) ?? 0), 0);
        priorYear.set(l.key, sum(priorYear));
        budget.set(l.key, sum(budget));
        forecast.set(l.key, sum(forecast));
      } else if (l.kind === "perUnit" && l.perUnitOf) {
        const calc = (m: Map<string, number>) => {
          const money = m.get(l.perUnitOf!.money);
          const units = m.get(l.perUnitOf!.units);
          return money !== undefined && units && units !== 0 ? money / units : 0;
        };
        priorYear.set(l.key, calc(priorYear));
        budget.set(l.key, calc(budget));
        forecast.set(l.key, calc(forecast));
      }
    }
  }

  // Build the display column: published wins, then forecast.
  for (const l of lines) {
    if (l.kind === "header") continue;
    display.set(l.key, publishedMap.has(l.key) ? publishedMap.get(l.key)! : forecast.get(l.key) ?? 0);
  }

  return { priorYear, budget, dealbook, forecast, display };
}
