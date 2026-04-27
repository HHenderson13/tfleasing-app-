"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeStatusAction, updateOrderFieldsAction } from "@/app/proposals/actions";

export function DealEditor({
  proposalId,
  initialModel,
  initialDerivative,
  initialOrderNumber,
  initialVin,
  showVehicleIds,
}: {
  proposalId: string;
  initialModel: string;
  initialDerivative: string;
  initialOrderNumber: string | null;
  initialVin: string | null;
  showVehicleIds: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(initialModel);
  const [derivative, setDerivative] = useState(initialDerivative);
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber ?? "");
  const [vin, setVin] = useState(initialVin ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    model.trim() !== initialModel ||
    derivative.trim() !== initialDerivative ||
    (orderNumber.trim() || null) !== (initialOrderNumber ?? null) ||
    (vin.trim().toUpperCase() || null) !== (initialVin ?? null);

  function save() {
    setErr(null);
    if (showVehicleIds && vin.trim()) {
      const v = vin.trim().toUpperCase();
      if (!/^[A-Z0-9]{11}$/.test(v)) {
        setErr("VIN must be exactly 11 characters (letters and numbers only).");
        return;
      }
    }
    start(async () => {
      const res = await updateOrderFieldsAction(proposalId, {
        model: model.trim(),
        derivative: derivative.trim(),
        ...(showVehicleIds ? { orderNumber: orderNumber.trim() || null, vin: vin.trim().toUpperCase() || null } : {}),
      });
      if (!res.ok) setErr(res.error);
      else { setOpen(false); router.refresh(); }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:underline"
      >
        Edit deal
      </button>
    );
  }

  const inp = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs";
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Model</span>
          <input className={inp} value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Derivative</span>
          <input className={inp} value={derivative} onChange={(e) => setDerivative(e.target.value)} />
        </label>
        {showVehicleIds && (
          <>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Order number</span>
              <input className={inp} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">VIN</span>
              <input className={inp} value={vin} onChange={(e) => setVin(e.target.value)} />
            </label>
          </>
        )}
      </div>
      {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function CancelDealButton({ proposalId, currentStatus }: { proposalId: string; currentStatus: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (currentStatus === "cancelled") {
    return <span className="text-[11px] font-medium text-rose-600">Cancelled</span>;
  }

  function submit() {
    if (!reason.trim()) { setErr("Reason is required."); return; }
    setErr(null);
    start(async () => {
      const res = await changeStatusAction(proposalId, "cancelled", reason.trim());
      if (!res.ok) setErr(res.error);
      else { setOpen(false); setReason(""); router.refresh(); }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
      >
        Cancel deal
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
      <div className="font-medium text-rose-800">Cancel this deal</div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required) — e.g. customer pulled out, vehicle no longer available…"
        rows={2}
        className="mt-2 w-full rounded-md border border-rose-300 bg-white px-2 py-1 text-xs"
      />
      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
          Back
        </button>
        <button type="button" onClick={submit} disabled={pending} className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50">
          {pending ? "Cancelling…" : "Confirm cancel"}
        </button>
      </div>
    </div>
  );
}
