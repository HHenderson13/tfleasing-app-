"use client";
import type { ForecastLine, SheetKey } from "../line-definitions";
import { settleDerivedLines } from "./car-forecast";

interface Props {
  sheet: SheetKey;
  lines: ForecastLine[];
  dealbookValues: Map<string, number>;   // dealbook-only column
  forecastValues: Map<string, number>;   // dealbook + scenarios
  forecastNotes: Map<string, string[]>;
  baselines: Map<string, number>;        // budget_*
  published: Map<string, number>;        // published_* — overrides forecast when present
}

// Four numeric columns: Budget · Dealbook · Forecast · vs Budget.
// Published actuals (if keyed in Admin) override the Forecast column
// for that line — same behaviour as before.

export function SheetView({ sheet, lines, dealbookValues, forecastValues, forecastNotes, baselines, published }: Props) {
  const isPublished = published.size > 0;

  // Budget — settle derived rows on top of the budget leaves keyed in
  // Admin so GP Before Variables / Gross Profit / Net Profit add up
  // even when only leaf rows have data.
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

  // Display Forecast column: published wins if present.
  const displayValues = (() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (l.kind === "header") continue;
      const pub = published.get(`published_${l.key}`);
      m.set(l.key, pub !== undefined ? pub : (forecastValues.get(l.key) ?? 0));
    }
    return m;
  })();

  return (
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Line</th>
              <th className="px-3 py-3 text-right font-medium">Budget</th>
              <th className="px-3 py-3 text-right font-medium">Dealbook</th>
              <th className="px-3 py-3 text-right font-medium">{isPublished ? "Actual" : "Forecast"}</th>
              <th className="px-3 py-3 text-right font-medium">Forecast vs Budget</th>
              <th className="px-5 py-3 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              if (l.kind === "header") {
                return (
                  <tr key={l.key} className="bg-gradient-to-r from-slate-100 to-transparent">
                    <td colSpan={6} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                      {l.label}
                    </td>
                  </tr>
                );
              }
              const bud = budgetValues.get(l.key) ?? 0;
              const db = dealbookValues.get(l.key) ?? 0;
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
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatNumber(db, l.kind)}</td>
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
