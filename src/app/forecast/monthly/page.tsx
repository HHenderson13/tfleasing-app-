import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastUploads,
  listForecastLinesForMonth,
  loadForecastActuals,
  loadForecastInputs,
  loadForecastConfig,
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

  const [uploads, lines, actuals, inputs, config] = await Promise.all([
    listForecastUploads(),
    listForecastLinesForMonth(month),
    loadForecastActuals(month),
    loadForecastInputs(month),
    loadForecastConfig(),
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
          vehicleType: l.vehicleType,
          chassisProfit: l.chassisProfit,
          addBonus: l.addBonus,
          metalSubsidy: l.metalSubsidy,
          reconCost: l.reconCost,
          oallowDiscount: l.oallowDiscount,
          accessoryProfit: l.accessoryProfit,
          warrantyCost: l.warrantyCost,
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
          totalFiIncome: l.totalFiIncome,
          totalGrossProfit: l.totalGrossProfit,
        }))}
        actuals={actuals.map((a) => ({ sheet: a.sheet, lineKey: a.lineKey, value: a.value }))}
        inputs={inputs.map((i) => ({ sheet: i.sheet, scenarioKey: i.scenarioKey, value: i.value }))}
        config={config.map((c) => ({ key: c.key, value: c.value }))}
      />
    </div>
  );
}
