"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeOutright, formatGbp } from "@/lib/broker-quote-pricing";
import { saveOutrightQuoteAction } from "./actions";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums";

interface Props {
  ref: string;
  snapshotJson: string;
}

export function OutrightQuoteForm({ ref, snapshotJson }: Props) {
  const router = useRouter();
  const [customerType, setCustomerType] = useState<"retail" | "business">("retail");
  const [vatBusiness, setVatBusiness] = useState(false);
  const [vehicleCash, setVehicleCash] = useState("");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => computeOutright({
    vehicleCashGbp: parseFloat(vehicleCash) || 0,
    commissionExVatGbp: parseFloat(commission) || 0,
  }), [vehicleCash, commission]);

  const canSave = parseFloat(vehicleCash) > 0;

  function save() {
    if (!canSave) { setError("Enter a vehicle cash price first."); return; }
    setError(null);
    start(async () => {
      const res = await saveOutrightQuoteAction({
        ref,
        snapshotJson,
        customerType,
        customerIsVatBusiness: customerType === "business" ? vatBusiness : false,
        vehicleCashGbp: parseFloat(vehicleCash) || 0,
        commissionExVatGbp: parseFloat(commission) || 0,
        notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      router.push(`/broker/quotes/${res.quoteId}`);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={customerType === "retail"} onChange={() => setCustomerType("retail")} className="h-4 w-4" />
            <span>Retail / personal</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={customerType === "business"} onChange={() => setCustomerType("business")} className="h-4 w-4" />
            <span>Business</span>
          </label>
        </div>
        {customerType === "business" && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={vatBusiness} onChange={(e) => setVatBusiness(e.target.checked)} className="h-4 w-4" />
            Customer is VAT registered
          </label>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Pricing</h2>
        <p className="mt-1 text-xs text-slate-500">
          Phase 4 will pre-fill the vehicle cash price from the admin-managed cash-value table. For now,
          enter the cash price you&apos;ve agreed with TrustFord.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Vehicle cash price (£)
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={vehicleCash}
              onChange={(e) => setVehicleCash(e.target.value)}
              className={inp}
              required
            />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Your commission, ex VAT (£)
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className={inp}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
          <Row label="Vehicle cash" value={formatGbp(totals.vehicleCashGbp)} />
          <Row label="Your commission" value={formatGbp(totals.commissionExVatGbp)} />
          <Row label="VAT on commission (20%)" value={formatGbp(totals.commissionVatGbp)} />
          <div className="my-1 border-t border-slate-200" />
          <Row label={<strong>Customer pays</strong>} value={<strong className="text-slate-900">{formatGbp(totals.customerTotalGbp)}</strong>} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Notes <span className="text-xs font-normal text-slate-400">(optional)</span></h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything we should know — colour preference, delivery deadline, customer context."
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </section>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{error}</div>}

      <div className="flex justify-end gap-2">
        <button
          onClick={save}
          disabled={pending || !canSave}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save quote"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
