"use client";
import { useMemo, useState } from "react";

type Row = {
  capCode: string;
  model: string;
  derivative: string;
  fuelType: string | null;
  listPriceNet: number | null;
  discountKey: string | null;
  discountLabel: string | null;
};

export function VehiclesView({ rows }: { rows: Row[] }) {
  const [tab, setTab] = useState<"all" | "unmapped" | "mapped">("all");
  const [q, setQ] = useState("");
  const [fuel, setFuel] = useState<string>("");

  const fuels = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.fuelType) s.add(r.fuelType);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "unmapped" && r.discountKey) return false;
      if (tab === "mapped" && !r.discountKey) return false;
      if (fuel && r.fuelType !== fuel) return false;
      if (!needle) return true;
      return (
        r.model.toLowerCase().includes(needle) ||
        r.derivative.toLowerCase().includes(needle) ||
        r.capCode.toLowerCase().includes(needle)
      );
    });
  }, [rows, tab, q, fuel]);

  const counts = useMemo(() => ({
    all: rows.length,
    unmapped: rows.filter((r) => !r.discountKey).length,
    mapped: rows.filter((r) => r.discountKey).length,
  }), [rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {([
            ["all", `All (${counts.all})`],
            ["unmapped", `Unmapped (${counts.unmapped})`],
            ["mapped", `Mapped (${counts.mapped})`],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search model, derivative, cap code…"
          className="flex-1 min-w-[240px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
        />
        <select
          value={fuel}
          onChange={(e) => setFuel(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">All fuels</option>
          {fuels.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left font-medium">Model</th>
              <th className="px-3 py-3 text-left font-medium">Derivative</th>
              <th className="px-3 py-3 text-left font-medium">Fuel</th>
              <th className="px-3 py-3 text-left font-medium">Cap code</th>
              <th className="px-3 py-3 text-right font-medium">BLP</th>
              <th className="px-3 py-3 text-left font-medium">Discount profile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.capCode}>
                <td className="px-3 py-2 text-slate-900">{r.model}</td>
                <td className="px-3 py-2 text-slate-700">{r.derivative}</td>
                <td className="px-3 py-2 text-slate-600">{r.fuelType ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.capCode}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.listPriceNet != null ? `£${r.listPriceNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                </td>
                <td className="px-3 py-2">
                  {r.discountLabel ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{r.discountLabel}</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Unmapped</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">No vehicles match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
