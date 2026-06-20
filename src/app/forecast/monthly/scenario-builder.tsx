"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addScenarioAction, updateScenarioAction, deleteScenarioAction } from "../actions";
import type { VehicleAverages } from "./car-forecast";

interface ScenarioRow {
  id: string;
  vehicleId: string;
  chassisGpPerUnit: number;
  units: number;
}

interface Vehicle {
  id: string;
  name: string;
  fuelType: "ice" | "bev";
}

interface Props {
  month: string;
  scenarios: ScenarioRow[];
  vehicles: Vehicle[];
  averages: Map<string, VehicleAverages>;
}

// Per-model forecast scenario builder. Each row says "I expect N more
// units of this vehicle at £X chassis per unit". F&I, Standards margin,
// Stocking credits, Quarter / Half-Year DPA and Pot of Gold all scale
// off the vehicle's history + per-vehicle bonus rates automatically.

export function ScenarioBuilder({ month, scenarios, vehicles, averages }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => router.refresh();

  function add(formData: FormData) {
    setErr(null);
    start(async () => {
      const res = await addScenarioAction({
        monthYyyymm: month,
        vehicleId: String(formData.get("vehicleId") ?? ""),
        chassisGpPerUnit: Number(formData.get("chassisGpPerUnit") ?? 0),
        units: Number(formData.get("units") ?? 0),
      });
      if (!res.ok) setErr(res.error); else refresh();
    });
  }

  function update(id: string, patch: { chassisGpPerUnit?: number; units?: number; vehicleId?: string }) {
    setErr(null);
    start(async () => {
      const res = await updateScenarioAction({ id, ...patch });
      if (!res.ok) setErr(res.error); else refresh();
    });
  }

  function remove(id: string) {
    setErr(null);
    start(async () => {
      const res = await deleteScenarioAction(id);
      if (!res.ok) setErr(res.error); else refresh();
    });
  }

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? id;
  const totalScenarioUnits = scenarios.reduce((acc, s) => acc + s.units, 0);
  const totalScenarioChassis = scenarios.reduce((acc, s) => acc + s.chassisGpPerUnit * s.units, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Forecast scenarios</h3>
            <p className="mt-1 text-sm text-slate-500">
              Add units you expect on top of the dealbook. Pick the model + set chassis £ per unit
              and the volume — F&I, Standards, Stocking, DPA and Pot of Gold scale off this
              vehicle's all-year averages and its per-vehicle bonus rates.
            </p>
          </div>
          {totalScenarioUnits > 0 && (
            <div className="rounded-xl bg-slate-900 px-3 py-2 text-right text-xs font-semibold text-white">
              <div>+{totalScenarioUnits} units</div>
              <div className="opacity-80">+£{Math.round(totalScenarioChassis).toLocaleString("en-GB")} chassis</div>
            </div>
          )}
        </div>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      </div>

      {scenarios.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Model</th>
                <th className="px-3 py-2.5 text-right font-medium w-32">Chassis £/unit</th>
                <th className="px-3 py-2.5 text-right font-medium w-24">Units</th>
                <th className="px-3 py-2.5 text-right font-medium w-32">Chassis total</th>
                <th className="px-5 py-2.5 text-left font-medium">Averages used (£ Basic · F&I)</th>
                <th className="px-5 py-2.5 text-right font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, idx) => {
                const avg = averages.get(s.vehicleId);
                const avgBasic = avg ? Math.round(avg.basic) : 0;
                const avgFi = avg ? Math.round(avg.financeIncome + avg.alloyIncome + avg.gapIncome + avg.paintIncome + avg.warrantyIncome) : 0;
                return (
                  <tr key={s.id} className={`border-t border-slate-100 ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                    <td className="px-5 py-2">
                      <select
                        defaultValue={s.vehicleId}
                        disabled={pending}
                        onChange={(e) => update(s.id, { vehicleId: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-medium"
                      >
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>{v.name} ({v.fuelType.toUpperCase()})</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="1" defaultValue={s.chassisGpPerUnit} disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== s.chassisGpPerUnit) update(s.id, { chassisGpPerUnit: v });
                        }}
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="1" defaultValue={s.units} disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== s.units) update(s.id, { units: v });
                        }}
                        className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      £{Math.round(s.chassisGpPerUnit * s.units).toLocaleString("en-GB")}
                    </td>
                    <td className="px-5 py-2 text-[11px] text-slate-500">
                      {avg ? (
                        <>
                          {avg.units} units in history · avg Basic £{avgBasic.toLocaleString("en-GB")} · avg F&I £{avgFi.toLocaleString("en-GB")}
                        </>
                      ) : (
                        <span className="text-amber-700">No history for {vehicleName(s.vehicleId)} yet — F&I + DPA contributions will be £0 until some lines land.</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-right">
                      <button type="button" onClick={() => remove(s.id)} disabled={pending}
                        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50">Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form action={add} className="border-t border-slate-200 bg-slate-50/60 px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Model</span>
            <select name="vehicleId" required defaultValue=""
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">
              <option value="" disabled>Pick a model…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.fuelType.toUpperCase()})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Chassis £/unit</span>
            <input type="number" step="1" name="chassisGpPerUnit" required defaultValue="0"
              className="mt-1 w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-right text-sm tabular-nums" />
          </label>
          <label className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Units</span>
            <input type="number" step="1" name="units" required defaultValue="0"
              className="mt-1 w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-right text-sm tabular-nums" />
          </label>
          <button type="submit" disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            + Add scenario
          </button>
        </div>
      </form>
    </section>
  );
}
