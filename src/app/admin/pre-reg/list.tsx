"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePreRegVehicleAction, markPreRegAvailableAction, markPreRegSoldAction } from "./actions";

export interface PreRegRow {
  id: string;
  bucket: string;
  variant: string | null;
  derivative: string | null;
  colour: string;
  engine: string | null;
  regNumber: string;
  registeredAt: string;
  dealer: string | null;
  status: string;
  soldAt: string | null;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function Row({ v }: { v: PreRegRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const sold = v.status === "sold";

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <tr className={sold ? "bg-slate-50/70" : undefined}>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">
          {v.bucket} {v.variant} {v.derivative && <span className="text-slate-500">{v.derivative}</span>}
        </div>
        <div className="text-xs text-slate-500">{v.colour}{v.engine ? ` · ${v.engine}` : ""}</div>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-slate-800">{v.regNumber}</td>
      <td className="px-4 py-3 text-sm text-slate-700 tabular-nums">{fmt(v.registeredAt)}</td>
      <td className="px-4 py-3 text-xs text-slate-500">{v.dealer ?? "—"}</td>
      <td className="px-4 py-3">
        {sold ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
            Sold {v.soldAt ? fmt(v.soldAt) : ""}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
            On stock list
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {confirming ? (
          <span className="space-x-3 text-xs">
            <span className="text-red-700">Invoiced? This deletes it permanently.</span>
            <button onClick={() => run(() => deletePreRegVehicleAction(v.id))} disabled={pending} className="font-semibold text-red-700 hover:text-red-900 disabled:opacity-50">
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-slate-600 hover:text-slate-900">Cancel</button>
          </span>
        ) : (
          <span className="space-x-3 text-xs">
            {sold ? (
              <>
                <button onClick={() => run(() => markPreRegAvailableAction(v.id))} disabled={pending} className="font-medium text-slate-700 hover:text-slate-900 disabled:opacity-50">
                  Put back on stock
                </button>
                <button onClick={() => setConfirming(true)} disabled={pending} className="text-red-600 hover:text-red-800 disabled:opacity-50">
                  Mark invoiced
                </button>
              </>
            ) : (
              <button onClick={() => run(() => markPreRegSoldAction(v.id))} disabled={pending} className="font-medium text-slate-700 hover:text-slate-900 disabled:opacity-50">
                Mark sold
              </button>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

export function PreRegList({ vehicles }: { vehicles: PreRegRow[] }) {
  const live = vehicles.filter((v) => v.status !== "sold");
  const sold = vehicles.filter((v) => v.status === "sold");

  const table = (rows: PreRegRow[], empty: string) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Vehicle</th>
            <th className="px-4 py-3 text-left font-medium">Reg</th>
            <th className="px-4 py-3 text-left font-medium">Registered</th>
            <th className="px-4 py-3 text-left font-medium">Dealer</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((v) => <Row key={v.id} v={v} />)}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          On the stock list <span className="font-normal text-slate-400">({live.length})</span>
        </h2>
        {table(live, "No pre-registered vehicles yet — add one above.")}
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-medium text-slate-700">
          Sold <span className="font-normal text-slate-400">({sold.length})</span>
        </h2>
        <p className="mb-2 text-xs text-slate-500">
          Off both stock lists, but kept here — sales fall through, and putting one back should not mean typing it
          again. Marking it invoiced deletes it for good.
        </p>
        {table(sold, "Nothing sold.")}
      </section>
    </>
  );
}
