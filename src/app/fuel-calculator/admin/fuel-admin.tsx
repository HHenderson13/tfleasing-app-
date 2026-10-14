"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FuelPrice, FuelVehicle, RefreshReport } from "@/lib/fuel-prices";
import { PRICE_META, type PriceKey } from "@/lib/fuel-calc";
import { deleteFuelVehicleAction, importFuelVehiclesAction, refreshFuelPricesAction, setPriceOverrideAction } from "../actions";

const ORDER: PriceKey[] = ["petrol", "diesel", "home_overnight", "home_standard", "depot", "public_rapid"];
const CADENCE: Record<PriceKey, string> = {
  petrol: "weekly (Mondays)", diesel: "weekly (Mondays)", home_overnight: "daily", home_standard: "quarterly",
  depot: "quarterly, about 3 months behind", public_rapid: "monthly",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function FuelAdmin({ prices, vehicles }: { prices: FuelPrice[]; vehicles: FuelVehicle[] }) {
  return (
    <div className="mt-6 space-y-10">
      <PricesSection prices={prices} />
      <VehiclesSection vehicles={vehicles} />
    </div>
  );
}

// ─── Prices ────────────────────────────────────────────────────────────────

function PricesSection({ prices }: { prices: FuelPrice[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reports, setReports] = useState<RefreshReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byKey = new Map(prices.map((p) => [p.key, p]));

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Prices</h2>
        <button disabled={pending} onClick={() => start(async () => {
          setError(null);
          const res = await refreshFuelPricesAction();
          if (!res.ok) setError(res.error ?? "Couldn't check the sources.");
          else { setReports(res.reports ?? []); router.refresh(); }
        })} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Checking sources…" : "Check sources now"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      {reports && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
          {reports.map((r) => (
            <div key={r.source}>
              <b className={r.ok ? "text-emerald-700" : "text-rose-700"}>{r.ok ? "✓" : "✗"}</b> {r.source}
              {r.ok ? (r.changed.length ? `: updated ${r.changed.map((k) => PRICE_META[k].short.toLowerCase()).join(", ")}` : ": no change") : `: ${r.error}`}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Price</th>
              <th className="px-3 py-2 text-right font-semibold">In use</th>
              <th className="px-3 py-2 text-left font-semibold">From its source</th>
              <th className="px-3 py-2 text-left font-semibold">Your own figure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ORDER.map((k) => <PriceRow key={k} k={k} p={byKey.get(k)} />)}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Prices are stored as each source publishes them: fuel, home and public charging include VAT; the depot figure (DESNZ
        non-domestic, small business, including Climate Change Levy) excludes it. The calculator adds or removes VAT for private and business customers.
      </p>
    </section>
  );
}

function PriceRow({ k, p }: { k: PriceKey; p: FuelPrice | undefined }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(p?.override ? String(p.override.value) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const unit = PRICE_META[k].unit === "litre" ? "p/L" : "p/kWh";
  const save = (v: number | null) => start(async () => {
    setMsg(null);
    const res = await setPriceOverrideAction({ key: k, value: v });
    if (!res.ok) setMsg(res.error ?? "Couldn't save.");
    else { if (v == null) setValue(""); router.refresh(); }
  });
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{PRICE_META[k].label}</div>
        <div className="text-[11px] text-slate-400">Source publishes {CADENCE[k]}</div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        <div className="text-base font-semibold text-slate-900">{p ? `${p.value.toFixed(2)}${unit}` : "Not set"}</div>
        {p?.override && <div className="text-[10px] font-semibold uppercase text-indigo-700">Your figure</div>}
        {p?.stale && <div className="text-[10px] font-semibold uppercase text-amber-700">May be out of date</div>}
      </td>
      <td className="px-3 py-3 text-xs text-slate-600">
        {p ? (
          <>
            <div><b className="tabular-nums text-slate-800">{p.sourceValue.toFixed(2)}{unit}</b>{p.period ? ` · ${p.period}` : ""}</div>
            <div className="text-slate-500">{p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800">{p.source}</a> : p.source}</div>
            <div className="text-[11px] text-slate-400">Checked {when(p.checkedAt)}</div>
            {p.lastError && <div className="mt-0.5 text-[11px] text-rose-700">Last check failed: {p.lastError}</div>}
          </>
        ) : "Not fetched yet"}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Your price"
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none" aria-label={`Your own ${PRICE_META[k].label} price`} />
          <span className="text-xs text-slate-400">{unit}</span>
          <button disabled={pending || !value || Number(value) <= 0} onClick={() => save(Number(value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">Save</button>
          {p?.override && <button disabled={pending} onClick={() => save(null)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Use source</button>}
        </div>
        {p?.override && <div className="mt-1 text-[11px] text-slate-400">Set by {p.override.by ?? "an admin"}{p.override.at ? ` · ${when(p.override.at)}` : ""}</div>}
        {msg && <div className="mt-1 text-[11px] text-rose-700">{msg}</div>}
      </td>
    </tr>
  );
}

// ─── Vehicles ──────────────────────────────────────────────────────────────

function VehiclesSection({ vehicles }: { vehicles: FuelVehicle[] }) {
  const [tab, setTab] = useState<"ev" | "ice">("ev");
  const [segment, setSegment] = useState<"all" | "car" | "van">("all");
  const list = useMemo(() => vehicles.filter((v) => v.powertrain === tab && (segment === "all" || v.segment === segment)), [vehicles, tab, segment]);
  const counts = (p: "ev" | "ice") => {
    const vs = vehicles.filter((v) => v.powertrain === p);
    return `${vs.filter((v) => v.segment === "car").length} cars · ${vs.filter((v) => v.segment === "van").length} vans`;
  };
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-900">Vehicles</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {([["ev", "Electric"], ["ice", "Petrol & diesel"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>
            {label} <span className={`text-xs ${tab === k ? "text-slate-300" : "text-slate-400"}`}>{counts(k)}</span>
          </button>
        ))}
        <select value={segment} onChange={(e) => setSegment(e.target.value as typeof segment)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="all">Cars and vans</option><option value="car">Cars</option><option value="van">Vans</option>
        </select>
      </div>
      <AddVehicles powertrain={tab} />
      <div className="mt-3 max-h-[480px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Vehicle</th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-right font-semibold">{tab === "ev" ? "Miles / kWh" : "MPG"}</th>
              <th className="px-3 py-2 text-left font-semibold">Source</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((v) => <VehicleRow key={v.id} v={v} />)}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">None yet. Paste them in above.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VehicleRow({ v }: { v: FuelVehicle }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <tr>
      <td className="px-4 py-1.5"><span className="font-medium text-slate-900">{v.make} {v.model}</span> <span className="text-slate-600">{v.derivative}</span></td>
      <td className="whitespace-nowrap px-3 py-1.5 text-xs capitalize text-slate-600">{v.segment}{v.fuel !== "electric" ? ` · ${v.fuel}` : ""}</td>
      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{v.efficiency}</td>
      <td className="max-w-[220px] truncate px-3 py-1.5 text-[11px] text-slate-500" title={v.source ?? ""}>{v.source}</td>
      <td className="px-3 py-1.5 text-right">
        <button disabled={pending} onClick={() => { if (confirm(`Remove ${v.make} ${v.model} ${v.derivative}?`)) start(async () => { await deleteFuelVehicleAction(v.id); router.refresh(); }); }}
          className="text-xs text-slate-400 hover:text-rose-700" aria-label="Remove">Remove</button>
      </td>
    </tr>
  );
}

function AddVehicles({ powertrain }: { powertrain: "ev" | "ice" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof importFuelVehiclesAction>> | null>(null);
  const columns = powertrain === "ev" ? "Car or Van · Make · Model · Derivative · Miles per kWh" : "Car or Van · Make · Model · Derivative · Petrol or Diesel · MPG";
  const example = powertrain === "ev" ? "Car\tFord\tExplorer\tExtended Range RWD 77kWh Select\t3.9" : "Van\tFord\tTransit Connect\tL2 Trend 2.0 EcoBlue 122PS\tDiesel\t47.9";
  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Add or update {powertrain === "ev" ? "electric" : "petrol and diesel"} vehicles</div>
      <p className="mt-0.5 text-xs text-slate-500">
        Paste rows from Excel with the columns <b>{columns}</b>. A header row is fine. A vehicle already in the list is updated, not doubled.
        Use the official WLTP {powertrain === "ev" ? "miles per kWh (not kWh per 100 miles)" : "combined MPG"} so every comparison is like for like.
      </p>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={5} placeholder={example}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-slate-500 focus:outline-none" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={`Source, e.g. Ford price list Oct 2026 (WLTP)`}
          className="w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none" />
        <button disabled={pending || !text.trim()} onClick={() => start(async () => {
          const res = await importFuelVehiclesAction({ text, powertrain, source });
          setResult(res);
          if (res.ok) { setText(""); router.refresh(); }
        })} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
          {pending ? "Saving…" : "Save vehicles"}
        </button>
      </div>
      {result?.ok && <p className="mt-2 text-xs text-emerald-700">Saved: {result.added} added, {result.updated} updated.</p>}
      {result && !result.ok && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <div className="font-semibold">{result.error}</div>
          {result.parsed?.errors.slice(0, 12).map((e) => <div key={e.line}>Row {e.line}: {e.message} <span className="text-rose-500">({e.text})</span></div>)}
          {(result.parsed?.errors.length ?? 0) > 12 && <div>and {result.parsed!.errors.length - 12} more</div>}
        </div>
      )}
    </div>
  );
}
