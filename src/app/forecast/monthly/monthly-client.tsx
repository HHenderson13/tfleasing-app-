"use client";
import { useMemo, useState } from "react";
import { ForecastPageHeader } from "../page-shell";
import { MonthPicker, monthLabel } from "../pickers";
import { SheetView } from "./sheet-view";
import { ScenarioBuilder } from "./scenario-builder";
import { getLinesForSheet, type SheetKey } from "../line-definitions";
import { rollupDealbookLines } from "../rollup";
import {
  computeCarMonthForecast,
  settleDerivedLines,
  type CostConfig,
  type DealbookCarLine,
  type VehicleInfo,
  type BonusLookup,
  type ScenarioRow,
} from "./car-forecast";

interface DealbookLine {
  source: string;
  kind: string;
  vehicleId: string | null;
  regDate: string | null;
  overrideMonth: string | null;
  effectiveMonth: string;
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
  chassisProfit: number;
  accessoryProfit: number;
  totalFiIncome: number;
  totalGrossProfit: number;
}

interface YearLine {
  vehicleId: string | null;
  kind: string;
  source: string;
  effectiveMonth: string;
  basic: number;
  financeIncome: number;
  financeMb: number;
  tyreInsIncome: number;
  financeSubsidy: number;
  cpiIncome: number;
  smartRepair: number;
  gapRtiIncome: number;
  paintProtection: number;
  warranty: number;
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
  monthNumber: number;
  defaultSheet: SheetKey;
  uploadCount: number;
  lineCount: number;
  snapshotSource: "frozen" | "live";
  lines: DealbookLine[];
  regHalfLines: DealbookLine[];
  yearLines: YearLine[];
  scenarios: { id: string; vehicleId: string; chassisGpPerUnit: number; units: number }[];
  actuals: { sheet: string; lineKey: string; value: number }[];
  vehicles: VehiclePayload[];
  liveCarVehicles: { id: string; name: string; fuelType: "ice" | "bev" }[];
  bonuses: { vehicleId: string; bonusKey: string; value: number }[];
  config: ConfigPayload[];
}

const SHEET_TABS: { key: SheetKey; label: string; sub: string }[] = [
  { key: "car",       label: "Lease New Cars",       sub: "ICE + BEV mix" },
  { key: "cv",        label: "Lease New Commercial", sub: "Vans + light commercial" },
  { key: "overheads", label: "General Overheads",    sub: "Department-wide costs" },
];

// The year-line shape only contains what computeVehicleAverages needs,
// but the function signature wants a full DealbookCarLine. Fill the
// extras with neutral defaults.
function asDealbookLine(yl: YearLine): DealbookCarLine {
  return {
    vehicleId: yl.vehicleId,
    kind: yl.kind,
    source: yl.source,
    regDate: null,
    overrideMonth: null,
    effectiveMonth: yl.effectiveMonth,
    basic: yl.basic,
    reconCost: 0,
    totalVehicleProfit: 0,
    financeIncome: yl.financeIncome,
    financeMb: yl.financeMb,
    tyreInsIncome: yl.tyreInsIncome,
    financeSubsidy: yl.financeSubsidy,
    cpiIncome: yl.cpiIncome,
    smartRepair: yl.smartRepair,
    gapRtiIncome: yl.gapRtiIncome,
    paintProtection: yl.paintProtection,
    warranty: yl.warranty,
  };
}

