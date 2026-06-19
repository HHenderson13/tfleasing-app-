"use client";
import { useMemo } from "react";
import { ForecastPageHeader } from "../page-shell";
import { QuarterPicker } from "../pickers";
import { getLinesForSheet, type SheetKey, type ForecastLine } from "../line-definitions";
import { rollupDealbookLines } from "../rollup";

interface DealbookLine {
  source: string;
  vehicleType: string | null;
  chassisProfit: number;
  addBonus: number;
  metalSubsidy: number;
  reconCost: number;
  oallowDiscount: number;
  accessoryProfit: number;
  warrantyCost: number;
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
  totalFiIncome: number;
  totalGrossProfit: number;
}

interface MonthData {
  month: string;
  lines: DealbookLine[];
  actuals: { sheet: string; lineKey: string; value: number }[];
  inputs: { sheet: string; scenarioKey: string; value: number }[];
}

interface Props {
  quarter: number;
  year: number;
  ytdMonths: string[];
  perMonth: MonthData[];
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthHeader(yyyymm: string): string {
  const [, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  return MONTH_SHORT[m - 1];
}

// Compute the "display value" (published actual or forecast) for a single
// sheet/month combination. This mirrors what the monthly view shows but
// scoped per-month so we can stack them quarterly + YTD.
function valuesForMonthSheet(sheet: SheetKey, data: MonthData): {
  net: number;        // Net profit
  units: number;      // Total units
} {
  const filtered = sheet === "car"
    ? data.lines.filter((l) => l.source === "lease_new_cars" || l.source === "salary_sacrifice")
    : sheet === "cv"
      ? data.lines.filter((l) => l.source === "lease_new_commercial")
      : [];
  const rollup = rollupDealbookLines(filtered, "all");

  const lines = getLinesForSheet(sheet);
  const actuals = new Map<string, number>();
  const published = new Map<string, number>();
  for (const a of data.actuals.filter((x) => x.sheet === sheet)) {
    if (a.lineKey.startsWith("published_")) published.set(a.lineKey, a.value);
    else actuals.set(a.lineKey, a.value);
  }
  const inputs = new Map<string, number>();
  for (const i of data.inputs.filter((x) => x.sheet === sheet)) inputs.set(i.scenarioKey, i.value);
  const additionalUnits = inputs.get("additional_units") ?? 0;
  const additionalMargin = inputs.get("additional_margin_per_unit") ?? 0;

  // Per-line forecast values, then derive Net profit + Units totals.
  const value = new Map<string, number>();
  const scenarioUnitsKey = lines.find((l) => l.kind === "unit" && l.dealbookKey === "units")?.key ?? null;
  const scenarioChassisKey = lines.find((l) => l.kind === "money" && l.dealbookKey === "chassisProfit")?.key ?? null;
  for (const l of lines) {
    if (l.kind === "header") continue;
    let v = 0;
    if (l.dealbookKey) v = rollup[l.dealbookKey] ?? 0;
    if (l.key === scenarioUnitsKey) v += additionalUnits;
    if (l.key === scenarioChassisKey) v += additionalUnits * additionalMargin;
    value.set(l.key, v);
  }
  // Settle totals / per-unit in a few sweeps.
  for (let pass = 0; pass < 3; pass++) {
    for (const l of lines) {
      if (l.kind === "total" && l.totalOf) {
        value.set(l.key, l.totalOf.reduce((acc: number, k: string) => acc + (value.get(k) ?? 0), 0));
      } else if (l.kind === "perUnit" && l.perUnitOf) {
        const m = value.get(l.perUnitOf.money);
        const u = value.get(l.perUnitOf.units);
        value.set(l.key, m !== undefined && u && u !== 0 ? m / u : 0);
      }
    }
  }
  // Published overrides per-line.
  for (const l of lines) {
    const pub = published.get(`published_${l.key}`);
    if (pub !== undefined) value.set(l.key, pub);
  }
  // Net profit + units rollup keys differ per sheet.
  const netKey = sheet === "car" ? "net_profit" : sheet === "cv" ? "cv_net_profit" : "oh_net_profit";
  const unitsKey = sheet === "car" ? "showroom_units" : sheet === "cv" ? "cv_units" : null;
  return {
    net: value.get(netKey) ?? 0,
    units: unitsKey ? (value.get(unitsKey) ?? 0) : 0,
  };
}

// Departmental PBT lines that match the BPM sheet rows we can compute
// from the three monthly sheets. The rest stay as "—" until those data
// sources are wired (Service, MSV, Bodyshop etc. don't live here yet).
const PBT_LINES: { key: string; label: string; sheet: SheetKey | "manual" }[] = [
  { key: "new_car",     label: "New Car Sales",   sheet: "car" },
  { key: "new_cv",      label: "New CV",          sheet: "cv" },
  { key: "overheads",   label: "Overheads",       sheet: "overheads" },
];

// Physicals rows we can derive from the sheets.
const PHYSICAL_LINES: { key: string; label: string; sheet: SheetKey }[] = [
  { key: "new_car_units", label: "New Car Sales Units", sheet: "car" },
  { key: "new_cv_units",  label: "New CV Units",        sheet: "cv" },
];

export function QuarterlyClient({ quarter, year, ytdMonths, perMonth }: Props) {
  const startMonthNum = (quarter - 1) * 3 + 1;
  const quarterMonths = [0, 1, 2].map((o) => `${year}-${String(startMonthNum + o).padStart(2, "0")}`);

  // Per-month, per-sheet rolled values.
  const computed = useMemo(() => {
    const m = new Map<string, Map<SheetKey, { net: number; units: number }>>();
    for (const md of perMonth) {
      const sheetMap = new Map<SheetKey, { net: number; units: number }>();
      sheetMap.set("car", valuesForMonthSheet("car", md));
      sheetMap.set("cv", valuesForMonthSheet("cv", md));
      sheetMap.set("overheads", valuesForMonthSheet("overheads", md));
      m.set(md.month, sheetMap);
    }
    return m;
  }, [perMonth]);

  const quarterLabel = `Q${quarter} ${year}`;

  return (
    <>
      <ForecastPageHeader
        title="Quarterly Forecast"
        description={`${quarterLabel} BPM rollup — three months across plus a year-to-date column. Published actuals overwrite their month's forecast automatically.`}
        picker={<QuarterPicker quarter={quarter} year={year} />}
      />

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <PbtSection
          title={`${quarterLabel} — PBT by department`}
          quarterMonths={quarterMonths}
          ytdMonths={ytdMonths}
          rows={PBT_LINES.map((l) => ({
            key: l.key,
            label: l.label,
            values: l.sheet === "manual" ? null : computed,
            sheet: l.sheet === "manual" ? null : (l.sheet as SheetKey),
            metric: "net" as const,
          }))}
        />

        <PbtSection
          title="Physicals"
          quarterMonths={quarterMonths}
          ytdMonths={ytdMonths}
          rows={PHYSICAL_LINES.map((l) => ({
            key: l.key,
            label: l.label,
            values: computed,
            sheet: l.sheet,
            metric: "units" as const,
          }))}
        />

        <BonusPlaceholder quarterLabel={quarterLabel} />

        <p className="text-[11px] text-slate-400">
          PBT and Physicals roll up live from monthly forecasts. Service / MSV / Bodyshop / Rental
          rows will populate when those data sources are added; bonus opportunity figures will plug
          in when the math passes are configured in Admin.
        </p>
      </main>
    </>
  );
}

interface RolledRow {
  key: string;
  label: string;
  values: Map<string, Map<SheetKey, { net: number; units: number }>> | null;
  sheet: SheetKey | null;
  metric: "net" | "units";
}

function PbtSection({
  title, quarterMonths, ytdMonths, rows,
}: {
  title: string;
  quarterMonths: string[];
  ytdMonths: string[];
  rows: RolledRow[];
}) {
  function valueFor(row: RolledRow, month: string): number | null {
    if (!row.values || !row.sheet) return null;
    const m = row.values.get(month);
    if (!m) return 0;
    return row.metric === "net" ? m.get(row.sheet)!.net : m.get(row.sheet)!.units;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Line</th>
              {quarterMonths.map((m) => (
                <th key={m} className="px-3 py-3 text-right font-medium">{monthHeader(m)}</th>
              ))}
              <th className="px-3 py-3 text-right font-medium">Q TOTAL</th>
              <th className="px-5 py-3 text-right font-medium">YTD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const monthValues = quarterMonths.map((m) => valueFor(r, m));
              const qTotal = monthValues.reduce<number | null>((acc, v) => v === null ? acc : (acc ?? 0) + v, null);
              const ytd = ytdMonths.reduce<number | null>((acc, m) => {
                const v = valueFor(r, m);
                return v === null ? acc : (acc ?? 0) + v;
              }, null);
              return (
                <tr key={r.key} className={`border-t border-slate-100 ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                  <td className="px-5 py-2 text-slate-800">{r.label}</td>
                  {monthValues.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {v === null ? "—" : format(v, r.metric)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                    {qTotal === null ? "—" : format(qTotal, r.metric)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums font-semibold text-slate-900">
                    {ytd === null ? "—" : format(ytd, r.metric)}
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

void getLinesForSheet; // ensure import is treeshake-safe
void ((_: ForecastLine) => undefined); // helps TS keep ForecastLine accessible

function format(v: number, metric: "net" | "units"): string {
  if (metric === "units") return Math.round(v).toString();
  if (Math.abs(v) < 0.005) return "0";
  return v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function BonusPlaceholder({ quarterLabel }: { quarterLabel: string }) {
  const lines = [
    "Total Dealership",
    "Pot of Gold",
    "DPA Fast Start",
    "DPA",
    "DPA ½ Year",
    "CV DPA Fast Start",
    "CV DPA",
    "Motab",
    "FRPA Fast Start",
    "FRPA",
    "DCR",
    "Pre-Reg Income",
    "UCB Rebate UCS",
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{quarterLabel} Bonus opportunity</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="px-5 py-3 text-left font-medium">Bonus</th>
            <th className="px-3 py-3 text-right font-medium">Forecast</th>
            <th className="px-3 py-3 text-right font-medium">Budget</th>
            <th className="px-5 py-3 text-right font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={l} className={`border-t border-slate-100 ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
              <td className="px-5 py-2 text-slate-800">{l}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-400">—</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-400">—</td>
              <td className="px-5 py-2 text-right tabular-nums text-slate-400">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
