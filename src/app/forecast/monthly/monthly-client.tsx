"use client";
import { useMemo, useState } from "react";
import { ForecastPageHeader, monthLabel } from "../page-shell";
import { MonthPicker } from "../pickers";
import { SheetView } from "./sheet-view";
import { getLinesForSheet, type SheetKey } from "../line-definitions";
import { rollupDealbookLines } from "../rollup";
import type { DealbookRollup } from "../rollup";

interface DealbookLine {
  source: string;
  kind: string;
  chassisProfit: number;
  addBonus: number;
  metalSubsidy: number;
  reconCost: number;
  oallowDiscount: number;
  accessoryProfit: number;
  warrantyCost: number;
  totalVehicleProfit: number;
  financeIncome: number;
  financeMb: number;
  tyreInsIncome: number;
  financeSubsidy: number;
  cpiIncome: number;
  smartRepair: number;
  gapRtiIncome: number;
  paintProtection: number;
  warranty: number;
  totalFiIncome: number;
  totalGrossProfit: number;
}

interface Props {
  month: string;
  defaultSheet: SheetKey;
  uploadCount: number;
  lineCount: number;
  lines: DealbookLine[];
  actuals: { sheet: string; lineKey: string; value: number }[];
  inputs: { sheet: string; scenarioKey: string; value: number }[];
}

const SHEET_TABS: { key: SheetKey; label: string; sub: string }[] = [
  { key: "car",       label: "Lease New Cars",       sub: "Retail / Employee / Motability" },
  { key: "cv",        label: "Lease New Commercial", sub: "Vans + light commercial" },
  { key: "overheads", label: "General Overheads",    sub: "Department-wide costs" },
];

function rollupFor(sheet: SheetKey, lines: DealbookLine[]): DealbookRollup {
  // Car / CV split is now driven by per-line `kind` (set at upload time
  // by the vehicle classifier in src/lib/forecast-classify.ts), not by
  // the upload's source. Lines whose model couldn't be matched stay out
  // of both rollups so the user fixes the catalogue first.
  if (sheet === "car") return rollupDealbookLines(lines, "car");
  if (sheet === "cv")  return rollupDealbookLines(lines, "cv");
  return rollupDealbookLines([], "all");
}

export function MonthlyClient({
  month, defaultSheet, uploadCount, lineCount, lines, actuals, inputs,
}: Props) {
  const [sheet, setSheet] = useState<SheetKey>(defaultSheet);

  // Split admin-keyed actuals into baselines (prior year + budget) and
  // published actuals so the sheet view can prefer published over forecast
  // and show the right column header.
  const splitBySheet = useMemo(() => {
    const baselines = new Map<string, Map<string, number>>();
    const published = new Map<string, Map<string, number>>();
    for (const a of actuals) {
      const target = a.lineKey.startsWith("published_") ? published : baselines;
      if (!target.has(a.sheet)) target.set(a.sheet, new Map());
      target.get(a.sheet)!.set(a.lineKey, a.value);
    }
    return { baselines, published };
  }, [actuals]);

  const inputsBySheet = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const i of inputs) {
      if (!m.has(i.sheet)) m.set(i.sheet, new Map());
      m.get(i.sheet)!.set(i.scenarioKey, i.value);
    }
    return m;
  }, [inputs]);

  const rollup = useMemo(() => rollupFor(sheet, lines), [sheet, lines]);

  return (
    <>
      <ForecastPageHeader
        title="Monthly Forecast"
        description={`Lease New Cars, Lease New Commercial and General Overheads for ${monthLabel(month)}.`}
        picker={<MonthPicker value={month} />}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="grid gap-3 sm:grid-cols-3">
          {SHEET_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSheet(t.key)}
              className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition ${
                sheet === t.key
                  ? "border-slate-900 bg-slate-900 text-white shadow"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.16em] opacity-70">{t.sub}</div>
              <div className="mt-1 text-lg font-semibold">{t.label}</div>
            </button>
          ))}
        </section>

        <div className="mt-3 text-[11px] text-slate-500">
          {uploadCount === 0
            ? "No uploads yet — head to Uploads to drop a dealbook CSV."
            : `${lineCount} dealbook line${lineCount === 1 ? "" : "s"} loaded for ${monthLabel(month)} across all departments.`}
        </div>

        <div className="mt-6">
          <SheetView
            sheet={sheet}
            month={month}
            lines={getLinesForSheet(sheet)}
            rollup={rollup}
            baselines={splitBySheet.baselines.get(sheet) ?? new Map()}
            published={splitBySheet.published.get(sheet) ?? new Map()}
            inputs={inputsBySheet.get(sheet) ?? new Map()}
          />
        </div>
      </main>
    </>
  );
}
