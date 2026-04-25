"use client";
import { useState, useTransition } from "react";
import { createOrderCheck, deleteOrderCheck, updateOrderCheck } from "./actions";

type Row = { id: string; label: string; sortOrder: number; appliesToBq: boolean };

export function OrderChecksView({ rows }: { rows: Row[] }) {
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [newAppliesToBq, setNewAppliesToBq] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!label.trim()) { setError("Label is required."); return; }
    start(async () => {
      const res = await createOrderCheck({ label, appliesToBq: newAppliesToBq });
      if (!res.ok) { setError(res.error); return; }
      setLabel(""); setNewAppliesToBq(true); setAdding(false);
    });
  }
  function remove(id: string, lbl: string) {
    if (!confirm(`Delete "${lbl}"? Any existing proposals that had this ticked will lose the tick.`)) return;
    start(() => deleteOrderCheck(id));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Label</th>
              <th className="px-4 py-3 text-left font-medium">Sort</th>
              <th className="px-4 py-3 text-left font-medium">Required for BQ</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <input
                    defaultValue={r.label}
                    onBlur={(e) => e.currentTarget.value !== r.label && start(() => updateOrderCheck(r.id, { label: e.currentTarget.value }))}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-500 focus:outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    defaultValue={r.sortOrder}
                    onBlur={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (!Number.isNaN(v) && v !== r.sortOrder) start(() => updateOrderCheck(r.id, { sortOrder: v }));
                    }}
                    className="w-20 rounded-md border border-transparent bg-transparent px-2 py-1 tabular-nums hover:border-slate-200 focus:border-slate-500 focus:outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      defaultChecked={r.appliesToBq}
                      onChange={(e) => start(() => updateOrderCheck(r.id, { appliesToBq: e.currentTarget.checked }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {r.appliesToBq ? "Yes" : "No"}
                  </label>
                </td>
                <td className="px-2 py-2 text-right">
                  <button onClick={() => remove(r.id, r.label)} className="text-slate-300 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No extra order checks yet. Built-in ones (chip, MotorComplete, finance agreement, vehicle details) always apply.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Proof of address received" className="min-w-[240px] flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <label className="inline-flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={newAppliesToBq} onChange={(e) => setNewAppliesToBq(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Required for BQ
            </label>
            <button onClick={add} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
            <button onClick={() => { setAdding(false); setError(null); }} className="text-sm text-slate-400">Cancel</button>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-900"
        >
          + Add order check
        </button>
      )}
    </div>
  );
}
