"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setConfigAction, addConfigAction, deleteConfigAction } from "./actions";

export interface ConfigPayload {
  key: string;
  value: number;
  description: string | null;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  car: "Lease Car",
  cv: "Lease CV",
  overheads: "Overheads",
  bpm: "BPM",
  general: "General",
};

const CATEGORY_ORDER = ["car", "cv", "overheads", "bpm", "general"];

export function AdminTab({ config }: { config: ConfigPayload[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Group by category for display.
  const byCat = new Map<string, ConfigPayload[]>();
  for (const c of config) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category)!.push(c);
  }

  function commitValue(key: string, value: number) {
    setErr(null);
    start(async () => {
      const res = await setConfigAction(key, value);
      if (!res.ok) setErr(res.error); else router.refresh();
    });
  }

  function remove(key: string) {
    if (!confirm(`Delete config "${key}"?`)) return;
    start(async () => {
      const res = await deleteConfigAction(key);
      if (!res.ok) setErr(res.error); else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Add config row</h3>
        <p className="mt-1 text-xs text-slate-500">
          Each row is a named percentage or constant the forecast math can use — e.g.
          <code className="mx-1 rounded bg-slate-100 px-1">car_dpa_pct = 2.5</code>. Reference these
          keys when we wire individual line math (next iteration).
        </p>
        <AddConfigForm pending={pending} onError={setErr} onAdded={() => router.refresh()} />
      </section>

      {CATEGORY_ORDER.map((cat) => {
        const rows = byCat.get(cat);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={cat} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">{CATEGORY_LABELS[cat] ?? cat}</h3>
            {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-2 py-2 w-1/4">Key</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2 text-right w-32">Value</th>
                    <th className="px-2 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => (
                    <tr key={c.key} className="hover:bg-slate-50">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-slate-700">{c.key}</td>
                      <td className="px-2 py-1.5 text-slate-700">{c.description ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={c.value}
                          disabled={pending}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v !== c.value) commitValue(c.key, v);
                          }}
                          className="w-28 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none disabled:opacity-50"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(c.key)}
                          className="text-[11px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AddConfigForm({
  pending, onError, onAdded,
}: {
  pending: boolean;
  onError: (e: string | null) => void;
  onAdded: () => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [start] = [useTransition()[1]];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onError(null);
        const v = Number(value);
        if (!Number.isFinite(v)) { onError("Value must be a number."); return; }
        start(async () => {
          const res = await addConfigAction({ key, value: v, description, category });
          if (!res.ok) { onError(res.error); return; }
          setKey(""); setValue(""); setDescription("");
          onAdded();
        });
      }}
      className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_1fr_120px_auto]"
    >
      <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="my_new_pct" className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm" />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this?" className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm" />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
        {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </select>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" type="number" step="0.01" className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-sm tabular-nums" />
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">Add</button>
    </form>
  );
}
