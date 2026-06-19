"use client";
import { useState, useTransition } from "react";
import {
  uploadDealbookAction,
  deleteUploadAction,
  setLineOverrideMonthAction,
  bulkOverrideMonthAction,
} from "./actions";
import { DEALBOOK_SOURCES, DEALBOOK_SOURCE_LABELS, type DealbookSource } from "@/lib/forecast";
import { useRouter } from "next/navigation";

export interface UploadPayload {
  id: string;
  source: string;
  monthYyyymm: string;
  filename: string;
  rowCount: number;
  uploadedAt: string;
}

export interface LinePayload {
  id: string;
  uploadId: string;
  source: string;
  defaultMonth: string;
  overrideMonth: string | null;
  effectiveMonth: string;
  vehicleType: string | null;
  customerName: string | null;
  model: string | null;
  regDate: string | null;
  delivDate: string | null;
  delivStatus: string | null;
  totalGrossProfit: number;
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
  vin: string | null;
  regNo: string | null;
}

interface Props {
  month: string;
  uploads: UploadPayload[];
  lines: LinePayload[];
}

export function UploadsTab({ month, uploads, lines }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterSource, setFilterSource] = useState<DealbookSource | "all">("all");

  function refresh() { router.refresh(); }

  async function onUpload(formData: FormData) {
    setErr(null); setSuccess(null);
    start(async () => {
      const res = await uploadDealbookAction(formData);
      if (!res.ok) { setErr(res.error); return; }
      setSuccess(`Uploaded ${res.rowCount} rows.${res.warnings.length ? " Warnings: " + res.warnings.join("; ") : ""}`);
      refresh();
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  async function bulkAssign(monthValue: string | null) {
    if (selected.size === 0) return;
    start(async () => {
      const res = await bulkOverrideMonthAction(Array.from(selected), monthValue);
      if (!res.ok) { setErr(res.error); return; }
      setSelected(new Set());
      refresh();
    });
  }

  const filteredLines = filterSource === "all" ? lines : lines.filter((l) => l.source === filterSource);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Upload dealbook extract</h2>
        <p className="mt-1 text-xs text-slate-500">
          CSV from the Dealbook export. Pick the target month — lines default to their registered
          date, then invoice / deliv / order. You can override per-line below.
        </p>
        <form action={onUpload} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-slate-500">
            Source
            <select name="source" required className="mt-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
              {DEALBOOK_SOURCES.map((s) => <option key={s} value={s}>{DEALBOOK_SOURCE_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Target month
            <input
              type="month"
              name="month"
              defaultValue={month}
              required
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            CSV file
            <input type="file" name="file" accept=".csv,text/csv" required className="mt-1 text-sm" />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Upload"}
          </button>
        </form>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        {success && <p className="mt-2 text-xs text-emerald-700">{success}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Recent uploads</h2>
        {uploads.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No uploads yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {uploads.slice(0, 10).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">{u.filename}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {DEALBOOK_SOURCE_LABELS[u.source as DealbookSource] ?? u.source}
                    {" · "}target {u.monthYyyymm}
                    {" · "}{u.rowCount} lines
                    {" · "}{new Date(u.uploadedAt).toLocaleString("en-GB")}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Delete "${u.filename}" and all ${u.rowCount} lines?`)) return;
                    start(async () => {
                      const res = await deleteUploadAction(u.id);
                      if (!res.ok) setErr(res.error); else refresh();
                    });
                  }}
                  className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Dealbook lines for {month}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Effective month = override (if set) or default. Change override to move a line into a
              different month — e.g. registered in March but appearing in the June extract.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as DealbookSource | "all")}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="all">All sources</option>
              {DEALBOOK_SOURCES.map((s) => <option key={s} value={s}>{DEALBOOK_SOURCE_LABELS[s]}</option>)}
            </select>
            <span className="text-[11px] text-slate-500">{filteredLines.length} lines</span>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            <span className="font-medium">{selected.size} selected</span>
            <span>· assign override month:</span>
            <input
              type="month"
              onChange={(e) => bulkAssign(e.target.value || null)}
              disabled={pending}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs tabular-nums"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => bulkAssign(null)}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs hover:bg-amber-100"
            >
              Clear overrides
            </button>
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={filteredLines.length > 0 && filteredLines.every((l) => selected.has(l.id))}
                    onChange={() => toggleAll(filteredLines.map((l) => l.id))}
                  />
                </th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Model</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Reg date</th>
                <th className="px-2 py-2">Default month</th>
                <th className="px-2 py-2">Override</th>
                <th className="px-2 py-2 text-right">Total GP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLines.length === 0 ? (
                <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-400">No lines in this month.</td></tr>
              ) : (
                filteredLines.map((l) => (
                  <LineRow
                    key={l.id}
                    line={l}
                    pending={pending}
                    selected={selected.has(l.id)}
                    onToggle={() => toggle(l.id)}
                    onCommit={(month) => {
                      start(async () => {
                        const res = await setLineOverrideMonthAction(l.id, month);
                        if (!res.ok) setErr(res.error); else refresh();
                      });
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LineRow({
  line, pending, selected, onToggle, onCommit,
}: {
  line: LinePayload;
  pending: boolean;
  selected: boolean;
  onToggle: () => void;
  onCommit: (month: string | null) => void;
}) {
  return (
    <tr className={selected ? "bg-amber-50" : ""}>
      <td className="px-2 py-1.5">
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td className="px-2 py-1.5 font-medium text-slate-800">{line.customerName ?? "—"}</td>
      <td className="px-2 py-1.5 text-slate-700">{line.model ?? "—"}</td>
      <td className="px-2 py-1.5">{line.vehicleType ?? "—"}</td>
      <td className="px-2 py-1.5">{line.source}</td>
      <td className="px-2 py-1.5">{line.regDate ?? "—"}</td>
      <td className="px-2 py-1.5 tabular-nums text-slate-500">{line.defaultMonth}</td>
      <td className="px-2 py-1.5">
        <input
          type="month"
          defaultValue={line.overrideMonth ?? ""}
          disabled={pending}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (v !== line.overrideMonth) onCommit(v);
          }}
          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs tabular-nums disabled:opacity-50"
        />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{line.totalGrossProfit.toFixed(2)}</td>
    </tr>
  );
}
