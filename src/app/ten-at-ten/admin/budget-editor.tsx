"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBudgetsAction } from "../actions";

type Budgets = Record<string, { car: number; cv: number }>;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Monthly delivery budgets, a year at a time. Car and CV are entered;
 * combined is always their sum, so the three can't disagree. A month left
 * blank has no budget and the Deliveries tab says so rather than showing 0.
 */
export function BudgetEditor({ budgets, initialYear }: { budgets: Budgets; initialYear: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [edits, setEdits] = useState<Record<string, { car: string; cv: string }>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ym = (m: number) => `${year}-${String(m + 1).padStart(2, "0")}`;
  const valueOf = (key: string, seg: "car" | "cv") => edits[key]?.[seg] ?? (budgets[key] ? String(budgets[key][seg]) : "");
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  function set(key: string, seg: "car" | "cv", v: string) {
    if (!/^\d*$/.test(v)) return;
    setEdits((e) => ({ ...e, [key]: { car: valueOf(key, "car"), cv: valueOf(key, "cv"), [seg]: v } }));
    setMsg(null);
  }

  function save() {
    const rows = Object.entries(edits)
      .map(([yearMonth, v]) => ({ yearMonth, car: num(v.car), cv: num(v.cv) }))
      .filter((r): r is { yearMonth: string; car: number; cv: number } => r.car != null && r.cv != null);
    const half = Object.values(edits).some((v) => (num(v.car) == null) !== (num(v.cv) == null));
    if (half) { setMsg({ ok: false, text: "Enter both Car and CV for a month, or leave both blank." }); return; }
    if (rows.length === 0) { setMsg({ ok: false, text: "Nothing to save." }); return; }
    start(async () => {
      const res = await saveBudgetsAction({ rows });
      if (!res.ok) { setMsg({ ok: false, text: res.error ?? "Couldn't save." }); return; }
      setEdits({});
      setMsg({ ok: true, text: `Saved ${rows.length} month${rows.length === 1 ? "" : "s"}.` });
      router.refresh();
    });
  }

  const dirty = Object.keys(edits).length > 0;
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Delivery budgets</h2>
          <p className="text-xs text-slate-500">Monthly units the Deliveries tab measures against. Combined is Car + CV.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setYear((y) => y - 1)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100" aria-label="Previous year">‹</button>
          <span className="min-w-[48px] text-center font-semibold text-slate-900">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100" aria-label="Next year">›</button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Month</th>
              <th className="px-3 py-2 text-right font-semibold">Car</th>
              <th className="px-3 py-2 text-right font-semibold">CV</th>
              <th className="px-4 py-2 text-right font-semibold">Combined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MONTHS.map((name, m) => {
              const key = ym(m);
              const car = num(valueOf(key, "car"));
              const cv = num(valueOf(key, "cv"));
              return (
                <tr key={key} className={edits[key] ? "bg-amber-50/50" : undefined}>
                  <td className="px-4 py-1.5 text-slate-700">{name}</td>
                  {(["car", "cv"] as const).map((seg) => (
                    <td key={seg} className="px-3 py-1.5 text-right">
                      <input inputMode="numeric" value={valueOf(key, seg)} onChange={(e) => set(key, seg, e.target.value)} placeholder="—"
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-slate-500 focus:outline-none" />
                    </td>
                  ))}
                  <td className="px-4 py-1.5 text-right font-semibold tabular-nums text-slate-900">{car != null && cv != null ? car + cv : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={pending || !dirty}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
          {pending ? "Saving…" : "Save budgets"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
