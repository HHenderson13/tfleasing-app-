"use client";
import { useState, useTransition } from "react";
import { createSalesExec, deleteSalesExec, updateSalesExec } from "./actions";

type Row = { id: string; name: string; email: string };

export function SalesExecsView({ rows }: { rows: Row[] }) {
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }
    start(async () => {
      const res = await createSalesExec({ name, email });
      if (!res.ok) { setError(res.error); return; }
      setName(""); setEmail(""); setAdding(false);
    });
  }
  function remove(id: string, label: string) {
    if (!confirm(`Delete "${label}"? Existing proposals stay assigned but you won't see them in the picker.`)) return;
    start(() => deleteSalesExec(id));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <input
                    defaultValue={r.name}
                    onBlur={(e) => e.currentTarget.value !== r.name && start(() => updateSalesExec(r.id, { name: e.currentTarget.value }))}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-500 focus:outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="email"
                    defaultValue={r.email}
                    onBlur={(e) => e.currentTarget.value !== r.email && start(() => updateSalesExec(r.id, { email: e.currentTarget.value }))}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-500 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button onClick={() => remove(r.id, r.name)} className="text-slate-300 hover:text-red-500">×</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">No sales execs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@tfleasing.co.uk" className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
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
          + Add sales exec
        </button>
      )}
    </div>
  );
}
