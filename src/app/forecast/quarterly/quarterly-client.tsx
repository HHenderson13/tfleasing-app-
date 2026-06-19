"use client";
import { ForecastPageHeader, monthLabel } from "../page-shell";

// Quarterly view — mirrors `BPM Input Sheet.xlsx`. Three months across,
// PBT lines by department + Physicals + Bonus opportunity. Cells are
// placeholders until the per-month rollup math is wired (Admin tab is
// where the math gets configured).

const BPM_LINES = [
  { key: "total_dealership", label: "Total Dealership", isTotal: true },
  { key: "new_car_sales",    label: "New Car Sales" },
  { key: "used_car_sales",   label: "Used Car Sales" },
  { key: "business_centre",  label: "Business Centre" },
  { key: "new_cv",           label: "New CV" },
  { key: "used_cv",          label: "Used CV" },
  { key: "service",          label: "Service (w/o Mobile)" },
  { key: "msv",              label: "MSV" },
  { key: "bodyshop",         label: "Bodyshop (w/o Cosmetic)" },
  { key: "cosmetic",         label: "Cosmetic SMART" },
  { key: "rental",           label: "Rental" },
  { key: "parts",            label: "Parts" },
  { key: "graphics",         label: "Graphics" },
  { key: "overheads",        label: "Overheads" },
  { key: "interest",         label: "Interest" },
];

const PHYSICALS = [
  { key: "new_car_sales_units",  label: "New Car Sales Units" },
  { key: "used_car_sales_units", label: "Used Car Sales Units" },
  { key: "business_centre_units", label: "Business Centre Units" },
  { key: "new_cv_units",         label: "New CV Units" },
  { key: "used_cv_units",        label: "Used CV Units" },
  { key: "service_hours",        label: "Service Hours (w/o Mobile)" },
  { key: "msv_hours",            label: "MSV Hours" },
  { key: "bodyshop_hours",       label: "Bodyshop Hours" },
];

const BONUS_LINES = [
  { key: "bonus_total",        label: "Total Dealership", isTotal: true },
  { key: "bonus_pot_of_gold",  label: "Pot of Gold" },
  { key: "bonus_dpa_faststart", label: "DPA Fast Start" },
  { key: "bonus_dpa",          label: "DPA" },
  { key: "bonus_dpa_half",     label: "DPA ½ Year" },
  { key: "bonus_cv_dpa_fs",    label: "CV DPA Fast Start" },
  { key: "bonus_cv_dpa",       label: "CV DPA" },
  { key: "bonus_motab",        label: "Motab" },
  { key: "bonus_frpa_fs",      label: "FRPA Fast Start" },
  { key: "bonus_frpa",         label: "FRPA" },
  { key: "bonus_dcr",          label: "DCR" },
  { key: "bonus_pre_reg",      label: "Pre-Reg Income" },
  { key: "bonus_ucb_rebate",   label: "UCB Rebate UCS" },
];

function quarterOf(month: string): { quarter: number; year: number; months: string[] } {
  const [y, m] = month.split("-").map((s) => parseInt(s, 10));
  const q = Math.floor((m - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  return {
    quarter: q,
    year: y,
    months: [0, 1, 2].map((offset) => `${y}-${String(startMonth + offset).padStart(2, "0")}`),
  };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function QuarterlyClient({ month }: { month: string }) {
  const q = quarterOf(month);
  const quarterLabel = `Q${q.quarter} ${q.year}`;
  return (
    <>
      <ForecastPageHeader
        title="Quarterly Forecast"
        description={`${quarterLabel} BPM view — PBT, physicals and bonus opportunity rolled across the three months of the quarter.`}
        month={month}
      />
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <Section title={`${quarterLabel} — PBT by department`}>
          <DataTable
            headerColumns={[...q.months.map(monthHeader), "Q TOTAL"]}
            rows={BPM_LINES.map((l) => ({ key: l.key, label: l.label, isTotal: !!l.isTotal, values: [null, null, null, null] }))}
          />
        </Section>

        <Section title="Physicals">
          <DataTable
            headerColumns={[...q.months.map(monthHeader), "Q TOTAL"]}
            rows={PHYSICALS.map((l) => ({ key: l.key, label: l.label, isTotal: false, values: [null, null, null, null] }))}
          />
        </Section>

        <Section title={`${quarterLabel} Bonus opportunity`}>
          <DataTable
            headerColumns={["FORECAST", "BUDGET", "VARIANCE"]}
            rows={BONUS_LINES.map((l) => ({ key: l.key, label: l.label, isTotal: !!l.isTotal, values: [null, null, null] }))}
          />
        </Section>

        <p className="text-[11px] text-slate-400">
          Cells will populate once the math passes are wired in the Admin tab. The layout matches
          BPM Input Sheet.xlsx so you can copy across once values land.
        </p>
      </main>
    </>
  );
}

function monthHeader(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  return `${MONTH_SHORT[m - 1]}-${String(y).slice(-2)}`.toUpperCase();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

void monthLabel; // kept for future use when we add a YTD line

function DataTable({
  headerColumns, rows,
}: {
  headerColumns: string[];
  rows: { key: string; label: string; isTotal: boolean; values: (number | null)[] }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
        <tr>
          <th className="px-5 py-3 text-left font-medium">Line</th>
          {headerColumns.map((h) => (
            <th key={h} className="px-3 py-3 text-right font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr
            key={r.key}
            className={`border-t border-slate-100 ${idx % 2 === 0 ? "" : "bg-slate-50/40"} ${
              r.isTotal ? "bg-slate-50 font-semibold text-slate-900" : ""
            }`}
          >
            <td className="px-5 py-2 text-slate-800">{r.label}</td>
            {r.values.map((v, i) => (
              <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-400">
                {v === null ? "—" : v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
