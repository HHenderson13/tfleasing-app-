import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastUploads,
  listForecastLinesForMonth,
  loadForecastActuals,
  loadForecastInputs,
  loadForecastConfig,
} from "@/lib/forecast";
import { ForecastClient } from "./forecast-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ForecastPage({ searchParams }: PageProps) {
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

  // Distinct months represented across all dealbook lines + actuals — used
  // by the month picker. Always include the current month so the picker
  // isn't empty on a fresh install.
  const monthsSet = new Set<string>([currentMonth()]);
  for (const u of uploads) monthsSet.add(u.monthYyyymm);
  // Pull effective_months for previous uploads (separate cheap query would
  // be needed; for now we just include upload months and let the user
  // type/select).
  const months = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Forecast calculator</h1>
            <p className="mt-1 text-sm text-slate-500">
              Upload dealbook extracts, key in actuals, run forecasts for Lease Car, Lease CV and
              General Overheads. Quarter and YTD views feed BPM.
            </p>
          </div>
        </div>

        <ForecastClient
          month={month}
          months={months}
          uploads={uploads.map((u) => ({
            id: u.id,
            source: u.source,
            monthYyyymm: u.monthYyyymm,
            filename: u.filename,
            rowCount: u.rowCount,
            uploadedAt: u.uploadedAt.toISOString(),
          }))}
          lines={lines.map((l) => ({
            id: l.id,
            uploadId: l.uploadId,
            source: l.source,
            defaultMonth: l.defaultMonth,
            overrideMonth: l.overrideMonth,
            effectiveMonth: l.effectiveMonth,
            vehicleType: l.vehicleType,
            customerName: l.customerName,
            model: l.model,
            regDate: l.regDate,
            delivDate: l.delivDate,
            delivStatus: l.delivStatus,
            totalGrossProfit: l.totalGrossProfit,
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
            vin: l.vin,
            regNo: l.regNo,
          }))}
          actuals={actuals.map((a) => ({ sheet: a.sheet, lineKey: a.lineKey, value: a.value }))}
          inputs={inputs.map((i) => ({ sheet: i.sheet, scenarioKey: i.scenarioKey, value: i.value }))}
          config={config.map((c) => ({
            key: c.key,
            value: c.value,
            description: c.description ?? null,
            category: c.category,
          }))}
        />
      </main>
    </div>
  );
}
