"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createEvOfferAction,
  createTestDriveOfferAction,
  createTradeInOfferAction,
  deleteEvOfferAction,
  deleteTestDriveOfferAction,
  deleteTradeInOfferAction,
  setEvOfferActiveAction,
  setTestDriveOfferActiveAction,
  setTradeInOfferActiveAction,
} from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";

function formatGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB");
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">Active</span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">Disabled</span>
  );
}

// ─── EV offers ──────────────────────────────────────────────────────────────

interface EvRow {
  id: string;
  label: string;
  cashAlternativeGbp: number;
  wallboxLabel: string;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  active: boolean;
}

export function EvOffersSection({ rows }: { rows: EvRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("Ford Power Promise");
  const [cash, setCash] = useState("500");
  const [wallbox, setWallbox] = useState("Free home wallbox (incl. installation)");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createEvOfferAction({
        label, cashAlternativeGbp: parseFloat(cash) || 0, wallboxLabel: wallbox,
        validFrom: from || null, validUntil: until || null, notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setLabel("Ford Power Promise"); setCash("500"); setWallbox("Free home wallbox (incl. installation)"); setFrom(""); setUntil(""); setNotes("");
      router.refresh();
    });
  }
  function toggle(r: EvRow) { start(async () => { await setEvOfferActiveAction(r.id, !r.active); router.refresh(); }); }
  function del(r: EvRow) {
    if (!confirm(`Delete "${r.label}"?`)) return;
    start(async () => { await deleteEvOfferAction(r.id); router.refresh(); });
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-slate-700">EV Power Promise (wallbox or cash)</h2>
      <p className="mb-3 text-xs text-slate-500">Detected on any vehicle in an EV bucket (Mach-E, E-Transit, etc.). Broker presents the customer the wallbox vs cash choice.</p>
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
            Programme label
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inp} mt-1 w-full`} required />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Cash alternative £ (inc VAT)
            <input type="number" step="0.01" min={0} value={cash} onChange={(e) => setCash(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} required />
          </label>
          <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
            Wallbox option text
            <input value={wallbox} onChange={(e) => setWallbox(e.target.value)} className={`${inp} mt-1 w-full`} required />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Valid from <span className="text-slate-400">(optional)</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Valid until <span className="text-slate-400">(optional)</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Notes <span className="text-slate-400">(optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Adding…" : "Add EV offer"}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </form>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Programme</th>
              <th className="px-3 py-2 text-right font-medium">Cash alt</th>
              <th className="px-3 py-2 text-left font-medium">Wallbox label</th>
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
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatGbp(r.cashAlternativeGbp)}</td>
                <td className="px-3 py-2 text-xs text-slate-700">{r.wallboxLabel}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.validFrom)} → {fmtDate(r.validUntil)}</td>
                <td className="px-3 py-2"><StatusBadge active={r.active} /></td>
                <td className="px-3 py-2 text-right space-x-3 whitespace-nowrap">
                  <button onClick={() => toggle(r)} disabled={pending} className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50">{r.active ? "Disable" : "Enable"}</button>
                  <button onClick={() => del(r)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No EV offers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Trade-in & Test-drive share the same shape with one difference:
//     trade-in T&Cs are mandatory (we display them on every quote),
//     test-drive T&Cs are optional. The OfferLikeSection helper
//     captures the shared form + table; the two top-level sections
//     just pass through the right copy and actions. ─────────────────────────

interface OfferRow {
  id: string;
  label: string;
  amountGbp: number;
  termsText: string | null;
  vehicleClass: string | null;
  bucket: string | null;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

function OfferLikeSection(props: {
  heading: string;
  subheading: string;
  termsRequired: boolean;
  defaultLabel: string;
  rows: OfferRow[];
  onCreate: (input: {
    label: string;
    amountGbp: number;
    termsText: string;
    vehicleClass: string | null;
    bucket: string | null;
    validFrom: string | null;
    validUntil: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState(props.defaultLabel);
  const [amount, setAmount] = useState("");
  const [terms, setTerms] = useState("");
  const [vClass, setVClass] = useState<"" | "car" | "van">("");
  const [bucket, setBucket] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (props.termsRequired && !terms.trim()) { setError("Terms text is required."); return; }
    start(async () => {
      const res = await props.onCreate({
        label, amountGbp: parseFloat(amount) || 0, termsText: terms,
        vehicleClass: vClass || null, bucket: bucket.trim() || null,
        validFrom: from || null, validUntil: until || null,
      });
      if (!res.ok) { setError(res.error ?? "Failed."); return; }
      setLabel(props.defaultLabel); setAmount(""); setTerms(""); setVClass(""); setBucket(""); setFrom(""); setUntil("");
      router.refresh();
    });
  }
  function toggle(r: OfferRow) { start(async () => { await props.onToggle(r.id, !r.active); router.refresh(); }); }
  function del(r: OfferRow) {
    if (!confirm(`Delete "${r.label}"?`)) return;
    start(async () => { await props.onDelete(r.id); router.refresh(); });
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-slate-700">{props.heading}</h2>
      <p className="mb-3 text-xs text-slate-500">{props.subheading}</p>
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${inp} mt-1 w-full`} required />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Amount £
            <input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inp} mt-1 w-full tabular-nums`} required />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Vehicle class
            <select value={vClass} onChange={(e) => setVClass(e.target.value as "" | "car" | "van")} className={`${inp} mt-1 w-full`}>
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
            Valid from <span className="text-slate-400">(optional)</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Valid until <span className="text-slate-400">(optional)</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
            Terms text {props.termsRequired ? <span className="text-red-600">(required — shown on every quote)</span> : <span className="text-slate-400">(optional)</span>}
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className={`${inp} mt-1 w-full`} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Adding…" : "Add"}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </form>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Programme</th>
              <th className="px-3 py-2 text-left font-medium">Scope</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Valid</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {props.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-900">
                  <div className="font-medium">{r.label}</div>
                  {r.termsText && <div className="text-[11px] text-slate-500 line-clamp-2">{r.termsText}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {r.vehicleClass ? r.vehicleClass.toUpperCase() : "Any"}{r.bucket && <> · {r.bucket}</>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatGbp(r.amountGbp)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.validFrom)} → {fmtDate(r.validUntil)}</td>
                <td className="px-3 py-2"><StatusBadge active={r.active} /></td>
                <td className="px-3 py-2 text-right space-x-3 whitespace-nowrap">
                  <button onClick={() => toggle(r)} disabled={pending} className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50">{r.active ? "Disable" : "Enable"}</button>
                  <button onClick={() => del(r)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
            {props.rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No programmes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TradeInOffersSection({ rows }: { rows: OfferRow[] }) {
  return (
    <OfferLikeSection
      heading="Trade-in allowance"
      subheading="Fixed £ off when the customer is part-exchanging. T&Cs are required — they print onto every quote that includes the trade-in."
      termsRequired
      defaultLabel="Trade-in allowance"
      rows={rows}
      onCreate={async (i) => createTradeInOfferAction(i)}
      onToggle={async (id, active) => { await setTradeInOfferActiveAction(id, active); }}
      onDelete={async (id) => { await deleteTradeInOfferAction(id); }}
    />
  );
}

export function TestDriveOffersSection({ rows }: { rows: OfferRow[] }) {
  return (
    <OfferLikeSection
      heading="Test-drive incentive"
      subheading="Credit applied when the customer takes a test drive on the vehicle being quoted."
      termsRequired={false}
      defaultLabel="Test-drive incentive"
      rows={rows}
      onCreate={async (i) => createTestDriveOfferAction({ ...i, termsText: i.termsText.trim() || null })}
      onToggle={async (id, active) => { await setTestDriveOfferActiveAction(id, active); }}
      onDelete={async (id) => { await deleteTestDriveOfferAction(id); }}
    />
  );
}
