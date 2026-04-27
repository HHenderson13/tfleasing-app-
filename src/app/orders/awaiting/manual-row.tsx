"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateManualEtaAction } from "./actions";

export function ManualEtaEditor({
  proposalId,
  initialEta,
  initialLocation,
  lastUpdatedAt,
}: {
  proposalId: string;
  initialEta: string | null; // ISO yyyy-mm-dd
  initialLocation: string | null;
  lastUpdatedAt: string | null;
}) {
  const router = useRouter();
  const initialDelivered = (initialLocation ?? "").toUpperCase() === "DELIVERED";
  const [delivered, setDelivered] = useState(initialDelivered);
  const [eta, setEta] = useState(initialEta ?? "");
  const [loc, setLoc] = useState(initialDelivered ? "" : (initialLocation ?? ""));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    start(async () => {
      const res = await updateManualEtaAction(proposalId, {
        manualEtaAt: delivered ? null : (eta || null),
        manualLocation: delivered ? "DELIVERED" : (loc || null),
      });
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }

  const currentEta = delivered ? "" : eta;
  const currentLoc = delivered ? "DELIVERED" : loc;
  const dirty =
    currentEta !== (initialEta ?? "") ||
    (currentLoc || "") !== (initialLocation ?? "");

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] ring-1 ring-amber-200">
      <span className="font-medium text-amber-800">Manual entry</span>
      <label className="flex items-center gap-1 text-amber-900">
        <input
          type="checkbox"
          checked={delivered}
          onChange={(e) => setDelivered(e.target.checked)}
        />
        Delivered
      </label>
      {!delivered && (
        <>
          <label className="flex items-center gap-1 text-amber-900">
            ETA
            <input
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              className="rounded border border-amber-300 bg-white px-1 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1 text-amber-900">
            Location
            <input
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              placeholder="e.g. AT DEALER"
              className="w-36 rounded border border-amber-300 bg-white px-1 py-0.5"
            />
          </label>
        </>
      )}
      <button
        type="button"
        onClick={save}
        disabled={!dirty || pending}
        className="rounded bg-amber-600 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {lastUpdatedAt && (
        <span className="text-amber-700">updated {new Date(lastUpdatedAt).toLocaleDateString("en-GB")}</span>
      )}
      {err && <span className="text-red-600">{err}</span>}
    </div>
  );
}
