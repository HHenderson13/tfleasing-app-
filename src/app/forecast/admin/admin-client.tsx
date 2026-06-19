"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ForecastPageHeader } from "../page-shell";
import { setConfigAction, addConfigAction, deleteConfigAction } from "../actions";

export interface ConfigPayload {
  key: string;
  value: number;
  description: string | null;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  car: "Lease New Cars",
  cv: "Lease New Commercial",
  overheads: "General Overheads",
  bpm: "Quarterly (BPM)",
  general: "General",
};

const CATEGORY_ORDER = ["car", "cv", "overheads", "bpm", "general"];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  car: "Percentages and constants used in the Lease New Cars monthly forecast (DPA, Standards, House Charge, etc.)",
  cv: "Percentages and constants used in the Lease New Commercial monthly forecast (CVDPA, FRPA, Standards, Stocking).",
  overheads: "Monthly budget and constants for the General Overheads sheet.",
  bpm: "Quarterly rollup and bonus math.",
  general: "Shared values used across more than one sheet.",
};

export function AdminClient({ config }: { config: ConfigPayload[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

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
    <>
      <ForecastPageHeader
        title="Admin"
        description="Percentages and constants that drive the monthly + quarterly forecasts. Edit a value to update it; add new rows for anything new."
        month=""
        showMonthPicker={false}
      />

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <AddConfigCard pending={pending} onError={setErr} onAdded={() => router.refresh()} />

        {CATEGORY_ORDER.map((cat) => {
          const rows = byCat.get(cat);
          if (!rows || rows.length === 0) return null;
          return (
            <section key={cat} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-3">
                <h3 className="text-sm font-semibold text-slate-900">{CATEGORY_LABELS[cat] ?? cat}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{CATEGORY_DESCRIPTIONS[cat] ?? ""}</p>
              </div>
              {err && <p className="border-b border-rose-100 bg-rose-50 px-6 py-2 text-xs text-rose-700">{err}</p>}
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-6 py-2.5 text-left font-medium w-1/3">Key</th>
                    <th className="px-3 py-2.5 text-left font-medium">Description</th>
                    <th className="px-3 py-2.5 text-right font-medium w-32">Value</th>
                    <th className="px-6 py-2.5 text-right font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c, idx) => (
                    <tr key={c.key} className={`border-t border-slate-100 ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                      <td className="px-6 py-2 font-mono text-xs text-slate-700">{c.key}</td>
                      <td className="px-3 py-2 text-sm text-slate-600">{c.description ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={c.value}
                          disabled={pending}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v !== c.value) commitValue(c.key, v);
                          }}
                          className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm tabular-nums hover:border-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200 disabled:opacity-50"
                        />
                      </td>
                      <td className="px-6 py-2 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(c.key)}
                          className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </main>
    </>
  );
}

function AddConfigCard({
  pending, onError, onAdded,
}: {
  pending: boolean;
  onError: (e: string | null) => void;
  onAdded: () => void;
}) {
  const [, start] = useTransition();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-transparent px-6 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Add a new value</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          For example <code className="rounded bg-slate-100 px-1">car_dpa_pct = 2.5</code>. Reference the
          key in the forecast math when you're ready to wire it in.
        </p>
      </div>
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
        className="grid gap-3 p-6 sm:grid-cols-[1fr_2fr_1fr_120px_auto]"
      >
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="my_new_pct"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this?"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" type="number" step="0.01"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums" />
        <button type="submit" disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Add</button>
      </form>
    </section>
  );
}
