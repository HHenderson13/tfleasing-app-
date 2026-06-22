import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastLinesForMonth,
  listForecastLinesByRegDateRange,
  listForecastLinesForYear,
  listForecastUploads,
  loadForecastActuals,
  loadForecastConfig,
  loadForecastVehicles,
  loadVehicleBonuses,
  loadScenariosForMonth,
  loadFirstUploadForMonth,
  parseSettingsSnapshot,
} from "@/lib/forecast";
import { MonthlyClient } from "./monthly-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ month?: string; sheet?: string }>;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ForecastMonthlyPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonth();

  const [activeYear, activeMonthNum] = month.split("-").map((s) => parseInt(s, 10));
  const halfStart = activeMonthNum <= 6 ? 1 : 7;
  const halfEnd   = activeMonthNum <= 6 ? 6 : 12;
  const regStart  = `${activeYear}-${String(halfStart).padStart(2, "0")}`;
  const regEnd    = `${activeYear}-${String(halfEnd).padStart(2, "0")}`;

  // Previous quarter range — only used by CSPA. Skip the query unless
  // the active month is in {Jan, Apr, Jul, Oct} when CSPA is payable.
  const isCspaMonth = activeMonthNum === 1 || activeMonthNum === 4 || activeMonthNum === 7 || activeMonthNum === 10;
  let prevQStart: string | null = null;
  let prevQEnd:   string | null = null;
  if (isCspaMonth) {
    // The previous quarter contains (activeMonth - 1) months ago.
    const prevMonth = activeMonthNum === 1 ? 12 : activeMonthNum - 1;
    const prevYear = activeMonthNum === 1 ? activeYear - 1 : activeYear;
    const prevQuarterIdx = Math.floor((prevMonth - 1) / 3);    // 0..3
    const startM = prevQuarterIdx * 3 + 1;
    const endM   = startM + 2;
    prevQStart = `${prevYear}-${String(startM).padStart(2, "0")}`;
    prevQEnd   = `${prevYear}-${String(endM).padStart(2, "0")}`;
  }

  const [
    uploads, lines, actuals, firstUpload,
    liveConfig, liveVehicles, liveBonuses,
    regHalfLinesRaw, yearLinesRaw, scenarios, prevQuarterLinesRaw,
  ] = await Promise.all([
    listForecastUploads(),
    listForecastLinesForMonth(month),
    loadForecastActuals(month),
    loadFirstUploadForMonth(month),
    loadForecastConfig(),
    loadForecastVehicles(),
    loadVehicleBonuses(),
    listForecastLinesByRegDateRange(regStart, regEnd),
    listForecastLinesForYear(String(activeYear)),
    loadScenariosForMonth(month),
    prevQStart && prevQEnd
      ? listForecastLinesByRegDateRange(prevQStart, prevQEnd)
      : Promise.resolve([] as Awaited<ReturnType<typeof listForecastLinesByRegDateRange>>),
  ]);

  const snapshot = parseSettingsSnapshot(firstUpload?.settingsSnapshot ?? null);

  type ConfigOut = {
    key: string; value: number; description: string | null; category: string;
    applies: "per_unit" | "per_month" | "special"; appliesToLineKey: string | null;
  };
  const config: ConfigOut[] = snapshot
    ? snapshot.config.map((c) => ({
        key: c.key, value: c.value, description: c.description,
        category: c.category, applies: c.applies, appliesToLineKey: c.appliesToLineKey,
      }))
    : liveConfig.map((c) => ({
        key: c.key, value: c.value, description: c.description ?? null,
        category: c.category,
        applies: (c.applies === "per_unit" || c.applies === "per_month") ? c.applies : "special",
        appliesToLineKey: c.appliesToLineKey ?? null,
      }));

  const vehicles = snapshot
    ? snapshot.vehicles.map((v) => ({ id: v.id, name: v.name, kind: v.kind, fuelType: v.fuelType }))
    : liveVehicles.map((v) => ({ id: v.id, name: v.name, kind: v.kind, fuelType: v.fuelType }));

  const bonuses = snapshot
    ? snapshot.bonuses.map((b) => ({ vehicleId: b.vehicleId, bonusKey: b.bonusKey, value: b.value }))
    : liveBonuses.map((b) => ({ vehicleId: b.vehicleId, bonusKey: b.bonusKey, value: b.value }));

  // Live vehicle catalogue is used by the scenario builder so the user
  // always sees the current model list, not whatever was frozen.
  const liveCarVehicles = liveVehicles
    .filter((v) => v.kind === "car")
    .map((v) => ({ id: v.id, name: v.name, fuelType: v.fuelType }));
  const liveCvVehicles = liveVehicles
    .filter((v) => v.kind === "van")
    .map((v) => ({ id: v.id, name: v.name, fuelType: v.fuelType }));

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <MonthlyClient
        month={month}
        monthNumber={activeMonthNum}
        defaultSheet={sp.sheet === "cv" ? "cv" : "car"}
        uploadCount={uploads.length}
        lineCount={lines.length}
        snapshotSource={snapshot ? "frozen" : "live"}
        lines={lines.map((l) => ({
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
        }))}
        regHalfLines={regHalfLinesRaw.map((l) => ({
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
        }))}
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
        prevQuarterLines={prevQuarterLinesRaw.map((l) => ({
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
        }))}
        scenarios={scenarios.map((s) => ({
          id: s.id,
          vehicleId: s.vehicleId,
          chassisGpPerUnit: s.chassisGpPerUnit,
          units: s.units,
        }))}
        actuals={actuals.map((a) => ({ sheet: a.sheet, lineKey: a.lineKey, value: a.value }))}
        vehicles={vehicles}
        liveCarVehicles={liveCarVehicles}
        liveCvVehicles={liveCvVehicles}
        bonuses={bonuses}
        config={config}
      />
    </div>
  );
}
