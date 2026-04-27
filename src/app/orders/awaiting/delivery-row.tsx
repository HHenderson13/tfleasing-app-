"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeStatusAction, setStageCheckAction, updateOrderFieldsAction } from "../../proposals/actions";

type Check = { id: string; label: string; checked: boolean };

export function DeliveryEditor({
  proposalId,
  initialBookedAt,
  initialRegNumber,
  checks,
}: {
  proposalId: string;
  initialBookedAt: string | null; // ISO yyyy-mm-dd
  initialRegNumber: string | null;
  checks: Check[];
}) {
  const router = useRouter();
  const [bookedAt, setBookedAt] = useState(initialBookedAt ?? "");
  const [reg, setReg] = useState(initialRegNumber ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const fieldsDirty =
    bookedAt !== (initialBookedAt ?? "") ||
    reg.trim().toUpperCase() !== (initialRegNumber ?? "");

  const allChecked = checks.every((c) => c.checked);
  const canMarkDelivered = !!bookedAt && allChecked;

  function saveFields() {
    setErr(null);
    start(async () => {
      const res = await updateOrderFieldsAction(proposalId, {
        deliveryBookedAt: bookedAt ? new Date(bookedAt) : null,
        regNumber: reg.trim() || null,
      });
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }

  function toggleCheck(id: string, value: boolean) {
    setErr(null);
    start(async () => {
      const res = await setStageCheckAction(proposalId, id, value);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }

  function markDelivered() {
    setErr(null);
    start(async () => {
      const res = await changeStatusAction(proposalId, "delivered");
      if (!res.ok) setErr(res.error);
      else if (res.nextPage) router.push(res.nextPage);
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-teal-50 px-3 py-2 text-[12px] ring-1 ring-teal-200">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-teal-800">Customer delivery</span>
        <label className="flex items-center gap-1 text-teal-900">
          Date
          <input
            type="date"
            value={bookedAt}
            onChange={(e) => setBookedAt(e.target.value)}
            className="rounded border border-teal-300 bg-white px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-1 text-teal-900">
          Reg
          <input
            value={reg}
            onChange={(e) => setReg(e.target.value)}
            placeholder="optional"
            className="w-28 rounded border border-teal-300 bg-white px-1 py-0.5 uppercase"
          />
        </label>
        <button
          type="button"
          onClick={saveFields}
          disabled={!fieldsDirty || pending}
          className="rounded bg-teal-600 px-2 py-0.5 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {checks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {checks.map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-teal-900">
              <input
                type="checkbox"
                checked={c.checked}
                disabled={pending}
                onChange={(e) => toggleCheck(c.id, e.currentTarget.checked)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={markDelivered}
          disabled={!canMarkDelivered || pending}
          className="rounded bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40"
        >
          Mark as delivered →
        </button>
        {!bookedAt && <span className="text-[11px] text-teal-700">Set delivery date first.</span>}
        {bookedAt && !allChecked && <span className="text-[11px] text-teal-700">Tick all checks first.</span>}
        {err && <span className="text-red-600">{err}</span>}
      </div>
    </div>
  );
}
