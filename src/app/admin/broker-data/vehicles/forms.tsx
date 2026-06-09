"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FuelType, ProfitMode } from "@/lib/vehicle-master";
import {
  createVehicleMasterAction,
  createVehicleOptionAction,
  deleteVehicleMasterAction,
  deleteVehicleOptionAction,
  updateVehicleMasterAction,
  updateVehicleOptionAction,
} from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";
const numInp = `${inp} w-full tabular-nums`;

export interface VehicleRow {
  id: string;
  modelYear: string;
  model: string;
  bodystyle: string;
  derivative: string;
  engine: string;
  drive: string;
  transmission: string;
  capCode: string | null;
  capId: string | null;
  basicListPriceGbp: number;
  manufacturerDeliveryGbp: number;
  fuelType: FuelType;
  isVan: boolean;
  co2GKm: number | null;
  pivgGrantGbp: number;
  olevGrantGbp: number;
  oneFDiscountPct: number;
  marginBucketId: string | null;
  profitMode: ProfitMode;
  profitValue: number;
  notes: string | null;
  options: VehicleOptionRow[];
}

export interface VehicleOptionRow {
  id: string;
  optionCode: string | null;
  label: string;
  priceGbp: number;
}

export interface StockCombo {
  modelYear: string;
  model: string;
  bodystyle: string;
  derivative: string;
  engine: string;
  drive: string;
  transmission: string;
  count: number;
}

export interface BucketOption {
  id: string;
  name: string;
}

