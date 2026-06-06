"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStockTurnRuleAction, deleteStockTurnRuleAction, setStockTurnRuleActiveAction } from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";

interface RuleRow {
  id: string;
  label: string;
  bucket: string | null;
  modelYear: string | null;
  gateReleaseFrom: string | null;
  gateReleaseTo: string | null;
  mustRegisterBy: string;
  bonusGbp: number;
  notes: string | null;
  active: boolean;
}

function dateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}
function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB");
}
function formatGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

// ─── Add form ───────────────────────────────────────────────────────────────

export function AddStockTurnForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [bucket, setBucket] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [gateFrom, setGateFrom] = useState("");
  const [gateTo, setGateTo] = useState("");
  const [mustRegisterBy, setMustRegisterBy] = useState("");
  const [bonus, setBonus] = useState("");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createStockTurnRuleAction({
        label: label.trim(),
        bucket: bucket.trim() || null,
        modelYear: modelYear.trim() || null,
        gateReleaseFrom: gateFrom || null,
        gateReleaseTo: gateTo || null,
        mustRegisterBy,
        bonusGbp: parseFloat(bonus) || 0,
        notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setLabel(""); setBucket(""); setModelYear(""); setGateFrom(""); setGateTo(""); setMustRegisterBy(""); setBonus(""); setNotes("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
          Programme label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Q2 2026 Focus stock turn" required />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Bucket <span className="text-slate-400">(optional)</span>
          <input value={bucket} onChange={(e) => setBucket(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Focus" />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Model year <span className="text-slate-400">(optional)</span>
          <input value={modelYear} onChange={(e) => setModelYear(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="2026.0" />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Bonus £
          <input type="number" step="0.01" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} required />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Gate release from <span className="text-slate-400">(optional)</span>
          <input type="date" value={gateFrom} onChange={(e) => setGateFrom(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Gate release to <span className="text-slate-400">(optional)</span>
          <input type="date" value={gateTo} onChange={(e) => setGateTo(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Must register by
          <input type="date" value={mustRegisterBy} onChange={(e) => setMustRegisterBy(e.target.value)} className={`${inp} mt-1 w-full`} required />
        </label>
        <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
          Notes <span className="text-slate-400">(optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="T&Cs, eligibility caveats…" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending || !label.trim() || !bonus || !mustRegisterBy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add programme"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

// ─── List ───────────────────────────────────────────────────────────────────

export function StockTurnRulesTable({ rules }: { rules: RuleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function toggle(r: RuleRow) {
    start(async () => { await setStockTurnRuleActiveAction(r.id, !r.active); router.refresh(); });
  }
  function del(r: RuleRow) {
    if (!confirm(`Delete "${r.label}"?`)) return;
    start(async () => { await deleteStockTurnRuleAction(r.id); router.refresh(); });
  }
  const now = Date.now();
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Programme</th>
            <th className="px-3 py-2 text-left font-medium">Bucket / MY</th>
            <th className="px-3 py-2 text-left font-medium">Gate window</th>
            <th className="px-3 py-2 text-left font-medium">Reg by</th>
            <th className="px-3 py-2 text-right font-medium">Bonus</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rules.map((r) => {
            const expired = new Date(r.mustRegisterBy).getTime() < now;
            return (
              <tr key={r.id} className={expired ? "bg-amber-50/30" : undefined}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{r.label}</div>
                  {r.notes && <div className="text-xs text-slate-500">{r.notes}</div>}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {[r.bucket ?? "any", r.modelYear ?? "any"].join(" / ")}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {r.gateReleaseFrom || r.gateReleaseTo
                    ? `${fmtDate(r.gateReleaseFrom)} → ${fmtDate(r.gateReleaseTo)}`
                    : "any"}
                </td>
                <td className={`px-3 py-2 text-xs ${expired ? "text-amber-700" : "text-slate-700"}`}>
                  {fmtDate(r.mustRegisterBy)}{expired && <span className="ml-1 text-[10px] uppercase tracking-wide">Expired</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatGbp(r.bonusGbp)}</td>
                <td className="px-3 py-2">
                  {r.active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">Active</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">Disabled</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right space-x-3 whitespace-nowrap">
                  <button onClick={() => toggle(r)} disabled={pending} className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50">
                    {r.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => del(r)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                </td>
              </tr>
            );
          })}
          {rules.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">No programmes yet — add one above.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
