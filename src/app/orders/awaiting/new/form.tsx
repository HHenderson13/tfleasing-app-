"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAwaitingDealAction } from "../actions";

export function AddDealForm({ execs }: { execs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [model, setModel] = useState("");
  const [derivative, setDerivative] = useState("");
  const [vin, setVin] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [salesExecId, setSalesExecId] = useState(execs[0]?.id ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const vinClean = vin.trim().toUpperCase();
    const orderClean = orderNumber.trim();
    if (!vinClean && !orderClean) {
      setErr("Enter a VIN or an order number.");
      return;
    }
    if (vinClean && !/^[A-Z0-9]{11}$/.test(vinClean)) {
      setErr("VIN must be exactly 11 characters (letters and numbers only).");
      return;
    }
    if (!salesExecId) {
      setErr("Allocate to an exec.");
      return;
    }
    start(async () => {
      const res = await createAwaitingDealAction({
        customerName,
        businessName: businessName.trim() || null,
        model,
        derivative,
        vin: vinClean || null,
        orderNumber: orderClean || null,
        salesExecId,
      });
      if (!res.ok) setErr(res.error);
      else router.push("/orders/awaiting");
    });
  }

  const inp = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const lbl = "text-xs font-medium text-slate-700";

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Customer name</label>
          <input className={inp} value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </div>
        <div>
          <label className={lbl}>Business name (optional)</label>
          <input className={inp} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Model</label>
          <input className={inp} value={model} onChange={(e) => setModel(e.target.value)} required />
        </div>
        <div>
          <label className={lbl}>Derivative</label>
          <input className={inp} value={derivative} onChange={(e) => setDerivative(e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>VIN</label>
          <input className={inp} value={vin} onChange={(e) => setVin(e.target.value)} placeholder="11 chars" />
        </div>
        <div>
          <label className={lbl}>Order number</label>
          <input className={inp} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">VIN or order number required — ETA / location auto-populates from the next stock upload, or can be edited later on the awaiting list.</p>
      <div>
        <label className={lbl}>Allocate to exec</label>
        <select className={inp} value={salesExecId} onChange={(e) => setSalesExecId(e.target.value)} required>
          {execs.length === 0 && <option value="">No execs configured</option>}
          {execs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{err}</div>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push("/orders/awaiting")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : "Add deal"}
        </button>
      </div>
    </form>
  );
}
