"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createBusinessDiscountAction,
  deleteBusinessDiscountAction,
  setBusinessDiscountActiveAction,
} from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";

type VClass = "" | "car" | "van";
type Route = "" | "outright" | "pcp" | "hp" | "hp_balloon" | "contract_hire";

const ROUTE_LABEL: Record<Exclude<Route, "">, string> = {
  outright: "Outright",
  pcp: "PCP",
  hp: "HP",
  hp_balloon: "HP + Balloon",
  contract_hire: "Contract Hire",
};

interface Row {
  id: string;
  label: string;
  vehicleClass: string | null;
  bucket: string | null;
  fundingRoute: string | null;
  extraDiscountPct: number;
  aprUpliftPct: number;
  notes: string | null;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB");
}

export function AddBusinessDiscountForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [vClass, setVClass] = useState<VClass>("");
  const [bucket, setBucket] = useState("");
  const [route, setRoute] = useState<Route>("");
  const [discount, setDiscount] = useState("");
  const [uplift, setUplift] = useState("0");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createBusinessDiscountAction({
        label,
        vehicleClass: vClass === "" ? null : vClass,
        bucket: bucket.trim() || null,
        fundingRoute: route === "" ? null : route,
        extraDiscountPct: parseFloat(discount) || 0,
        aprUpliftPct: parseFloat(uplift) || 0,
        notes: notes.trim() || null,
        validFrom: from || null,
        validUntil: until || null,
      });
      if (!res.ok) { setError(res.error ?? "Failed."); return; }
      setLabel(""); setBucket(""); setDiscount(""); setUplift("0"); setFrom(""); setUntil(""); setNotes("");
      setVClass(""); setRoute("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
          Programme label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Q2 2026 Business Buyer Allowance" required />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Vehicle class
          <select value={vClass} onChange={(e) => setVClass(e.target.value as VClass)} className={`${inp} mt-1 w-full`}>
            <option value="">Any</option>
            <option value="car">Cars</option>
            <option value="van">Vans</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Bucket <span className="text-slate-400">(optional)</span>
          <input value={bucket} onChange={(e) => setBucket(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Focus" />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Funding route
          <select value={route} onChange={(e) => setRoute(e.target.value as Route)} className={`${inp} mt-1 w-full`}>
            <option value="">Any</option>
            <option value="outright">Outright</option>
            <option value="pcp">PCP</option>
            <option value="hp">HP</option>
            <option value="hp_balloon">HP + Balloon</option>
            <option value="contract_hire">Contract Hire</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Extra discount %
          <input type="number" step="0.01" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} required />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          APR uplift % <span className="text-slate-400">(finance only)</span>
          <input type="number" step="0.01" min={0} value={uplift} onChange={(e) => setUplift(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Valid from <span className="text-slate-400">(optional)</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Valid until <span className="text-slate-400">(optional)</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
          Notes <span className="text-slate-400">(optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Eligibility, conditions…" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending || !label.trim() || !discount} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add rule"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

export function BusinessDiscountTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function toggle(r: Row) { start(async () => { await setBusinessDiscountActiveAction(r.id, !r.active); router.refresh(); }); }
  function del(r: Row) {
    if (!confirm(`Delete "${r.label}"?`)) return;
    start(async () => { await deleteBusinessDiscountAction(r.id); router.refresh(); });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Programme</th>
            <th className="px-3 py-2 text-left font-medium">Scope</th>
            <th className="px-3 py-2 text-left font-medium">Route</th>
            <th className="px-3 py-2 text-right font-medium">Discount %</th>
            <th className="px-3 py-2 text-right font-medium">APR uplift %</th>
            <th className="px-3 py-2 text-left font-medium">Valid</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-slate-900">
                <div className="font-medium">{r.label}</div>
                {r.notes && <div className="text-xs text-slate-500">{r.notes}</div>}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {r.vehicleClass ? r.vehicleClass.toUpperCase() : "Any"}{r.bucket && <> · {r.bucket}</>}
              </td>
              <td className="px-3 py-2 text-xs text-slate-700">
                {r.fundingRoute ? (ROUTE_LABEL[r.fundingRoute as keyof typeof ROUTE_LABEL] ?? r.fundingRoute) : "Any"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{r.extraDiscountPct.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.aprUpliftPct.toFixed(2)}%</td>
              <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.validFrom)} → {fmtDate(r.validUntil)}</td>
              <td className="px-3 py-2">
                {r.active ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">Active</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">Disabled</span>
                )}
              </td>
              <td className="px-3 py-2 text-right space-x-3 whitespace-nowrap">
                <button onClick={() => toggle(r)} disabled={pending} className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50">{r.active ? "Disable" : "Enable"}</button>
                <button onClick={() => del(r)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">No rules yet — add one above.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
