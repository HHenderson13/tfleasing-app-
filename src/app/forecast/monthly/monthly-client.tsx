"use client";
import { useMemo, useState } from "react";
import { ForecastPageHeader } from "../page-shell";
import { MonthPicker, monthLabel } from "../pickers";
import { SheetView } from "./sheet-view";
import { getLinesForSheet, type SheetKey } from "../line-definitions";
import { rollupDealbookLines } from "../rollup";
import {
  computeCarMonthForecast,
  settleDerivedLines,
  type CostConfig,
  type DealbookCarLine,
  type VehicleInfo,
  type BonusLookup,
} from "./car-forecast";

interface DealbookLine {
  source: string;
  kind: string;
  vehicleId: string | null;
  basic: number;
  reconCost: number;
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
  // Used by the CV rollup until that math is rewritten.
  chassisProfit: number;
  accessoryProfit: number;
  totalFiIncome: number;
  totalGrossProfit: number;
}

interface VehiclePayload {
  id: string;
  name: string;
  kind: "car" | "van";
  fuelType: "ice" | "bev";
}

interface ConfigPayload {
  key: string;
  value: number;
  description: string | null;
  category: string;
  applies: "per_unit" | "per_month" | "special";
  appliesToLineKey: string | null;
}

interface Props {
  month: string;
  defaultSheet: SheetKey;
  uploadCount: number;
  lineCount: number;
  snapshotSource: "frozen" | "live";
  lines: DealbookLine[];
  actuals: { sheet: string; lineKey: string; value: number }[];
  inputs: { sheet: string; scenarioKey: string; value: number }[];
  vehicles: VehiclePayload[];
  bonuses: { vehicleId: string; bonusKey: string; value: number }[];
  config: ConfigPayload[];
}

const SHEET_TABS: { key: SheetKey; label: string; sub: string }[] = [
  { key: "car",       label: "Lease New Cars",       sub: "ICE + BEV mix" },
  { key: "cv",        label: "Lease New Commercial", sub: "Vans + light commercial" },
  { key: "overheads", label: "General Overheads",    sub: "Department-wide costs" },
];

