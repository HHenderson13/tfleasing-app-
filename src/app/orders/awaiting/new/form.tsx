"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAwaitingDealAction } from "../actions";

export function AddDealForm({ funders }: { funders: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [model, setModel] = useState("");
  const [derivative, setDerivative] = useState("");
  const [funderId, setFunderId] = useState(funders[0]?.id ?? "");
  const [contract, setContract] = useState<"PCH" | "BCH">("BCH");
  const [maintenance, setMaintenance] = useState<"customer" | "maintained">("customer");
  const [termMonths, setTermMonths] = useState(48);
  const [annualMileage, setAnnualMileage] = useState(10000);
  const [monthlyRental, setMonthlyRental] = useState("");
  const [vin, setVin] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [financeProposalNumber, setFinanceProposalNumber] = useState("");
  const [manualEtaAt, setManualEtaAt] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [delivered, setDelivered] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const monthly = parseFloat(monthlyRental);
    if (Number.isNaN(monthly)) { setErr("Monthly rental must be a number"); return; }
    const vinClean = vin.trim().toUpperCase();
    if (vinClean && !/^[A-Z0-9]{11}$/.test(vinClean)) {
      setErr("VIN must be exactly 11 characters (letters and numbers only).");
      return;
    }
    start(async () => {
      const res = await createAwaitingDealAction({
        customerName,
        model,
        derivative,
        funderId,
        monthlyRental: monthly,
        termMonths,
        annualMileage,
        contract,
        maintenance,
        vin: vinClean || null,
        orderNumber: orderNumber || null,
        financeProposalNumber: financeProposalNumber || null,
        manualEtaAt: delivered ? null : (manualEtaAt || null),
        manualLocation: delivered ? "DELIVERED" : (manualLocation || null),
      });
      if (!res.ok) setErr(res.error);
      else router.push("/orders/awaiting");
    });
  }

  const inp = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const lbl = "text-xs font-medium text-slate-700";

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <label className={lbl}>Customer name</label>
        <input className={inp} value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
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
          <label className={lbl}>Funder</label>
          <select className={inp} value={funderId} onChange={(e) => setFunderId(e.target.value)} required>
            {funders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Monthly rental (£)</label>
          <input className={inp} value={monthlyRental} onChange={(e) => setMonthlyRental(e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className={lbl}>Contract</label>
          <select className={inp} value={contract} onChange={(e) => setContract(e.target.value as "PCH" | "BCH")}>
            <option value="BCH">BCH</option>
            <option value="PCH">PCH</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Maintenance</label>
          <select className={inp} value={maintenance} onChange={(e) => setMaintenance(e.target.value as "customer" | "maintained")}>
            <option value="customer">Customer</option>
            <option value="maintained">Maintained</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Term (months)</label>
          <input type="number" className={inp} value={termMonths} onChange={(e) => setTermMonths(parseInt(e.target.value || "0", 10))} required />
        </div>
        <div>
          <label className={lbl}>Mileage</label>
          <input type="number" className={inp} value={annualMileage} onChange={(e) => setAnnualMileage(parseInt(e.target.value || "0", 10))} required />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>VIN</label>
          <input className={inp} value={vin} onChange={(e) => setVin(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Order number</label>
          <input className={inp} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>FP number</label>
          <input className={inp} value={financeProposalNumber} onChange={(e) => setFinanceProposalNumber(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} />
          Already delivered (no ETA / location needed)
        </label>
      </div>
      {!delivered && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Manual ETA</label>
            <input type="date" className={inp} value={manualEtaAt} onChange={(e) => setManualEtaAt(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Location / status</label>
            <input className={inp} value={manualLocation} onChange={(e) => setManualLocation(e.target.value)} placeholder="e.g. AT DEALER, IN TRANSIT" />
          </div>
        </div>
      )}

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