function gbp(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

// ─── Missing vehicles panel ────────────────────────────────────────────────

export function MissingVehiclesPanel({ stockCombos, buckets }: { stockCombos: StockCombo[]; buckets: BucketOption[] }) {
  const [adding, setAdding] = useState<StockCombo | null>(null);
  if (stockCombos.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
        Every vehicle currently in stock has a pricing entry. 🎉
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="text-sm font-semibold text-amber-900">
        {stockCombos.length.toLocaleString()} stock combination{stockCombos.length === 1 ? "" : "s"} without pricing
      </div>
      <p className="mt-1 text-xs text-amber-900/80">
        These are unique (model year × model × bodystyle × derivative × engine × drive × transmission)
        combos in the live stock report that don&apos;t yet have a pricing entry below. Sorted by stock volume.
      </p>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-amber-50 text-[10px] uppercase tracking-wide text-amber-900">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">MY</th>
              <th className="px-2 py-1.5 text-left font-medium">Model</th>
              <th className="px-2 py-1.5 text-left font-medium">Bodystyle</th>
              <th className="px-2 py-1.5 text-left font-medium">Derivative</th>
              <th className="px-2 py-1.5 text-left font-medium">Engine</th>
              <th className="px-2 py-1.5 text-left font-medium">Drive</th>
              <th className="px-2 py-1.5 text-left font-medium">Trans</th>
              <th className="px-2 py-1.5 text-right font-medium">In stock</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stockCombos.map((c, i) => (
              <tr key={i} className="hover:bg-amber-50/40">
                <td className="px-2 py-1.5">{c.modelYear}</td>
                <td className="px-2 py-1.5 font-medium">{c.model}</td>
                <td className="px-2 py-1.5">{c.bodystyle}</td>
                <td className="px-2 py-1.5">{c.derivative}</td>
                <td className="px-2 py-1.5">{c.engine}</td>
                <td className="px-2 py-1.5">{c.drive}</td>
                <td className="px-2 py-1.5">{c.transmission}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{c.count}</td>
                <td className="px-2 py-1.5 text-right">
                  <button onClick={() => setAdding(c)} className="rounded-md bg-amber-900 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-950">Add</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <AddVehicleForm
              prefill={adding}
              buckets={buckets}
              onClose={() => setAdding(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add vehicle form ──────────────────────────────────────────────────────

export function AddVehicleForm({
  prefill,
  buckets,
  onClose,
}: {
  prefill: StockCombo | null;
  buckets: BucketOption[];
  onClose?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modelYear, setModelYear] = useState(prefill?.modelYear ?? "");
  const [model, setModel] = useState(prefill?.model ?? "");
  const [bodystyle, setBodystyle] = useState(prefill?.bodystyle ?? "");
  const [derivative, setDerivative] = useState(prefill?.derivative ?? "");
  const [engine, setEngine] = useState(prefill?.engine ?? "");
  const [drive, setDrive] = useState(prefill?.drive ?? "");
  const [transmission, setTransmission] = useState(prefill?.transmission ?? "");
  const [capCode, setCapCode] = useState("");
  const [capId, setCapId] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [delivery, setDelivery] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("ice");
  // We try to infer car vs van from the model name. Light heuristic —
  // the prefilled combos rarely surprise us, but if it's wrong the
  // admin flips the toggle.
  const [isVan, setIsVan] = useState(() => {
    const m = (prefill?.model ?? "").toUpperCase();
    return /TRANSIT|RANGER|TOURNEO|COURIER/.test(m);
  });
  const [co2, setCo2] = useState("");
  const [pivg, setPivg] = useState("0");
  const [olev, setOlev] = useState("0");
  const [oneF, setOneF] = useState("0");
  const [marginBucketId, setMarginBucketId] = useState("");
  const [profitMode, setProfitMode] = useState<ProfitMode>("gbp");
  const [profitValue, setProfitValue] = useState("500");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createVehicleMasterAction({
        modelYear: modelYear.trim(),
        model: model.trim(),
        bodystyle: bodystyle.trim(),
        derivative: derivative.trim(),
        engine: engine.trim(),
        drive: drive.trim(),
        transmission: transmission.trim(),
        capCode: capCode.trim() || null,
        capId: capId.trim() || null,
        basicListPriceGbp: parseFloat(listPrice) || 0,
        manufacturerDeliveryGbp: parseFloat(delivery) || 0,
        fuelType,
        isVan,
        co2GKm: isVan ? null : (co2.trim() === "" ? null : parseInt(co2, 10)),
        pivgGrantGbp: parseFloat(pivg) || 0,
        olevGrantGbp: parseFloat(olev) || 0,
        oneFDiscountPct: parseFloat(oneF) || 0,
        marginBucketId: marginBucketId || null,
        profitMode,
        profitValue: parseFloat(profitValue) || 0,
        notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      onClose?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">Add vehicle pricing</h3>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        )}
      </div>

      <fieldset className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Vehicle identifier (unique key)</legend>
        <div className="grid gap-2 sm:grid-cols-4">
          <TextField label="Model year" value={modelYear} onChange={setModelYear} required />
          <TextField label="Model" value={model} onChange={setModel} required />
          <TextField label="Bodystyle" value={bodystyle} onChange={setBodystyle} required />
          <TextField label="Derivative" value={derivative} onChange={setDerivative} required />
          <TextField label="Engine" value={engine} onChange={setEngine} required />
          <TextField label="Drive" value={drive} onChange={setDrive} required />
          <TextField label="Transmission" value={transmission} onChange={setTransmission} required />
        </div>
      </fieldset>

      <fieldset className="mt-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Pricing</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <NumField label="Basic list price (£)" value={listPrice} onChange={setListPrice} required />
          <NumField label="Manufacturer delivery (£)" value={delivery} onChange={setDelivery} />
          <NumField label="1F discount (%)" value={oneF} onChange={setOneF} />
        </div>
      </fieldset>

      <fieldset className="mt-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Fuel + RFL</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700">
            Fuel type
            <select value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelType)} className={`${inp} mt-1 w-full`}>
              <option value="ice">ICE (petrol/diesel)</option>
              <option value="phev">PHEV (plug-in hybrid)</option>
              <option value="bev">BEV (electric)</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Car / van
            <select value={isVan ? "van" : "car"} onChange={(e) => setIsVan(e.target.value === "van")} className={`${inp} mt-1 w-full`}>
              <option value="car">Car (CO2 band drives RFL)</option>
              <option value="van">Commercial vehicle (CV RFL applies)</option>
            </select>
          </label>
          {!isVan && (
            <NumField label="CO2 (g/km)" value={co2} onChange={setCo2} hint="Drives the RFL band" />
          )}
        </div>
      </fieldset>

      <fieldset className="mt-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Grants (no VAT)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <NumField label="PiVG grant (£)" value={pivg} onChange={setPivg} />
          <NumField label="OLEV grant (£)" value={olev} onChange={setOlev} />
        </div>
      </fieldset>

      <fieldset className="mt-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Margin + profit</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700">
            Margin bucket
            <select value={marginBucketId} onChange={(e) => setMarginBucketId(e.target.value)} className={`${inp} mt-1 w-full`}>
              <option value="">— no bucket assigned —</option>
              {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Profit mode
            <select value={profitMode} onChange={(e) => setProfitMode(e.target.value as ProfitMode)} className={`${inp} mt-1 w-full`}>
              <option value="gbp">Flat £</option>
              <option value="pct">% of list price</option>
            </select>
          </label>
          <NumField label={profitMode === "gbp" ? "Profit floor (£)" : "Profit floor (%)"} value={profitValue} onChange={setProfitValue} />
        </div>
      </fieldset>

      <fieldset className="mt-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">CAP + notes (optional)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField label="CAP code" value={capCode} onChange={setCapCode} />
          <TextField label="CAP ID" value={capId} onChange={setCapId} />
          <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
        </div>
      </fieldset>

      <div className="mt-4 flex items-center justify-end gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
        )}
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add vehicle"}
        </button>
      </div>
    </form>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`${inp} mt-1 w-full`} required={required} />
    </label>
  );
}

function NumField({ label, value, onChange, required, hint }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      {hint && <span className="ml-1 text-[10px] font-normal text-slate-400">{hint}</span>}
      <input type="number" step="0.01" min={0} value={value} onChange={(e) => onChange(e.target.value)} className={`${numInp} mt-1`} required={required} />
    </label>
  );
}

// ─── Vehicles list ─────────────────────────────────────────────────────────

export function VehiclesList({ vehicles, buckets }: { vehicles: VehicleRow[]; buckets: BucketOption[] }) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return vehicles;
    return vehicles.filter((v) =>
      `${v.model} ${v.modelYear} ${v.derivative} ${v.engine} ${v.transmission} ${v.bodystyle} ${v.capCode ?? ""}`
        .toLowerCase()
        .includes(f),
    );
  }, [vehicles, filter]);

  return (
    <div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by model / derivative / engine / cap code…"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
      />
      <div className="space-y-2">
        {filtered.map((v) => <VehicleCard key={v.id} vehicle={v} buckets={buckets} />)}
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No vehicles match — clear the filter or add a row.
          </p>
        )}
      </div>
    </div>
  );
}

