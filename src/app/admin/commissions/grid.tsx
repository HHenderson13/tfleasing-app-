"use client";
import { useState, useTransition } from "react";
import { updateCommission } from "./actions";

type Funder = { id: string; name: string };
type Row = {
  funderId: string; contract: string; maintenance: string; commissionGbp: number;
};

const COMBOS: { contract: "PCH" | "BCH"; maintenance: "customer" | "maintained"; label: string }[] = [
  { contract: "PCH", maintenance: "customer", label: "PCH · Customer Maint." },
  { contract: "PCH", maintenance: "maintained", label: "PCH · Maintained" },
  { contract: "BCH", maintenance: "customer", label: "BCH · Customer Maint." },
  { contract: "BCH", maintenance: "maintained", label: "BCH · Maintained" },
];

export function CommissionsGrid({ funders, rows }: { funders: Funder[]; rows: Row[] }) {
  const init: Record<string, number> = {};
  for (const f of funders) for (const c of COMBOS) {
    const r = rows.find((x) => x.funderId === f.id && x.contract === c.contract && x.maintenance === c.maintenance);
    init[`${f.id}|${c.contract}|${c.maintenance}`] = r?.commissionGbp ?? 0;
  }
  const [values, setValues] = useState(init);
  const [saving, setSaving] = useState<string | null>(null);
  const [, start] = useTransition();

  function save(funderId: string, contract: "PCH" | "BCH", maintenance: "customer" | "maintained", raw: string) {
    const key = `${funderId}|${contract}|${maintenance}`;
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val === values[key]) return;
    setSaving(key);
    start(async () => {
      await updateCommission({ funderId, contract, maintenance, commissionGbp: val });
      setValues((v) => ({ ...v, [key]: val }));
      setSaving(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Funder</th>
            {COMBOS.map((c) => <th key={c.label} className="px-4 py-3 text-right font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {funders.map((f) => (
            <tr key={f.id}>
              <td className="px-4 py-2 font-medium text-slate-900">{f.name}</td>
              {COMBOS.map((c) => {
                const key = `${f.id}|${c.contract}|${c.maintenance}`;
                return (
                  <td key={c.label} className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <span className="text-xs text-slate-400">£</span>
                      <input
                        type="number"
                        step="1"
                        defaultValue={values[key]}
                        onBlur={(e) => save(f.id, c.contract, c.maintenance, e.currentTarget.value)}
                        className={`w-20 rounded-lg border bg-white px-2 py-1 text-right text-sm tabular-nums transition ${
                          saving === key ? "border-amber-300" : "border-slate-200 focus:border-slate-500"
                        } outline-none`}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
