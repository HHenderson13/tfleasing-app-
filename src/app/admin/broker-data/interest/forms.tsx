"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInterestRateAction,
  deleteInterestRateAction,
  setInterestRateActiveAction,
  updateInterestRateAction,
} from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";

type VehicleClass = "car" | "van" | "all";
type CustomerType = "retail" | "business";
type Route = "pcp" | "hp" | "hp_balloon";

const ROUTE_LABEL: Record<Route, string> = {
  pcp: "PCP",
  hp: "Hire Purchase",
  hp_balloon: "HP + Balloon",
};

const CLASS_LABEL: Record<VehicleClass, string> = {
  car: "Cars",
  van: "Vans",
  all: "Any vehicle",
};

interface RateRow {
  id: string;
  label: string;
  vehicleClass: VehicleClass;
  bucket: string | null;
  customerType: CustomerType;
  fundingRoute: Route;
  termMonths: number;
  annualAprPct: number;
  depositAllowanceGbp: number | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  active: boolean;
}

function formatGbp(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB");
}

// ─── Add form ───────────────────────────────────────────────────────────────

export function AddInterestRateForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>("car");
  const [bucket, setBucket] = useState("");
  const [customerType, setCustomerType] = useState<CustomerType>("retail");
  const [fundingRoute, setFundingRoute] = useState<Route>("pcp");
  const [termMonths, setTermMonths] = useState("36");
  const [apr, setApr] = useState("");
  const [deposit, setDeposit] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createInterestRateAction({
        label: label.trim(),
        vehicleClass,
        bucket: bucket.trim() || null,
        customerType,
        fundingRoute,
        termMonths: parseInt(termMonths, 10) || 0,
        annualAprPct: parseFloat(apr) || 0,
        depositAllowanceGbp: deposit.trim() === "" ? null : parseFloat(deposit),
        validFrom: validFrom || null,
        validUntil: validUntil || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setLabel(""); setBucket(""); setApr(""); setDeposit(""); setValidFrom(""); setValidUntil(""); setNotes("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
          Programme label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Q2 2026 PCP — Ford passenger" required />
        </label>

        <label className="block text-xs font-medium text-slate-700">
          Vehicle class
          <select value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value as VehicleClass)} className={`${inp} mt-1 w-full`}>
            <option value="car">Cars</option>
            <option value="van">Vans</option>
            <option value="all">Any vehicle</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Bucket <span className="text-slate-400">(optional)</span>
          <input value={bucket} onChange={(e) => setBucket(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Focus" />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Term (months)
          <input type="number" min={1} step={1} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} required />
        </label>

        <label className="block text-xs font-medium text-slate-700">
          Customer type
          <select value={customerType} onChange={(e) => setCustomerType(e.target.value as CustomerType)} className={`${inp} mt-1 w-full`}>
            <option value="retail">Retail</option>
            <option value="business">Business</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Funding route
          <select value={fundingRoute} onChange={(e) => setFundingRoute(e.target.value as Route)} className={`${inp} mt-1 w-full`}>
            <option value="pcp">PCP</option>
            <option value="hp">Hire Purchase</option>
            <option value="hp_balloon">HP + Balloon</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          APR %
          <input type="number" step="0.01" min={0} value={apr} onChange={(e) => setApr(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} required />
        </label>

        <label className="block text-xs font-medium text-slate-700">
          Deposit allowance £ <span className="text-slate-400">(optional)</span>
          <input type="number" step="0.01" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Valid from <span className="text-slate-400">(optional)</span>
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Valid until <span className="text-slate-400">(optional)</span>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>

        <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
          Notes <span className="text-slate-400">(optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Conditions, eligibility caveats…" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending || !label.trim() || !apr || !termMonths} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add row"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

// ─── Table ──────────────────────────────────────────────────────────────────

export function InterestRatesTable({ rows }: { rows: RateRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) =>
      `${r.label} ${r.bucket ?? ""} ${r.vehicleClass} ${r.customerType} ${r.fundingRoute} ${r.termMonths}`
        .toLowerCase()
        .includes(f),
    );
  }, [rows, filter]);

  function commitApr(id: string, value: number) {
    start(async () => { await updateInterestRateAction(id, { annualAprPct: value }); router.refresh(); });
  }
  function commitDeposit(id: string, value: number | null) {
    start(async () => { await updateInterestRateAction(id, { depositAllowanceGbp: value }); router.refresh(); });
  }
  function toggle(r: RateRow) {
    start(async () => { await setInterestRateActiveAction(r.id, !r.active); router.refresh(); });
  }
  function del(r: RateRow) {
    if (!confirm(`Delete "${r.label}" (${r.termMonths}m)?`)) return;
    start(async () => { await deleteInterestRateAction(r.id); router.refresh(); });
  }
  const now = Date.now();

  return (
    <div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by label / route / term / bucket…"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
      />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Programme</th>
              <th className="px-3 py-2 text-left font-medium">Scope</th>
              <th className="px-3 py-2 text-left font-medium">Route</th>
              <th className="px-3 py-2 text-right font-medium">Term</th>
              <th className="px-3 py-2 text-right font-medium">APR %</th>
              <th className="px-3 py-2 text-right font-medium">Deposit £</th>
              <th className="px-3 py-2 text-left font-medium">Valid</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => {
              const expired = !!r.validUntil && new Date(r.validUntil).getTime() < now;
              return (
                <tr key={r.id} className={expired ? "bg-amber-50/30" : undefined}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{r.label}</div>
                    {r.notes && <div className="text-xs text-slate-500">{r.notes}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {CLASS_LABEL[r.vehicleClass]}{r.bucket && <> · {r.bucket}</>}
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{r.customerType}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{ROUTE_LABEL[r.fundingRoute]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.termMonths}m</td>
                  <td className="px-3 py-2 text-right">
                    <BlurNumber initial={r.annualAprPct} step="0.01" onCommit={(v) => commitApr(r.id, v ?? 0)} className="w-20 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <BlurNumber initial={r.depositAllowanceGbp} step="0.01" nullable onCommit={(v) => commitDeposit(r.id, v)} className="w-24 text-right" />
                    {r.depositAllowanceGbp !== null && (
                      <div className="text-[10px] text-slate-400">{formatGbp(r.depositAllowanceGbp)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {fmtDate(r.validFrom)} → {fmtDate(r.validUntil)}
                    {expired && <div className="text-[10px] uppercase tracking-wide text-amber-700">Expired</div>}
                  </td>
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
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">No rows match — clear the filter or add a row above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlurNumber({
  initial,
  step,
  nullable,
  onCommit,
  className,
}: {
  initial: number | null;
  step?: string;
  nullable?: boolean;
  onCommit: (v: number | null) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const t = value.trim();
        if (t === "" && nullable) { onCommit(null); return; }
        const n = parseFloat(t);
        if (Number.isFinite(n)) onCommit(n);
      }}
      className={`${inp} tabular-nums ${className ?? ""}`}
    />
  );
}
