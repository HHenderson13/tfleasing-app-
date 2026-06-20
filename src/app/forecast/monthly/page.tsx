import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastLinesForMonth,
  listForecastLinesByRegDateRange,
  listForecastUploads,
  loadForecastActuals,
  loadForecastConfig,
  loadForecastInputs,
  loadForecastVehicles,
  loadVehicleBonuses,
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

  // DPA + Pot of Gold are based on reg-date, scoped to the half-year
  // window that the active month falls in. We always load the half-year
  // so the quarter / half-year roll-ups can compute even when the user
  // hasn't allocated every reg into the right effective month.
  const [activeYear, activeMonthNum] = month.split("-").map((s) => parseInt(s, 10));
  const halfStart = activeMonthNum <= 6 ? 1 : 7;
  const halfEnd   = activeMonthNum <= 6 ? 6 : 12;
  const regStart  = `${activeYear}-${String(halfStart).padStart(2, "0")}`;
  const regEnd    = `${activeYear}-${String(halfEnd).padStart(2, "0")}`;

  const [uploads, lines, actuals, inputs, firstUpload, liveConfig, liveVehicles, liveBonuses, regHalfLinesRaw] = await Promise.all([
    listForecastUploads(),
    listForecastLinesForMonth(month),
    loadForecastActuals(month),
    loadForecastInputs(month),
    loadFirstUploadForMonth(month),
    loadForecastConfig(),
    loadForecastVehicles(),
    loadVehicleBonuses(),
    listForecastLinesByRegDateRange(regStart, regEnd),
  ]);

  // Snapshot if this month has been uploaded — that's the frozen state.
  // Without a snapshot we fall back to the live admin state.
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

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <MonthlyClient
        month={month}
        defaultSheet={sp.sheet === "cv" || sp.sheet === "overheads" ? sp.sheet : "car"}
        uploadCount={uploads.length}
        lineCount={lines.length}
        snapshotSource={snapshot ? "frozen" : "live"}
        monthNumber={activeMonthNum}
        lines={lines.map((l) => ({
          source: l.source,
          kind: l.kind,
          vehicleId: l.vehicleId ?? null,
          regDate: l.regDate ?? null,
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
        regHalfLines={regHalfLinesRaw.map((l) => ({
          source: l.source,
          kind: l.kind,
          vehicleId: l.vehicle_id,
          regDate: l.reg_date,
          basic: l.basic ?? 0,
          // The DPA computation only needs basic + reg-date + vehicle.
          // Fill out the rest so it satisfies the DealbookCarLine shape.
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
        actuals={actuals.map((a) => ({ sheet: a.sheet, lineKey: a.lineKey, value: a.value }))}
        inputs={inputs.map((i) => ({ sheet: i.sheet, scenarioKey: i.scenarioKey, value: i.value }))}
        vehicles={vehicles}
        bonuses={bonuses}
        config={config}
      />
    </div>
  );
}
