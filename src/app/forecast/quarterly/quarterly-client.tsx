"use client";
import { useMemo, useState } from "react";
import { ForecastPageHeader } from "../page-shell";
import { PeriodPicker, type ForecastPeriod } from "../pickers";
import {
  computeCarMonthForecast,
  settleDerivedLines,
  type CostConfig,
  type DealbookCarLine,
  type VehicleInfo,
  type BonusLookup,
  type ScenarioRow,
} from "../monthly/car-forecast";
import { computeCvMonthForecast } from "../monthly/cv-forecast";
import { getLinesForSheet, type ForecastLine, type SheetKey } from "../line-definitions";

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

interface MonthPayload {
  month: string;
  monthNumber: number;
  snapshotSource: "frozen" | "live";
  lines: DealbookLine[];
  actuals: { sheet: string; lineKey: string; value: number }[];
  scenarios: { id: string; vehicleId: string; chassisGpPerUnit: number; units: number }[];
  config: { key: string; value: number; description: string | null; category: string;
    applies: "per_unit" | "per_month" | "special"; appliesToLineKey: string | null }[];
  vehicles: { id: string; name: string; kind: "car" | "van"; fuelType: "ice" | "bev" }[];
  bonuses: { vehicleId: string; bonusKey: string; value: number }[];
}

interface Props {
  period: ForecastPeriod;
  year: number;
  defaultSheet: "car" | "cv";
  periodMonths: string[];
  perMonth: MonthPayload[];
  h1RegLines: DealbookLine[];
  h2RegLines: DealbookLine[];
  prevQuarterByMonth: Record<string, DealbookLine[]>;
  yearLines: YearLine[];
}