export function MonthlyClient({
  month, monthNumber, defaultSheet, uploadCount, lineCount, snapshotSource,
  lines, regHalfLines, yearLines, scenarios,
  actuals, vehicles, liveCarVehicles, bonuses, config,
}: Props) {
  const [sheet, setSheet] = useState<SheetKey>(defaultSheet);

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

  const carScenarios: ScenarioRow[] = useMemo(() => scenarios.map((s) => ({
    id: s.id, vehicleId: s.vehicleId, chassisGpPerUnit: s.chassisGpPerUnit, units: s.units,
  })), [scenarios]);

  const sheetForecast = useMemo(() => {
    if (sheet === "car") {
      const toCar = (l: DealbookLine): DealbookCarLine => ({
        vehicleId: l.vehicleId, kind: l.kind, source: l.source,
        regDate: l.regDate, overrideMonth: l.overrideMonth, effectiveMonth: l.effectiveMonth,
        basic: l.basic, reconCost: l.reconCost, totalVehicleProfit: l.totalVehicleProfit,
        financeIncome: l.financeIncome, financeMb: l.financeMb, tyreInsIncome: l.tyreInsIncome,
        financeSubsidy: l.financeSubsidy, cpiIncome: l.cpiIncome, smartRepair: l.smartRepair,
        gapRtiIncome: l.gapRtiIncome, paintProtection: l.paintProtection, warranty: l.warranty,
      });
      const result = computeCarMonthForecast({
        lines: lines.map(toCar),
        regHalfLines: regHalfLines.map(toCar),
        yearLines: yearLines.map(asDealbookLine),
        scenarios: carScenarios,
        monthNumber,
        vehicles: vehicleMap,
        bonuses: bonusLookup,
        config: configMap,
        costs: costConfigs,
      });
      const carLineDefs = getLinesForSheet("car");
      settleDerivedLines(carLineDefs, result.dealbook);
      settleDerivedLines(carLineDefs, result.forecast);
      return {
        dealbook: result.dealbook,
        forecast: result.forecast,
        notes: result.notes,
        unmatchedCount: result.unmatchedCount,
        iceUnits: result.iceUnits,
        bevUnits: result.bevUnits,
        salSacUnits: result.salSacUnits,
        scenarioUnits: result.scenarioUnits,
        vehicleAverages: result.vehicleAverages,
      };
    }
    if (sheet === "cv") {
      const rollup = rollupDealbookLines(lines, "cv");
      const dealbookValues = new Map<string, number>();
      dealbookValues.set("cv_units", rollup.units);
      dealbookValues.set("cv_chassis_gp", rollup.chassisProfit);
      dealbookValues.set("cv_commission_vb", rollup.financeIncome);
      dealbookValues.set("cv_alloy_tyre", rollup.tyreInsIncome);
      dealbookValues.set("cv_gap", rollup.gapRtiIncome);
      dealbookValues.set("cv_paint_fabric", rollup.paintProtection);
      dealbookValues.set("cv_warranty", rollup.warranty);
      dealbookValues.set("cv_accessory_gp", rollup.accessoryProfit);
      const cvLineDefs = getLinesForSheet("cv");
      settleDerivedLines(cvLineDefs, dealbookValues);
      const forecastValues = new Map(dealbookValues);
      return {
        dealbook: dealbookValues, forecast: forecastValues, notes: new Map<string, string[]>(),
        unmatchedCount: 0, iceUnits: 0, bevUnits: 0, salSacUnits: 0, scenarioUnits: 0,
        vehicleAverages: new Map(),
      };
    }
    const dealbookValues = new Map<string, number>();
    settleDerivedLines(getLinesForSheet("overheads"), dealbookValues);
    return {
      dealbook: dealbookValues, forecast: new Map(dealbookValues), notes: new Map<string, string[]>(),
      unmatchedCount: 0, iceUnits: 0, bevUnits: 0, salSacUnits: 0, scenarioUnits: 0,
      vehicleAverages: new Map(),
    };
  }, [sheet, monthNumber, lines, regHalfLines, yearLines, carScenarios, vehicleMap, bonusLookup, configMap, costConfigs]);

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
          {sheet === "car" && (sheetForecast.iceUnits > 0 || sheetForecast.bevUnits > 0 || sheetForecast.salSacUnits > 0) && (
            <span>· <span className="font-medium text-slate-700">{sheetForecast.iceUnits}</span> ICE
              {" · "}<span className="font-medium text-slate-700">{sheetForecast.bevUnits}</span> BEV
              {sheetForecast.salSacUnits > 0 && <>
                {" · "}<span className="font-medium text-slate-700">{sheetForecast.salSacUnits}</span> SalSac
              </>}
              {sheetForecast.unmatchedCount > 0 && <>
                {" · "}<span className="font-medium text-amber-700">{sheetForecast.unmatchedCount} unmatched</span>
              </>}
            </span>
          )}
          {snapshotSource === "frozen" ? (
            <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-800 ring-1 ring-indigo-200" title="Forecast uses the admin settings captured when this month was first uploaded.">
              Frozen settings
            </span>
          ) : uploadCount > 0 ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 ring-1 ring-slate-200">
              Live settings
            </span>
          ) : null}
        </div>

        {sheet === "car" && (
          <div className="mt-6">
            <ScenarioBuilder
              month={month}
              scenarios={scenarios}
              vehicles={liveCarVehicles}
              averages={sheetForecast.vehicleAverages}
            />
          </div>
        )}

        <div className="mt-6">
          <SheetView
            sheet={sheet}
            lines={getLinesForSheet(sheet)}
            dealbookValues={sheetForecast.dealbook}
            forecastValues={sheetForecast.forecast}
            forecastNotes={sheetForecast.notes}
            baselines={splitBySheet.baselines.get(sheet) ?? new Map()}
            published={splitBySheet.published.get(sheet) ?? new Map()}
          />
        </div>
      </main>
    </>
  );
}