export function MonthlyClient({
  month, defaultSheet, uploadCount, lineCount, snapshotSource,
  lines, actuals, inputs, vehicles, bonuses, config,
}: Props) {
  const [sheet, setSheet] = useState<SheetKey>(defaultSheet);

  // Lookup tables built once per render.
  const vehicleMap = useMemo(() => {
    const m = new Map<string, VehicleInfo>();
    for (const v of vehicles) m.set(v.id, { id: v.id, fuelType: v.fuelType });
    return m;
  }, [vehicles]);

  const bonusLookup = useMemo<BonusLookup>(() => {
    const m: BonusLookup = new Map();
    for (const b of bonuses) {
      if (!m.has(b.vehicleId)) m.set(b.vehicleId, new Map());
      m.get(b.vehicleId)!.set(b.bonusKey, b.value);
    }
    return m;
  }, [bonuses]);

  const configMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of config) m.set(c.key, c.value);
    return m;
  }, [config]);

  const costConfigs = useMemo<CostConfig[]>(() => config.map((c) => ({
    key: c.key, value: c.value, applies: c.applies, appliesToLineKey: c.appliesToLineKey,
  })), [config]);

  // Split admin actuals into baselines (budget_*) and published.
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

  // Compute the active sheet's forecast values. Car uses the new
  // per-vehicle-aware math; CV / Overheads fall back to the simple
  // dealbook-column rollup until those formulas land.
  const sheetForecast = useMemo(() => {
    const sheetInputs = inputsBySheet.get(sheet) ?? new Map();
    const extraUnits = sheetInputs.get("additional_units") ?? 0;
    const extraMargin = sheetInputs.get("additional_margin_per_unit") ?? 0;

    if (sheet === "car") {
      const carLines: DealbookCarLine[] = lines.map((l) => ({
        vehicleId: l.vehicleId,
        kind: l.kind,
        source: l.source,
        basic: l.basic,
        reconCost: l.reconCost,
        totalVehicleProfit: l.totalVehicleProfit,
        financeIncome: l.financeIncome,
        financeMb: l.financeMb,
        tyreInsIncome: l.tyreInsIncome,
        financeSubsidy: l.financeSubsidy,
        cpiIncome: l.cpiIncome,
        smartRepair: l.smartRepair,
        gapRtiIncome: l.gapRtiIncome,
        paintProtection: l.paintProtection,
        warranty: l.warranty,
      }));
      const result = computeCarMonthForecast({
        lines: carLines,
        vehicles: vehicleMap,
        bonuses: bonusLookup,
        config: configMap,
        costs: costConfigs,
        scenarioExtraUnits: extraUnits,
        scenarioMarginPerUnit: extraMargin,
      });
      // Settle derived rows (totals, per-unit) for the layout's totals.
      settleDerivedLines(getLinesForSheet("car"), result.values);
      return { values: result.values, unmatchedCount: result.unmatchedCount, iceUnits: result.iceUnits, bevUnits: result.bevUnits };
    }

    if (sheet === "cv") {
      const rollup = rollupDealbookLines(lines, "cv");
      const values = new Map<string, number>();
      values.set("cv_units", rollup.units + extraUnits);
      values.set("cv_chassis_gp", rollup.chassisProfit + extraUnits * extraMargin);
      values.set("cv_commission_vb", rollup.financeIncome);
      values.set("cv_alloy_tyre", rollup.tyreInsIncome);
      values.set("cv_gap", rollup.gapRtiIncome);
      values.set("cv_paint_fabric", rollup.paintProtection);
      values.set("cv_warranty", rollup.warranty);
      values.set("cv_accessory_gp", rollup.accessoryProfit);
      settleDerivedLines(getLinesForSheet("cv"), values);
      return { values, unmatchedCount: 0, iceUnits: 0, bevUnits: 0 };
    }

    // Overheads — entirely user-keyed; no dealbook contribution.
    const values = new Map<string, number>();
    settleDerivedLines(getLinesForSheet("overheads"), values);
    return { values, unmatchedCount: 0, iceUnits: 0, bevUnits: 0 };
  }, [sheet, lines, vehicleMap, bonusLookup, configMap, costConfigs, inputsBySheet]);

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

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>
            {uploadCount === 0
              ? "No uploads yet — head to Uploads to drop a dealbook CSV."
              : `${lineCount} dealbook line${lineCount === 1 ? "" : "s"} loaded for ${monthLabel(month)} across all departments.`}
          </span>
          {sheet === "car" && (sheetForecast.iceUnits > 0 || sheetForecast.bevUnits > 0) && (
            <span>· <span className="font-medium text-slate-700">{sheetForecast.iceUnits}</span> ICE
              {" · "}<span className="font-medium text-slate-700">{sheetForecast.bevUnits}</span> BEV
              {sheetForecast.unmatchedCount > 0 && <>
                {" · "}<span className="font-medium text-amber-700">{sheetForecast.unmatchedCount} unmatched</span>
              </>}
            </span>
          )}
          {snapshotSource === "frozen" ? (
            <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-800 ring-1 ring-indigo-200" title="Forecast uses the admin settings captured when this month was first uploaded. Editing Admin → Costs / Vehicles now won't change this month.">
              Frozen settings
            </span>
          ) : uploadCount > 0 ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 ring-1 ring-slate-200">
              Live settings
            </span>
          ) : null}
        </div>

        <div className="mt-6">
          <SheetView
            sheet={sheet}
            month={month}
            lines={getLinesForSheet(sheet)}
            forecastValues={sheetForecast.values}
            baselines={splitBySheet.baselines.get(sheet) ?? new Map()}
            published={splitBySheet.published.get(sheet) ?? new Map()}
            inputs={inputsBySheet.get(sheet) ?? new Map()}
          />
        </div>
      </main>
    </>
  );
}
