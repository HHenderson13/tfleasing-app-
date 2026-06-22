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
import { monthsOfPeriod, type ForecastPeriod } from "../period";
import { QuarterlyClient } from "./quarterly-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ quarter?: string; period?: string; year?: string; sheet?: string }>;
}

function currentPeriod(): { period: ForecastPeriod; year: number } {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { period: `Q${q}` as ForecastPeriod, year: d.getFullYear() };
}

const VALID_PERIODS: ForecastPeriod[] = ["Q1", "Q2", "Q3", "Q4", "H1", "H2", "FY"];

function parsePeriod(raw: string | undefined, legacyQuarter: string | undefined): ForecastPeriod {
  if (raw && VALID_PERIODS.includes(raw as ForecastPeriod)) return raw as ForecastPeriod;
  // Legacy ?quarter=1 support.
  if (legacyQuarter && /^[1-4]$/.test(legacyQuarter)) return `Q${legacyQuarter}` as ForecastPeriod;
  return currentPeriod().period;
}

// For each active month, work out which quarter precedes it (used for
// CSPA on CV). Returns the YYYY-MM range covering that prior quarter.
function previousQuarterRange(monthNum: number, year: number): { start: string; end: string } | null {
  if (!(monthNum === 1 || monthNum === 4 || monthNum === 7 || monthNum === 10)) return null;
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1;
  const prevYear = monthNum === 1 ? year - 1 : year;
  const prevQ = Math.floor((prevMonth - 1) / 3);
  const startM = prevQ * 3 + 1;
  const endM = startM + 2;
  return {
    start: `${prevYear}-${String(startM).padStart(2, "0")}`,
    end:   `${prevYear}-${String(endM).padStart(2, "0")}`,
  };
}

export default async function ForecastQuarterlyPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const period = parsePeriod(sp.period, sp.quarter);
  const year = sp.year && /^\d{4}$/.test(sp.year) ? parseInt(sp.year, 10) : currentPeriod().year;

  const monthNums = monthsOfPeriod(period);
  const periodMonths = monthNums.map((m) => `${year}-${String(m).padStart(2, "0")}`);

  // Per-month payload — lines, actuals, scenarios, first-upload snapshot.
  const perMonthRaw = await Promise.all(periodMonths.map(async (month) => {
    const [lines, actuals, scenarios, firstUpload] = await Promise.all([
      listForecastLinesForMonth(month),
      loadForecastActuals(month),
      loadScenariosForMonth(month),
      loadFirstUploadForMonth(month),
    ]);
    return { month, lines, actuals, scenarios, firstUpload };
  }));

  // DPA reg-scope: load both halves once, then per-month we pick the
  // right slice. FY needs both; Q1/Q2/H1 needs H1; Q3/Q4/H2 needs H2.
  const needsH1 = monthNums.some((m) => m <= 6);
  const needsH2 = monthNums.some((m) => m >= 7);
  const [h1Lines, h2Lines, liveConfig, liveVehicles, liveBonuses, yearLinesRaw] = await Promise.all([
    needsH1 ? listForecastLinesByRegDateRange(`${year}-01`, `${year}-06`) : Promise.resolve([] as Awaited<ReturnType<typeof listForecastLinesByRegDateRange>>),
    needsH2 ? listForecastLinesByRegDateRange(`${year}-07`, `${year}-12`) : Promise.resolve([] as Awaited<ReturnType<typeof listForecastLinesByRegDateRange>>),
    loadForecastConfig(),
    loadForecastVehicles(),
    loadVehicleBonuses(),
    listForecastLinesForYear(String(year)),
  ]);

  // Per-CSPA-month previous quarter reg-scope.
  const prevQuarterByMonth: Record<string, Awaited<ReturnType<typeof listForecastLinesByRegDateRange>>> = {};
  await Promise.all(monthNums.map(async (m, idx) => {
    const range = previousQuarterRange(m, year);
    if (!range) return;
    prevQuarterByMonth[periodMonths[idx]] = await listForecastLinesByRegDateRange(range.start, range.end);
  }));

  type Applies = "per_unit" | "per_month" | "special";
  const perMonthPayload = perMonthRaw.map(({ month, lines, actuals, scenarios, firstUpload }) => {
    const snapshot = parseSettingsSnapshot(firstUpload?.settingsSnapshot ?? null);
    return {
      month,
      monthNumber: parseInt(month.slice(5, 7), 10),
      snapshotSource: (snapshot ? "frozen" : "live") as "frozen" | "live",
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

  const mapRegLines = (l: Awaited<ReturnType<typeof listForecastLinesByRegDateRange>>[number]) => ({
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
        period={period}
        year={year}
        defaultSheet={sp.sheet === "cv" ? "cv" : "car"}
        periodMonths={periodMonths}
        perMonth={perMonthPayload}
        h1RegLines={h1Lines.map(mapRegLines)}
        h2RegLines={h2Lines.map(mapRegLines)}
        prevQuarterByMonth={Object.fromEntries(
          Object.entries(prevQuarterByMonth).map(([k, v]) => [k, v.map(mapRegLines)]),
        )}
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
