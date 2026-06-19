import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastUploads,
  listForecastLinesForMonth,
  loadForecastActuals,
  loadForecastInputs,
  loadForecastConfig,
  loadForecastVehicles,
  loadVehicleBonuses,
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

  const [uploads, lines, actuals, inputs, config, vehicles, bonuses] = await Promise.all([
    listForecastUploads(),
    listForecastLinesForMonth(month),
    loadForecastActuals(month),
    loadForecastInputs(month),
    loadForecastConfig(),
    loadForecastVehicles(),
    loadVehicleBonuses(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <MonthlyClient
        month={month}
        defaultSheet={sp.sheet === "cv" || sp.sheet === "overheads" ? sp.sheet : "car"}
        uploadCount={uploads.length}
        lineCount={lines.length}
        lines={lines.map((l) => ({
          source: l.source,
          kind: l.kind,
          vehicleId: l.vehicleId ?? null,
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
          // Kept for the CV rollup until that math is rewritten.
          chassisProfit: l.chassisProfit,
          accessoryProfit: l.accessoryProfit,
          totalFiIncome: l.totalFiIncome,
          totalGrossProfit: l.totalGrossProfit,
        }))}
        actuals={actuals.map((a) => ({ sheet: a.sheet, lineKey: a.lineKey, value: a.value }))}
        inputs={inputs.map((i) => ({ sheet: i.sheet, scenarioKey: i.scenarioKey, value: i.value }))}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          name: v.name,
          kind: v.kind,
          fuelType: v.fuelType,
        }))}
        bonuses={bonuses.map((b) => ({ vehicleId: b.vehicleId, bonusKey: b.bonusKey, value: b.value }))}
        config={config.map((c) => ({ key: c.key, value: c.value }))}
      />
    </div>
  );
}
