"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInputAction } from "../actions";
import type { ForecastLine, SheetKey } from "../line-definitions";
import { settleDerivedLines } from "./car-forecast";

interface Props {
  sheet: SheetKey;
  month: string;
  lines: ForecastLine[];
  forecastValues: Map<string, number>;   // already computed by monthly-client
  forecastNotes: Map<string, string[]>;  // per-line notes for the right column
  baselines: Map<string, number>;        // budget_* values keyed in Admin
  published: Map<string, number>;        // published_* — overrides forecast when present
  inputs: Map<string, number>;           // scenario inputs (editable)
}

// Read-only display. Scenario card is the only editable surface here.
// All numeric leaf lines come pre-computed via the monthly-client →
// car-forecast pipeline; this component just lays them out + settles
// totals/per-unit derivations against the budget column so the same
// layout drives both the Budget and Forecast columns.

export function SheetView({ sheet, month, lines, forecastValues, forecastNotes, baselines, published, inputs }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const additionalUnits = inputs.get("additional_units") ?? 0;
  const additionalMarginPerUnit = inputs.get("additional_margin_per_unit") ?? 0;

  // Budget values — admin keys the leaf rows in Admin → Budget. We
  // settle totals so things like GP Before Variables show the right sum
  // even when only the leaves are keyed.
  const budgetValues = (() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (l.kind === "header" || l.kind === "total" || l.kind === "perUnit") continue;
      const v = baselines.get(`budget_${l.key}`);
      if (v !== undefined) m.set(l.key, v);
    }
    settleDerivedLines(lines, m);
    return m;
  })();

  // Display values: published wins, then forecast.
  const displayValues = (() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (l.kind === "header") continue;
      const pub = published.get(`published_${l.key}`);
      if (pub !== undefined) m.set(l.key, pub);
      else m.set(l.key, forecastValues.get(l.key) ?? 0);
    }
    return m;
  })();

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
                + £{Math.round(additionalUnits * additionalMarginPerUnit).toLocaleString("en-GB", { maximumFractionDigits: 0 })}
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
                <th className="px-3 py-3 text-right font-medium">Budget</th>
                <th className="px-3 py-3 text-right font-medium">Forecast</th>
                <th className="px-3 py-3 text-right font-medium">vs Budget</th>
                <th className="px-5 py-3 text-left font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                if (l.kind === "header") {
                  return (
                    <tr key={l.key} className="bg-gradient-to-r from-slate-100 to-transparent">
                      <td colSpan={5} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                        {l.label}
                      </td>
                    </tr>
                  );
                }
                const bud = budgetValues.get(l.key) ?? 0;
                const fc = displayValues.get(l.key) ?? 0;
                const vsB = fc - bud;
                const isTotal = l.kind === "total";
                const stripe = idx % 2 === 0 ? "" : "bg-slate-50/40";
                const totalClass = isTotal ? "bg-slate-50 font-semibold text-slate-900" : "";
                const lineNotes = forecastNotes.get(l.key) ?? [];
                return (
                  <tr key={l.key} className={`border-t border-slate-100 ${stripe} ${totalClass}`}>
                    <td className="px-5 py-2 text-slate-800">{l.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatNumber(bud, l.kind)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{formatNumber(fc, l.kind)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(vsB)}`}>
                      {formatNumber(vsB, l.kind === "unit" ? "unit" : "money")}
                    </td>
                    <td className="px-5 py-2 text-[11px] text-slate-500 align-top">
                      {lineNotes.length === 0 ? null : (
                        <ul className="space-y-0.5">
                          {lineNotes.map((n, i) => <li key={i}>{n}</li>)}
                        </ul>
                      )}
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
  if (kind === "pct") return `${Math.round(v)}%`;
  const rounded = Math.round(v);
  if (rounded === 0) return "£0";
  const abs = Math.abs(rounded).toLocaleString("en-GB", { maximumFractionDigits: 0 });
  return rounded < 0 ? `−£${abs}` : `£${abs}`;
}