const SHEET_TABS: { key: SheetKey; label: string; sub: string }[] = [
  { key: "car", label: "Lease New Cars",       sub: "ICE + BEV mix" },
  { key: "cv",  label: "Lease New Commercial", sub: "Vans + light commercial" },
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toCarLine(l: DealbookLine): DealbookCarLine {
  return {
    vehicleId: l.vehicleId, kind: l.kind, source: l.source,
    regDate: l.regDate, overrideMonth: l.overrideMonth, effectiveMonth: l.effectiveMonth,
    basic: l.basic, reconCost: l.reconCost, totalVehicleProfit: l.totalVehicleProfit,
    financeIncome: l.financeIncome, financeMb: l.financeMb, tyreInsIncome: l.tyreInsIncome,
    financeSubsidy: l.financeSubsidy, cpiIncome: l.cpiIncome, smartRepair: l.smartRepair,
    gapRtiIncome: l.gapRtiIncome, paintProtection: l.paintProtection, warranty: l.warranty,
  };
}

function asDealbookFromYearLine(yl: YearLine): DealbookCarLine {
  return {
    vehicleId: yl.vehicleId, kind: yl.kind, source: yl.source,
    regDate: null, overrideMonth: null, effectiveMonth: yl.effectiveMonth,
    basic: yl.basic, reconCost: 0, totalVehicleProfit: 0,
    financeIncome: yl.financeIncome, financeMb: yl.financeMb,
    tyreInsIncome: yl.tyreInsIncome, financeSubsidy: yl.financeSubsidy,
    cpiIncome: yl.cpiIncome, smartRepair: yl.smartRepair,
    gapRtiIncome: yl.gapRtiIncome, paintProtection: yl.paintProtection,
    warranty: yl.warranty,
  };
}

interface ComputedMonth {
  month: string;
  monthLabel: string;
  forecast: Map<string, number>;
  budget: Map<string, number>;
}

const PERIOD_LABEL: Record<ForecastPeriod, string> = {
  Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4", H1: "H1", H2: "H2", FY: "FY",
};

export function QuarterlyClient({
  period, year, defaultSheet, periodMonths, perMonth,
  h1RegLines, h2RegLines, prevQuarterByMonth, yearLines,
}: Props) {
  const [sheet, setSheet] = useState<"car" | "cv">(defaultSheet);
  const lineDefs = useMemo(() => getLinesForSheet(sheet), [sheet]);

  const computed = useMemo<ComputedMonth[]>(() => perMonth.map((p) => {
    const vehicleMap = new Map<string, VehicleInfo>();
    for (const v of p.vehicles) vehicleMap.set(v.id, { id: v.id, fuelType: v.fuelType });
    const bonusLookup: BonusLookup = new Map();
    for (const b of p.bonuses) {
      if (!bonusLookup.has(b.vehicleId)) bonusLookup.set(b.vehicleId, new Map());
      bonusLookup.get(b.vehicleId)!.set(b.bonusKey, b.value);
    }
    const configMap = new Map<string, number>();
    for (const c of p.config) configMap.set(c.key, c.value);
    const costConfigs: CostConfig[] = p.config.map((c) => ({
      key: c.key, value: c.value, applies: c.applies, appliesToLineKey: c.appliesToLineKey,
    }));

    const vehicleKindById = new Map(p.vehicles.map((v) => [v.id, v.kind]));
    const carScenarios: ScenarioRow[] = p.scenarios
      .filter((s) => vehicleKindById.get(s.vehicleId) === "car")
      .map((s) => ({ id: s.id, vehicleId: s.vehicleId, chassisGpPerUnit: s.chassisGpPerUnit, units: s.units }));
    const cvScenarios: ScenarioRow[] = p.scenarios
      .filter((s) => vehicleKindById.get(s.vehicleId) === "van")
      .map((s) => ({ id: s.id, vehicleId: s.vehicleId, chassisGpPerUnit: s.chassisGpPerUnit, units: s.units }));

    // Reg-scope for DPA: pick the half this month sits in.
    const regHalfLines = p.monthNumber <= 6 ? h1RegLines : h2RegLines;
    const prevQ = prevQuarterByMonth[p.month] ?? [];

    let forecast: Map<string, number>;
    if (sheet === "car") {
      const result = computeCarMonthForecast({
        lines: p.lines.map(toCarLine),
        regHalfLines: regHalfLines.map(toCarLine),
        yearLines: yearLines.map(asDealbookFromYearLine),
        scenarios: carScenarios,
        monthNumber: p.monthNumber,
        vehicles: vehicleMap,
        bonuses: bonusLookup,
        config: configMap,
        costs: costConfigs,
      });
      forecast = result.forecast;
    } else {
      const result = computeCvMonthForecast({
        lines: p.lines.map(toCarLine),
        regHalfLines: regHalfLines.map(toCarLine),
        prevQuarterLines: prevQ.map(toCarLine),
        yearLines: yearLines.map(asDealbookFromYearLine),
        scenarios: cvScenarios,
        monthNumber: p.monthNumber,
        vehicles: vehicleMap,
        bonuses: bonusLookup,
        config: configMap,
        costs: costConfigs,
      });
      forecast = result.forecast;
    }
    settleDerivedLines(lineDefs, forecast);

    const budget = new Map<string, number>();
    for (const a of p.actuals) {
      if (a.sheet !== sheet) continue;
      if (a.lineKey.startsWith("budget_")) budget.set(a.lineKey.replace(/^budget_/, ""), a.value);
    }
    settleDerivedLines(lineDefs, budget);

    return { month: p.month, monthLabel: MONTH_SHORT[p.monthNumber - 1], forecast, budget };
  }), [perMonth, sheet, h1RegLines, h2RegLines, prevQuarterByMonth, yearLines, lineDefs]);

  const periodLabel = `${PERIOD_LABEL[period]} ${year}`;
  const anySnapshotFrozen = perMonth.some((p) => p.snapshotSource === "frozen");

  return (
    <>
      <ForecastPageHeader
        title="Quarterly Forecast"
        description={`${periodLabel} roll-up — each line's Forecast and Budget across the months in the period, plus the totals.`}
        picker={<PeriodPicker period={period} year={year} />}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="grid gap-3 sm:grid-cols-2">
          {SHEET_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSheet(t.key === "cv" ? "cv" : "car")}
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

        <div className="mt-3 text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
          <span>{periodLabel} · {periodMonths.length} month{periodMonths.length === 1 ? "" : "s"} loaded</span>
          {anySnapshotFrozen && (
            <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-800 ring-1 ring-indigo-200">
              Frozen settings on uploaded months
            </span>
          )}
        </div>

        <div className="mt-6">
          <PeriodSheet lines={lineDefs} months={computed} periodLabel={periodLabel} />
        </div>
      </main>
    </>
  );
}

function PeriodSheet({
  lines, months, periodLabel,
}: {
  lines: ForecastLine[];
  months: ComputedMonth[];
  periodLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Line</th>
              {months.map((m) => (
                <th key={m.month} className="px-3 py-3 text-right font-medium">{m.monthLabel}</th>
              ))}
              <th className="px-3 py-3 text-right font-medium">{periodLabel} TOTAL</th>
              <th className="px-3 py-3 text-right font-medium">{periodLabel} BUDGET</th>
              <th className="px-5 py-3 text-right font-medium">vs BUDGET</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              if (l.kind === "header") {
                return (
                  <tr key={l.key} className="bg-gradient-to-r from-slate-100 to-transparent">
                    <td colSpan={4 + months.length} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                      {l.label}
                    </td>
                  </tr>
                );
              }
              const monthForecasts = months.map((m) => m.forecast.get(l.key) ?? 0);
              const monthBudgets = months.map((m) => m.budget.get(l.key) ?? 0);
              const isPerUnit = l.kind === "perUnit" || l.kind === "pct";
              const pTotal = isPerUnit
                ? (monthForecasts[monthForecasts.length - 1] ?? 0)
                : monthForecasts.reduce((a, v) => a + v, 0);
              const pBudget = isPerUnit
                ? (monthBudgets[monthBudgets.length - 1] ?? 0)
                : monthBudgets.reduce((a, v) => a + v, 0);
              const vsBudget = pTotal - pBudget;
              const isTotal = l.kind === "total";
              const stripe = idx % 2 === 0 ? "" : "bg-slate-50/40";
              const totalClass = isTotal ? "bg-slate-50 font-semibold text-slate-900" : "";
              return (
                <tr key={l.key} className={`border-t border-slate-100 ${stripe} ${totalClass}`}>
                  <td className="px-5 py-2 text-slate-800">{l.label}</td>
                  {monthForecasts.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatNumber(v, l.kind)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                    {formatNumber(pTotal, l.kind)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {formatNumber(pBudget, l.kind)}
                  </td>
                  <td className={`px-5 py-2 text-right tabular-nums ${tone(vsBudget)}`}>
                    {formatNumber(vsBudget, l.kind === "unit" ? "unit" : "money")}
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
