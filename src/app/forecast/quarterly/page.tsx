import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastLinesForMonth,
  listForecastLinesByRegDateRange,
  listForecastLinesForYear,
  loadForecastActuals,
  loadForecastConfig,
  loadForecastVehicles,
  loadVehicleBonuses,
  loadScenariosForMonth,
  loadFirstUploadForMonth,
  parseSettingsSnapshot,
} from "@/lib/forecast";
import { QuarterlyClient } from "./quarterly-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ quarter?: string; year?: string; sheet?: string }>;
}

function currentQuarterYear(): { quarter: number; year: number } {
  const d = new Date();
  return { quarter: Math.floor(d.getMonth() / 3) + 1, year: d.getFullYear() };
}

export default async function ForecastQuarterlyPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const cqy = currentQuarterYear();
  const quarter = sp.quarter && /^[1-4]$/.test(sp.quarter) ? parseInt(sp.quarter, 10) : cqy.quarter;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? parseInt(sp.year, 10) : cqy.year;

  // The three months of the active quarter.
  const startMonth = (quarter - 1) * 3 + 1;
  const quarterMonths: string[] = [];
  for (let i = 0; i < 3; i++) {
    quarterMonths.push(`${year}-${String(startMonth + i).padStart(2, "0")}`);
  }

  // Half-year window for each month's DPA scope. All three months in a
  // quarter share the same half-year, so one query covers all.
  const halfStartM = startMonth <= 6 ? 1 : 7;
  const halfEndM   = startMonth <= 6 ? 6 : 12;
  const regStart = `${year}-${String(halfStartM).padStart(2, "0")}`;
  const regEnd   = `${year}-${String(halfEndM).padStart(2, "0")}`;

  // Previous quarter range (for CSPA on CV when the active month is in
  // Jan/Apr/Jul/Oct — one of the three quarter months might be a CSPA
  // trigger). We load it unconditionally for the quarter since the
  // first month of every quarter is a CSPA month.
  const prevQYear = quarter === 1 ? year - 1 : year;
  const prevQuarter = quarter === 1 ? 4 : quarter - 1;
  const prevQStartM = (prevQuarter - 1) * 3 + 1;
  const prevQEndM = prevQStartM + 2;
  const prevQStart = `${prevQYear}-${String(prevQStartM).padStart(2, "0")}`;
  const prevQEnd   = `${prevQYear}-${String(prevQEndM).padStart(2, "0")}`;

  // Per-month data — lines, actuals, scenarios, first upload.
  const perMonth = await Promise.all(quarterMonths.map(async (month) => {
    const [lines, actuals, scenarios, firstUpload] = await Promise.all([
      listForecastLinesForMonth(month),
      loadForecastActuals(month),
      loadScenariosForMonth(month),
      loadFirstUploadForMonth(month),
    ]);
    return { month, lines, actuals, scenarios, firstUpload };
  }));

  // Shared data — half-year reg scope, prev-quarter reg scope, year
  // lines for vehicle averages.
  const [
    regHalfLinesRaw, prevQuarterLinesRaw, yearLinesRaw,
    liveConfig, liveVehicles, liveBonuses,
  ] = await Promise.all([
    listForecastLinesByRegDateRange(regStart, regEnd),
    listForecastLinesByRegDateRange(prevQStart, prevQEnd),
    listForecastLinesForYear(String(year)),
    loadForecastConfig(),
    loadForecastVehicles(),
    loadVehicleBonuses(),
  ]);

  // Per-month snapshot resolution — fall back to live state when a
  // month hasn't been uploaded yet (e.g. forecasting Q3 in June).
  type Applies = "per_unit" | "per_month" | "special";
  const perMonthPayload = perMonth.map(({ month, lines, actuals, scenarios, firstUpload }) => {
    const snapshot = parseSettingsSnapshot(firstUpload?.settingsSnapshot ?? null);
    return {
      month,
      monthNumber: parseInt(month.slice(5, 7), 10),
      snapshotSource: snapshot ? "frozen" as const : "live" as const,
      lines: lines.map((l) => ({
        source: l.source,
        kind: l.kind,
        vehicleId: l.vehicleId ?? null,
        regDate: l.regDate ?? null,
        overrideMonth: l.overrideMonth ?? null,
        effectiveMonth: l.effectiveMonth,
        basic: l.basic ?? 0,
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
        chassisProfit: l.chassisProfit,
        accessoryProfit: l.accessoryProfit,
        totalFiIncome: l.totalFiIncome,
        totalGrossProfit: l.totalGrossProfit,
      })),
      actuals: actuals.map((a) => ({ sheet: a.sheet, lineKey: a.lineKey, value: a.value })),
      scenarios: scenarios.map((s) => ({
        id: s.id,
        vehicleId: s.vehicleId,
        chassisGpPerUnit: s.chassisGpPerUnit,
        units: s.units,
      })),
      // Each month carries its own snapshot of admin state so changes
      // post-upload don't retro-rewrite the quarter.
      config: snapshot
        ? snapshot.config.map((c) => ({
            key: c.key, value: c.value, description: c.description,
            category: c.category, applies: c.applies as Applies, appliesToLineKey: c.appliesToLineKey,
          }))
        : liveConfig.map((c) => {
            const applies: Applies = (c.applies === "per_unit" || c.applies === "per_month") ? c.applies : "special";
            return {
              key: c.key, value: c.value, description: c.description ?? null,
              category: c.category, applies, appliesToLineKey: c.appliesToLineKey ?? null,
            };
          }),
      vehicles: snapshot
        ? snapshot.vehicles.map((v) => ({ id: v.id, name: v.name, kind: v.kind, fuelType: v.fuelType }))
        : liveVehicles.map((v) => ({ id: v.id, name: v.name, kind: v.kind, fuelType: v.fuelType })),
      bonuses: snapshot
        ? snapshot.bonuses.map((b) => ({ vehicleId: b.vehicleId, bonusKey: b.bonusKey, value: b.value }))
        : liveBonuses.map((b) => ({ vehicleId: b.vehicleId, bonusKey: b.bonusKey, value: b.value })),
    };
  });

  const mapRegLines = (l: typeof regHalfLinesRaw[number]) => ({
    source: l.source,
    kind: l.kind,
    vehicleId: l.vehicle_id,
    regDate: l.reg_date,
    overrideMonth: l.override_month ?? null,
    effectiveMonth: l.effective_month,
    basic: l.basic ?? 0,
    reconCost: l.recon_cost,
    totalVehicleProfit: l.total_vehicle_profit,
    financeIncome: l.finance_income,
    financeMb: l.finance_mb,
    tyreInsIncome: l.tyre_ins_income,
    financeSubsidy: l.finance_subsidy,
    cpiIncome: l.cpi_income,
    smartRepair: l.smart_repair,
    gapRtiIncome: l.gap_rti_income,
    paintProtection: l.paint_protection,
    warranty: l.warranty,
    chassisProfit: l.chassis_profit,
    accessoryProfit: l.accessory_profit,
    totalFiIncome: l.total_fi_income,
    totalGrossProfit: l.total_gross_profit,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <QuarterlyClient
        quarter={quarter}
        year={year}
        defaultSheet={sp.sheet === "cv" ? "cv" : "car"}
        quarterMonths={quarterMonths}
        perMonth={perMonthPayload}
        regHalfLines={regHalfLinesRaw.map(mapRegLines)}
        prevQuarterLines={prevQuarterLinesRaw.map(mapRegLines)}
        yearLines={yearLinesRaw.map((l) => ({
          vehicleId: l.vehicle_id,
          kind: l.kind,
          source: l.source,
          effectiveMonth: l.effective_month,
          basic: l.basic ?? 0,
          financeIncome: l.finance_income,
          financeMb: l.finance_mb,
          tyreInsIncome: l.tyre_ins_income,
          financeSubsidy: l.finance_subsidy,
          cpiIncome: l.cpi_income,
          smartRepair: l.smart_repair,
          gapRtiIncome: l.gap_rti_income,
          paintProtection: l.paint_protection,
          warranty: l.warranty,
        }))}
      />
    </div>
  );
}
