"use client";
import { useMemo, useState } from "react";
import { ForecastPageHeader, monthLabel } from "../page-shell";
import { SheetView } from "./sheet-view";
import { getLinesForSheet, type SheetKey } from "../line-definitions";
import { rollupDealbookLines } from "../rollup";
import type { DealbookRollup } from "../rollup";

interface DealbookLine {
  source: string;
  vehicleType: string | null;
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
  config: { key: string; value: number }[];
}

const SHEET_TABS: { key: SheetKey; label: string; sub: string }[] = [
  { key: "car",       label: "Lease New Cars",       sub: "Retail / Employee / Motability" },
  { key: "cv",        label: "Lease New Commercial", sub: "Vans + light commercial" },
  { key: "overheads", label: "General Overheads",    sub: "Department-wide costs" },
];

// Map each department upload to the sheet it contributes to. We can wire
// SalSac elsewhere once we know where it lands; for now it joins Lease
// New Cars since most SalSac orders are passenger cars.
function rollupFor(sheet: SheetKey, lines: DealbookLine[]): DealbookRollup {
  if (sheet === "car") {
    const filtered = lines.filter((l) => l.source === "lease_new_cars" || l.source === "salary_sacrifice");
    return rollupDealbookLines(filtered, "all");
  }
  if (sheet === "cv") {
    const filtered = lines.filter((l) => l.source === "lease_new_commercial");
    return rollupDealbookLines(filtered, "all");
  }
  return rollupDealbookLines([], "all");
}

export function MonthlyClient({
  month, defaultSheet, uploadCount, lineCount, lines, actuals, inputs, config,
}: Props) {
  const [sheet, setSheet] = useState<SheetKey>(defaultSheet);

  const actualsBySheet = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const a of actuals) {
      if (!m.has(a.sheet)) m.set(a.sheet, new Map());
      m.get(a.sheet)!.set(a.lineKey, a.value);
    }
    return m;
  }, [actuals]);

  const inputsBySheet = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const i of inputs) {
      if (!m.has(i.sheet)) m.set(i.sheet, new Map());
      m.get(i.sheet)!.set(i.scenarioKey, i.value);
    }
    return m;
  }, [inputs]);

  const configByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of config) m.set(c.key, c.value);
    return m;
  }, [config]);

  const rollup = useMemo(() => rollupFor(sheet, lines), [sheet, lines]);

  return (
    <>
      <ForecastPageHeader
        title="Monthly Forecast"
        description={`Lease New Cars, Lease New Commercial and General Overheads for ${monthLabel(month)}.`}
        month={month}
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
            actuals={actualsBySheet.get(sheet) ?? new Map()}
            inputs={inputsBySheet.get(sheet) ?? new Map()}
            config={configByKey}
          />
        </div>
      </main>
    </>
  );
}
