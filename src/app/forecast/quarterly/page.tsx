import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastLinesForMonth,
  loadForecastActuals,
  loadForecastInputs,
} from "@/lib/forecast";
import { QuarterlyClient } from "./quarterly-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ quarter?: string; year?: string }>;
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

  // YTD = Jan up to and including the last month of the active quarter.
  // For Q2 of 2026 that's Jan/Feb/Mar/Apr/May/Jun. Load each month so we
  // can roll dealbook + actuals + inputs across them.
  const startMonthNum = (quarter - 1) * 3 + 1;
  const lastMonthNum = startMonthNum + 2;
  const ytdMonths: string[] = [];
  for (let m = 1; m <= lastMonthNum; m++) {
    ytdMonths.push(`${year}-${String(m).padStart(2, "0")}`);
  }

  const perMonth = await Promise.all(
    ytdMonths.map(async (m) => {
      const [lines, actuals, inputs] = await Promise.all([
        listForecastLinesForMonth(m),
        loadForecastActuals(m),
        loadForecastInputs(m),
      ]);
      return {
        month: m,
        lines: lines.map((l) => ({
          source: l.source,
          kind: l.kind,
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
        })),
        actuals: actuals.map((a) => ({ sheet: a.sheet, lineKey: a.lineKey, value: a.value })),
        inputs: inputs.map((i) => ({ sheet: i.sheet, scenarioKey: i.scenarioKey, value: i.value })),
      };
    }),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <QuarterlyClient
        quarter={quarter}
        year={year}
        ytdMonths={ytdMonths}
        perMonth={perMonth}
      />
    </div>
  );
}
