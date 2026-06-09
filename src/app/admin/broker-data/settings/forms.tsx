"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCarRflBandAction,
  deleteCarRflBandAction,
  updateBrokerSettingsAction,
  updateCarRflBandAction,
} from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums";

interface Settings {
  firstRegFeeGbp: number;
  pdiPlatesGbp: number;
  cvRflIcePhevGbp: number;
  cvRflBevGbp: number;
}

interface CarRflBand {
  id: string;
  co2From: number;
  co2To: number;
  rflGbp: number;
}

export function GlobalSettingsCard({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function commit(patch: Partial<Settings>) {
    start(async () => { await updateBrokerSettingsAction(patch); router.refresh(); });
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Global figures</h2>
      <p className="mt-1 text-xs text-slate-500">
        Applied to every vehicle in the universal pricing model. Changes save on blur.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NumField label="First registration fee (£)" hint="Same across cars + CVs" initial={settings.firstRegFeeGbp} onCommit={(v) => commit({ firstRegFeeGbp: v })} />
        <NumField label="PDI + plates (£)" hint="Pre-delivery inspection" initial={settings.pdiPlatesGbp} onCommit={(v) => commit({ pdiPlatesGbp: v })} />
        <NumField label="CV RFL — ICE + PHEV (£)" hint="Commercial vehicles, internal combustion or plug-in hybrid" initial={settings.cvRflIcePhevGbp} onCommit={(v) => commit({ cvRflIcePhevGbp: v })} />
        <NumField label="CV RFL — BEV (£)" hint="Commercial battery electric — often £0" initial={settings.cvRflBevGbp} onCommit={(v) => commit({ cvRflBevGbp: v })} />
      </div>
      {pending && <p className="mt-2 text-[11px] text-slate-400">Saving…</p>}
    </div>
  );
}

export function CarRflBandsCard({ bands }: { bands: CarRflBand[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [co2From, setCo2From] = useState("");
  const [co2To, setCo2To] = useState("");
  const [rfl, setRfl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createCarRflBandAction({
        co2From: parseFloat(co2From) || 0,
        co2To: parseFloat(co2To) || 0,
        rflGbp: parseFloat(rfl) || 0,
      });
      if (!res.ok) { setError(res.error); return; }
      setCo2From(""); setCo2To(""); setRfl("");
      router.refresh();
    });
  }
  function commit(id: string, patch: Partial<CarRflBand>) {
    start(async () => { await updateCarRflBandAction(id, patch); router.refresh(); });
  }
  function del(id: string) {
    if (!confirm("Delete this band? Cars in this CO2 range will fall through to £0 RFL until a replacement is added.")) return;
    start(async () => { await deleteCarRflBandAction(id); router.refresh(); });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Car RFL by CO2</h2>
      <p className="mt-1 text-xs text-slate-500">
        Cars have band-based RFL keyed on g/km CO2. Add inclusive [from, to] bands — the quote engine
        picks the first band whose range contains the car&apos;s CO2.
      </p>

      <form onSubmit={add} className="mt-4 grid gap-2 sm:grid-cols-4">
        <label className="block text-xs font-medium text-slate-700">
          CO2 from (g/km)
          <input type="number" min={0} step={1} value={co2From} onChange={(e) => setCo2From(e.target.value)} className={`${inp} mt-1 w-full`} required />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          CO2 to (g/km)
          <input type="number" min={0} step={1} value={co2To} onChange={(e) => setCo2To(e.target.value)} className={`${inp} mt-1 w-full`} required />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          RFL (£)
          <input type="number" min={0} step="0.01" value={rfl} onChange={(e) => setRfl(e.target.value)} className={`${inp} mt-1 w-full`} required />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={pending || !co2From || !co2To || !rfl} className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            Add band
          </button>
        </div>
        {error && <span className="sm:col-span-4 text-xs text-red-600">{error}</span>}
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-right font-medium">CO2 from</th>
              <th className="px-3 py-2 text-right font-medium">CO2 to</th>
              <th className="px-3 py-2 text-right font-medium">RFL £</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bands.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2 text-right">
                  <BlurNumber initial={b.co2From} step="1" onCommit={(v) => v !== null && commit(b.id, { co2From: v })} className="w-20 text-right" />
                </td>
                <td className="px-3 py-2 text-right">
                  <BlurNumber initial={b.co2To} step="1" onCommit={(v) => v !== null && commit(b.id, { co2To: v })} className="w-20 text-right" />
                </td>
                <td className="px-3 py-2 text-right">
                  <BlurNumber initial={b.rflGbp} step="0.01" onCommit={(v) => v !== null && commit(b.id, { rflGbp: v })} className="w-24 text-right" />
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => del(b.id)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
            {bands.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">No bands yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NumField({ label, hint, initial, onCommit }: { label: string; hint?: string; initial: number; onCommit: (v: number) => void }) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      {hint && <span className="ml-1 text-[10px] font-normal text-slate-400">{hint}</span>}
      <BlurNumber initial={initial} step="0.01" onCommit={(v) => v !== null && onCommit(v)} className="mt-1 w-full" />
    </label>
  );
}

function BlurNumber({
  initial, step, onCommit, className,
}: {
  initial: number; step?: string; onCommit: (v: number | null) => void; className?: string;
}) {
  const [value, setValue] = useState(String(initial));
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = parseFloat(value);
        if (Number.isFinite(n)) onCommit(n);
      }}
      className={`${inp} ${className ?? ""}`}
    />
  );
}