function VehicleCard({ vehicle, buckets }: { vehicle: VehicleRow; buckets: BucketOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const bucketName = vehicle.marginBucketId
    ? buckets.find((b) => b.id === vehicle.marginBucketId)?.name ?? "— deleted bucket —"
    : null;

  function commit(patch: Record<string, unknown>) {
    start(async () => { await updateVehicleMasterAction(vehicle.id, patch); router.refresh(); });
  }
  function del() {
    if (!confirm("Delete this vehicle? Options on it will also be removed.")) return;
    start(async () => { await deleteVehicleMasterAction(vehicle.id); router.refresh(); });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-900">{vehicle.model}</span>
            <span className="text-sm text-slate-700">{vehicle.derivative}</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{vehicle.modelYear}</span>
            <span className="text-[10px] text-slate-400">{vehicle.bodystyle}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 space-x-2">
            <span>{vehicle.engine}</span>
            <span>· {vehicle.drive}</span>
            <span>· {vehicle.transmission}</span>
            <span>· {vehicle.fuelType.toUpperCase()}</span>
            {bucketName && <span>· bucket <strong>{bucketName}</strong></span>}
            {vehicle.options.length > 0 && <span>· {vehicle.options.length} option{vehicle.options.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-slate-900">{gbp(vehicle.basicListPriceGbp)}</div>
          <div className="text-[10px] text-slate-400">{open ? "Close" : "Edit"}</div>
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <NumEdit label="Basic list price (£)" value={vehicle.basicListPriceGbp} onCommit={(v) => v !== null && commit({ basicListPriceGbp: v })} />
            <NumEdit label="Manufacturer delivery (£)" value={vehicle.manufacturerDeliveryGbp} onCommit={(v) => v !== null && commit({ manufacturerDeliveryGbp: v })} />
            <NumEdit label="1F discount (%)" value={vehicle.oneFDiscountPct} onCommit={(v) => v !== null && commit({ oneFDiscountPct: v })} />
            <label className="block text-xs font-medium text-slate-700">
              Fuel type
              <select defaultValue={vehicle.fuelType} onChange={(e) => commit({ fuelType: e.target.value })} className={`${inp} mt-1 w-full`}>
                <option value="ice">ICE</option>
                <option value="phev">PHEV</option>
                <option value="bev">BEV</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Car / van
              <select defaultValue={vehicle.isVan ? "van" : "car"} onChange={(e) => commit({ isVan: e.target.value === "van" })} className={`${inp} mt-1 w-full`}>
                <option value="car">Car</option>
                <option value="van">Commercial vehicle</option>
              </select>
            </label>
            {!vehicle.isVan && (
              <NumEdit label="CO2 (g/km)" value={vehicle.co2GKm} onCommit={(v) => commit({ co2GKm: v })} nullable />
            )}
            <NumEdit label="PiVG grant (£)" value={vehicle.pivgGrantGbp} onCommit={(v) => v !== null && commit({ pivgGrantGbp: v })} />
            <NumEdit label="OLEV grant (£)" value={vehicle.olevGrantGbp} onCommit={(v) => v !== null && commit({ olevGrantGbp: v })} />
            <label className="block text-xs font-medium text-slate-700">
              Margin bucket
              <select defaultValue={vehicle.marginBucketId ?? ""} onChange={(e) => commit({ marginBucketId: e.target.value || null })} className={`${inp} mt-1 w-full`}>
                <option value="">— none —</option>
                {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Profit mode
              <select defaultValue={vehicle.profitMode} onChange={(e) => commit({ profitMode: e.target.value })} className={`${inp} mt-1 w-full`}>
                <option value="gbp">Flat £</option>
                <option value="pct">% of list price</option>
              </select>
            </label>
            <NumEdit label={vehicle.profitMode === "gbp" ? "Profit floor (£)" : "Profit floor (%)"} value={vehicle.profitValue} onCommit={(v) => v !== null && commit({ profitValue: v })} />
            <TextEdit label="CAP code" value={vehicle.capCode ?? ""} onCommit={(v) => commit({ capCode: v })} />
            <TextEdit label="CAP ID" value={vehicle.capId ?? ""} onCommit={(v) => commit({ capId: v })} />
            <TextEdit label="Notes" value={vehicle.notes ?? ""} onCommit={(v) => commit({ notes: v })} colSpan="sm:col-span-3" />
          </div>

          <OptionsEditor vehicleId={vehicle.id} options={vehicle.options} />

          <div className="flex justify-end">
            <button onClick={del} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete vehicle</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsEditor({ vehicleId, options }: { vehicleId: string; options: VehicleOptionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createVehicleOptionAction({
        vehicleId,
        optionCode: code.trim() || null,
        label: label.trim(),
        priceGbp: parseFloat(price) || 0,
      });
      if (!res.ok) { setError(res.error); return; }
      setCode(""); setLabel(""); setPrice("");
      router.refresh();
    });
  }
  function commit(id: string, patch: { optionCode?: string | null; label?: string; priceGbp?: number }) {
    start(async () => { await updateVehicleOptionAction(id, patch); router.refresh(); });
  }
  function del(id: string) {
    start(async () => { await deleteVehicleOptionAction(id); router.refresh(); });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Options</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Label</th>
              <th className="px-3 py-2 text-right font-medium">Price £</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {options.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2"><BlurText initial={o.optionCode ?? ""} onCommit={(v) => commit(o.id, { optionCode: v || null })} className="w-24" /></td>
                <td className="px-3 py-2"><BlurText initial={o.label} onCommit={(v) => v && commit(o.id, { label: v })} className="w-full" /></td>
                <td className="px-3 py-2 text-right"><BlurNumber initial={o.priceGbp} step="0.01" onCommit={(v) => v !== null && commit(o.id, { priceGbp: v })} className="w-24 text-right" /></td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => del(o.id)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
            {options.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-500">No options yet — add one below.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-5">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" className={`${inp}`} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Option label" className={`${inp} sm:col-span-2`} required />
        <input type="number" step="0.01" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="£" className={`${numInp}`} required />
        <button type="submit" disabled={pending || !label.trim() || !price} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Add option</button>
        {error && <span className="sm:col-span-5 text-xs text-red-600">{error}</span>}
      </form>
    </div>
  );
}

function NumEdit({ label, value, onCommit, nullable }: { label: string; value: number | null; onCommit: (v: number | null) => void; nullable?: boolean }) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <BlurNumber initial={value} step="0.01" nullable={nullable} onCommit={onCommit} className="mt-1 w-full text-right" />
    </label>
  );
}

function TextEdit({ label, value, onCommit, colSpan }: { label: string; value: string; onCommit: (v: string | null) => void; colSpan?: string }) {
  return (
    <label className={`block text-xs font-medium text-slate-700 ${colSpan ?? ""}`}>
      {label}
      <BlurText initial={value} onCommit={onCommit} className="mt-1 w-full" />
    </label>
  );
}

function BlurNumber({
  initial, step, nullable, onCommit, className,
}: {
  initial: number | null; step?: string; nullable?: boolean; onCommit: (v: number | null) => void; className?: string;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const t = value.trim();
        if (t === "" && nullable) { onCommit(null); return; }
        const n = parseFloat(t);
        if (Number.isFinite(n)) onCommit(n);
      }}
      className={`${numInp} ${className ?? ""}`}
    />
  );
}

function BlurText({ initial, onCommit, className }: { initial: string; onCommit: (v: string) => void; className?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      className={`${inp} ${className ?? ""}`}
    />
  );
}
