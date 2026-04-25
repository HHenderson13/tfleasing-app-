"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  assignVehiclesToDiscount,
  createDiscount,
  deleteDiscount,
  listAssignableVehicles,
  unassignVehicleFromDiscount,
  updateDiscount,
} from "./actions";

type Vehicle = {
  capCode: string;
  model: string;
  derivative: string;
  fuelType: string | null;
  listPriceNet: number | null;
};

type Row = {
  id: string;
  label: string;
  termsPct: number;
  dealerPct: number;
  additionalDiscountsGbp: number;
  novunaChip3Yr: number | null;
  novunaChip4Yr: number | null;
  grantText: string | null;
  customerSavingGbp: number | null;
  notes: string | null;
  vehicles: Vehicle[];
};

export function DiscountsGrid({ rows }: { rows: Row[] }) {
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [pickerFor, setPickerFor] = useState<{ id: string; label: string } | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [query, setQuery] = useState("");

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  }

  function save(id: string, patch: Parameters<typeof updateDiscount>[1]) {
    start(() => updateDiscount(id, patch));
  }
  function add() {
    if (!newLabel.trim()) return;
    start(async () => {
      await createDiscount({ label: newLabel.trim() });
      setNewLabel(""); setAdding(false);
    });
  }
  function remove(id: string, label: string, vehicleCount: number) {
    const extra = vehicleCount > 0 ? ` (${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"} will be unmapped)` : "";
    if (!confirm(`Delete "${label}"?${extra}`)) return;
    start(() => deleteDiscount(id));
  }
  function unassign(capCode: string) {
    start(() => unassignVehicleFromDiscount(capCode));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      if (r.label.toLowerCase().includes(q)) return true;
      return r.vehicles.some((v) => `${v.model} ${v.derivative}`.toLowerCase().includes(q));
    });
  }, [rows, query]);

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`rounded-xl border px-4 py-2 text-sm shadow-sm ${toast.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search profiles or vehicles…"
          className="w-72 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
        />
        <div className="text-xs text-slate-400">{rows.length} profile{rows.length === 1 ? "" : "s"}</div>
      </div>

      <div className="grid gap-3">
        {filtered.map((r) => (
          <ProfileCard
            key={r.id}
            row={r}
            onSave={(patch) => save(r.id, patch)}
            onAddVehicles={() => setPickerFor({ id: r.id, label: r.label })}
            onUnassign={unassign}
            onDelete={() => remove(r.id, r.label, r.vehicles.length)}
          />
        ))}
        {filtered.length === 0 && rows.length > 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            No profiles match "{query}".
          </div>
        )}
      </div>

      {adding ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setNewLabel(""); } }}
            placeholder="Profile name, e.g. Puma Gen-E Select"
            className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <button onClick={add} disabled={!newLabel.trim()} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Create</button>
          <button onClick={() => { setAdding(false); setNewLabel(""); }} className="text-sm text-slate-400 hover:text-slate-700">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-900"
        >
          + New discount profile
        </button>
      )}

      {pickerFor && (
        <VehiclePicker
          profile={pickerFor}
          onClose={() => setPickerFor(null)}
          onResult={(res) => {
            if (res.ok) flash("ok", `Assigned ${res.assigned} vehicle${res.assigned === 1 ? "" : "s"} to "${pickerFor.label}".`);
            else flash("err", res.error);
          }}
        />
      )}
    </div>
  );
}

function ProfileCard({
  row, onSave, onAddVehicles, onUnassign, onDelete,
}: {
  row: Row;
  onSave: (patch: Parameters<typeof updateDiscount>[1]) => void;
  onAddVehicles: () => void;
  onUnassign: (capCode: string) => void;
  onDelete: () => void;
}) {
  const [showVehicles, setShowVehicles] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const total = row.termsPct + row.dealerPct;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-4 px-5 pt-4">
        <input
          defaultValue={row.label}
          onBlur={(e) => e.currentTarget.value !== row.label && onSave({ label: e.currentTarget.value })}
          className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-400 focus:outline-none"
        />
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onAddVehicles}
            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Add vehicles
          </button>
          <button
            onClick={onDelete}
            className="rounded-full p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
            aria-label="Delete profile"
            title="Delete profile"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 md:grid-cols-4">
        <NumField label="Terms" value={row.termsPct} suffix="%" isPct onSave={(v) => onSave({ termsPct: v })} />
        <NumField label="Dealer" value={row.dealerPct} suffix="%" isPct onSave={(v) => onSave({ dealerPct: v })} />
        <NumField
          label="Additional"
          value={row.additionalDiscountsGbp}
          prefix="£"
          onSave={(v) => onSave({ additionalDiscountsGbp: v })}
          placeholder="0"
        />
        <div className="flex flex-col justify-center rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Total discount</span>
          <span className="text-xl font-semibold tabular-nums text-slate-900">{(total * 100).toFixed(2)}%</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2 text-xs">
        <button
          onClick={() => setShowVehicles((v) => !v)}
          className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900"
        >
          <span>{showVehicles ? "▾" : "▸"}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">
            {row.vehicles.length} vehicle{row.vehicles.length === 1 ? "" : "s"}
          </span>
        </button>
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-900"
        >
          <span>{showDetails ? "▾" : "▸"}</span>
          Novuna chips · grant · customer saving
        </button>
      </div>

      {showDetails && (
        <div className="grid gap-4 border-t border-slate-100 px-5 py-4 md:grid-cols-2">
          <fieldset className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Novuna chip (Novuna only)</legend>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <NumField label="3-year" value={row.novunaChip3Yr} suffix="%" isPct nullable onSave={(v) => onSave({ novunaChip3Yr: v })} placeholder="—" />
              <NumField label="4-year" value={row.novunaChip4Yr} suffix="%" isPct nullable onSave={(v) => onSave({ novunaChip4Yr: v })} placeholder="—" />
            </div>
          </fieldset>
          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Customer-facing</legend>
            <div className="mt-1 grid grid-cols-1 gap-3">
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-slate-500">Grant text</span>
                <input
                  defaultValue={row.grantText ?? ""}
                  placeholder="e.g. £1,500 grant applied"
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v !== (row.grantText ?? "")) onSave({ grantText: v || null });
                  }}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                />
              </label>
              <NumField
                label="Customer saving"
                value={row.customerSavingGbp}
                prefix="£"
                nullable
                onSave={(v) => onSave({ customerSavingGbp: v })}
                placeholder="—"
              />
            </div>
          </fieldset>
        </div>
      )}

      {showVehicles && (
        <div className="border-t border-slate-100 px-5 py-3">
          {row.vehicles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
              No vehicles assigned yet. Click "+ Add vehicles".
            </div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {row.vehicles.map((v) => (
                <li key={v.capCode} className="group inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs ring-1 ring-transparent hover:ring-slate-300">
                  <span className="font-medium text-slate-800">{v.model}</span>
                  <span className="text-slate-600">{v.derivative}</span>
                  {v.fuelType && <span className="text-slate-400">· {v.fuelType}</span>}
                  <button
                    onClick={() => onUnassign(v.capCode)}
                    className="ml-1 text-slate-400 hover:text-red-500"
                    aria-label={`Unassign ${v.capCode}`}
                    title="Remove"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function NumField({
  label, value, onSave, prefix, suffix, isPct = false, nullable = false, placeholder,
}: {
  label: string;
  value: number | null;
  onSave: (v: any) => void;
  prefix?: string;
  suffix?: string;
  isPct?: boolean;
  nullable?: boolean;
  placeholder?: string;
}) {
  const display = value == null ? "" : isPct ? (value * 100).toFixed(2) : String(value);
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-slate-500">{label}</span>
      <div className="flex items-stretch rounded-md border border-slate-200 bg-white focus-within:border-slate-400">
        {prefix && <span className="flex items-center pl-2 text-sm text-slate-400">{prefix}</span>}
        <input
          type="number"
          step="0.01"
          defaultValue={display}
          placeholder={placeholder}
          onBlur={(e) => {
            const raw = e.currentTarget.value.trim();
            if (raw === "") {
              if (nullable && value !== null) onSave(null);
              else if (!nullable && value !== 0) onSave(0);
              return;
            }
            const num = parseFloat(raw);
            if (!Number.isFinite(num)) return;
            const v = isPct ? num / 100 : num;
            if (Math.abs(v - (value ?? 0)) > 1e-9) onSave(v);
          }}
          className="w-full bg-transparent px-2 py-1.5 text-sm tabular-nums focus:outline-none"
        />
        {suffix && <span className="flex items-center pr-2 text-sm text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

type PickerVehicle = {
  capCode: string;
  model: string;
  derivative: string;
  fuelType: string | null;
  listPriceNet: number | null;
  discountKey: string | null;
};

function VehiclePicker({
  profile,
  onClose,
  onResult,
}: {
  profile: { id: string; label: string };
  onClose: () => void;
  onResult: (res: { ok: true; assigned: number } | { ok: false; error: string }) => void;
}) {
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState<PickerVehicle[] | null>(null);
  const [q, setQ] = useState("");
  const [model, setModel] = useState("");
  const [fuel, setFuel] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<{ mode: "include" | "exclude"; text: string }[]>([]);
  const [ruleDraft, setRuleDraft] = useState<{ mode: "include" | "exclude"; text: string }>({ mode: "include", text: "" });

  useEffect(() => {
    let cancelled = false;
    listAssignableVehicles(profile.id).then((rows) => {
      if (!cancelled) setLoaded(rows);
    });
    return () => { cancelled = true; };
  }, [profile.id]);

  const rows = loaded ?? [];
  const models = useMemo(() => Array.from(new Set(rows.map((r) => r.model))).sort(), [rows]);
  const fuels = useMemo(() => Array.from(new Set(rows.map((r) => r.fuelType).filter(Boolean) as string[])).sort(), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (model && r.model !== model) return false;
      if (fuel && r.fuelType !== fuel) return false;
      const hay = `${r.model} ${r.derivative} ${r.fuelType ?? ""} ${r.capCode}`.toLowerCase();
      if (needle && !hay.includes(needle)) return false;
      for (const rule of rules) {
        const terms = rule.text.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) continue;
        const matchesAll = terms.every((t) => hay.includes(t));
        if (rule.mode === "include" && !matchesAll) return false;
        if (rule.mode === "exclude" && matchesAll) return false;
      }
      return true;
    });
  }, [rows, q, model, fuel, rules]);

  function toggle(capCode: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(capCode)) next.delete(capCode); else next.add(capCode);
      return next;
    });
  }
  function togglePageAll() {
    const all = filtered.every((r) => picked.has(r.capCode));
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (all) next.delete(r.capCode);
        else next.add(r.capCode);
      }
      return next;
    });
  }
  function confirm() {
    const ids = Array.from(picked);
    if (!ids.length) { onClose(); return; }
    start(async () => {
      const res = await assignVehiclesToDiscount(profile.id, ids);
      onResult(res);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Add vehicles to</div>
          <div className="text-lg font-semibold text-slate-900">{profile.label}</div>
          <p className="mt-1 text-xs text-slate-500">Showing vehicles that aren't yet mapped to any discount profile.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">All models</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">All fuels</option>
            {fuels.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          <select
            value={ruleDraft.mode}
            onChange={(e) => setRuleDraft((d) => ({ ...d, mode: e.target.value as "include" | "exclude" }))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
          <input
            value={ruleDraft.text}
            onChange={(e) => setRuleDraft((d) => ({ ...d, text: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ruleDraft.text.trim()) {
                setRules((rs) => [...rs, { mode: ruleDraft.mode, text: ruleDraft.text.trim() }]);
                setRuleDraft({ mode: ruleDraft.mode, text: "" });
              }
            }}
            placeholder='e.g. "gen-e select" — space-separated words all must match'
            className="flex-1 min-w-[240px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
          />
          <button
            onClick={() => {
              if (!ruleDraft.text.trim()) return;
              setRules((rs) => [...rs, { mode: ruleDraft.mode, text: ruleDraft.text.trim() }]);
              setRuleDraft({ mode: ruleDraft.mode, text: "" });
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Add rule
          </button>
          {rules.length > 0 && (
            <div className="flex w-full flex-wrap gap-1.5 pt-1">
              {rules.map((rule, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${rule.mode === "include" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}
                >
                  {rule.mode === "include" ? "+" : "−"} {rule.text}
                  <button onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))} className="ml-1 opacity-60 hover:opacity-100">×</button>
                </span>
              ))}
              <button onClick={() => setRules([])} className="text-xs text-slate-400 hover:text-slate-700">clear all</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {loaded === null ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No matching unmapped vehicles.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((r) => picked.has(r.capCode))}
                      onChange={togglePageAll}
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-left font-medium">Derivative</th>
                  <th className="px-3 py-2 text-left font-medium">Fuel</th>
                  <th className="px-3 py-2 text-right font-medium">BLP</th>
                  <th className="px-3 py-2 text-left font-medium">Cap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.capCode} className={picked.has(r.capCode) ? "bg-emerald-50/50" : ""} onClick={() => toggle(r.capCode)}>
                    <td className="px-3 py-1.5"><input type="checkbox" checked={picked.has(r.capCode)} onChange={() => toggle(r.capCode)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="px-3 py-1.5 text-slate-900">{r.model}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.derivative}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.fuelType ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.listPriceNet != null ? `£${r.listPriceNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{r.capCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <div className="text-xs text-slate-500">{picked.size} selected</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900">Cancel</button>
            <button
              onClick={confirm}
              disabled={pending || picked.size === 0}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? "Assigning…" : `Assign ${picked.size || ""}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
