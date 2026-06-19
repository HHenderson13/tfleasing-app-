"use client";
// BPM = Business Performance Monitor. Quarterly + YTD summary that mirrors
// the columns in BPM Input Sheet.xlsx (Apr / May / Jun across, then Q2
// total and Q1 actual).
//
// First-cut: a placeholder layout that the user can react to. The actual
// per-month + per-line rollup pulls from the three sheet tabs' actuals;
// we'll wire that in once the per-sheet line mapping is settled.

const BPM_LINES = [
  { key: "total_dealership", label: "Total Dealership" },
  { key: "new_car_sales", label: "New Car Sales" },
  { key: "used_car_sales", label: "Used Car Sales" },
  { key: "business_centre", label: "Business Centre" },
  { key: "new_cv", label: "New CV" },
  { key: "used_cv", label: "Used CV" },
  { key: "service", label: "Service (w/o Mobile)" },
  { key: "msv", label: "MSV" },
  { key: "bodyshop", label: "Bodyshop (w/o Cosmetic)" },
  { key: "cosmetic", label: "Cosmetic SMART" },
  { key: "rental", label: "Rental" },
  { key: "parts", label: "Parts" },
  { key: "graphics", label: "Graphics" },
  { key: "overheads", label: "Overheads" },
  { key: "interest", label: "Interest" },
];

const PHYSICALS = [
  { key: "new_car_sales_units", label: "New Car Sales Units" },
  { key: "used_car_sales_units", label: "Used Car Sales Units" },
  { key: "business_centre_units", label: "Business Centre Units" },
  { key: "new_cv_units", label: "New CV Units" },
  { key: "used_cv_units", label: "Used CV Units" },
  { key: "service_hours", label: "Service Hours (w/o Mobile)" },
  { key: "msv_hours", label: "MSV Hours" },
  { key: "bodyshop_hours", label: "Bodyshop Hours" },
];

const BONUS_LINES = [
  { key: "bonus_total", label: "Total Dealership" },
  { key: "bonus_pot_of_gold", label: "Pot of Gold" },
  { key: "bonus_dpa_faststart", label: "DPA Fast Start" },
  { key: "bonus_dpa", label: "DPA" },
  { key: "bonus_dpa_half_year", label: "DPA ½ Year" },
  { key: "bonus_cv_dpa_faststart", label: "CV DPA Fast Start" },
  { key: "bonus_cv_dpa", label: "CV DPA" },
  { key: "bonus_motab", label: "Motab" },
  { key: "bonus_frpa_faststart", label: "FRPA Fast Start" },
  { key: "bonus_frpa", label: "FRPA" },
  { key: "bonus_dcr", label: "DCR" },
  { key: "bonus_pre_reg_income", label: "Pre Reg Income" },
  { key: "bonus_ucb_rebate", label: "UCB Rebate UCS" },
];

function quarterOf(month: string): { startMonth: number; quarterLabel: string; months: string[] } {
  const [y, m] = month.split("-").map((s) => parseInt(s, 10));
  const q = Math.floor((m - 1) / 3) + 1;
  const startMonthNum = (q - 1) * 3 + 1;
  const months = [0, 1, 2].map((offset) => {
    const mm = startMonthNum + offset;
    return `${y}-${String(mm).padStart(2, "0")}`;
  });
  return { startMonth: startMonthNum, quarterLabel: `Q${q} ${y}`, months };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  return `${MONTH_SHORT[m - 1]}-${String(y).slice(-2)}`;
}

export function BpmTab({ month }: { month: string }) {
  const q = quarterOf(month);
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{q.quarterLabel} — month by month</h3>
        <p className="mt-1 text-xs text-slate-500">
          PBT lines across the three months of the active quarter. Numbers are sourced from each
          month's actuals on the Car / CV / Overheads sheets (and the dealbook rollup when no
          actual has been keyed yet). Math passes are still being mapped — treat this as a
          structural preview.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-2 py-2 w-1/4">PBT line</th>
                {q.months.map((mm) => (
                  <th key={mm} className="px-2 py-2 text-right">{monthLabel(mm)}</th>
                ))}
                <th className="px-2 py-2 text-right">Q total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BPM_LINES.map((l) => (
                <tr key={l.key} className="hover:bg-slate-50">
                  <td className="px-2 py-1.5 text-slate-800">{l.label}</td>
                  {q.months.map((mm) => (
                    <td key={mm} className="px-2 py-1.5 text-right tabular-nums text-slate-400">—</td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-500">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Physicals</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-2 py-2 w-1/4">Metric</th>
                {q.months.map((mm) => (
                  <th key={mm} className="px-2 py-2 text-right">{monthLabel(mm)}</th>
                ))}
                <th className="px-2 py-2 text-right">Q total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PHYSICALS.map((l) => (
                <tr key={l.key} className="hover:bg-slate-50">
                  <td className="px-2 py-1.5 text-slate-800">{l.label}</td>
                  {q.months.map((mm) => (
                    <td key={mm} className="px-2 py-1.5 text-right tabular-nums text-slate-400">—</td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-500">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{q.quarterLabel} Bonus opportunity</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-2 py-2 w-1/4">Bonus</th>
                <th className="px-2 py-2 text-right">Forecast</th>
                <th className="px-2 py-2 text-right">Budget</th>
                <th className="px-2 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BONUS_LINES.map((l) => (
                <tr key={l.key} className="hover:bg-slate-50">
                  <td className="px-2 py-1.5 text-slate-800">{l.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">—</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">—</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
