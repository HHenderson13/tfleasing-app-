"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { FuelPrice, FuelVehicle } from "@/lib/fuel-prices";
import {
  CHARGE_KEYS, DEFAULT_MIX, PRICE_META, compare, effectivePence, fmtPence, fmtPounds, mpgFromCo2, showsVat, testCycleFor, verdict, workings,
  type ChargeKey, type ChargeMix, type ComparisonInput, type CustomerType, type FuelType, type PriceKey, type Segment, type TestCycle,
} from "@/lib/fuel-calc";
import type { FuelPdfInput } from "./fuel-pdf";

// The Fuel Cost Calculator. Everything recalculates as it's typed; the maths
// is lib/fuel-calc.ts, the same code the PDF prints its workings from.

const CHARGE_LABEL: Record<ChargeKey, string> = {
  home_overnight: "Home — overnight", home_standard: "Home — daytime", depot: "Depot / workplace", public_rapid: "Public rapid",
};

const MIX_PRESETS: { label: string; mix: ChargeMix }[] = [
  { label: "Mostly at home overnight", mix: { home_overnight: 80, home_standard: 10, depot: 0, public_rapid: 10 } },
  { label: "Home only", mix: { home_overnight: 90, home_standard: 10, depot: 0, public_rapid: 0 } },
  { label: "Depot", mix: { home_overnight: 0, home_standard: 0, depot: 90, public_rapid: 10 } },
  { label: "Public rapid only", mix: { home_overnight: 0, home_standard: 0, depot: 0, public_rapid: 100 } },
];

const MILEAGE_CHIPS = [8000, 10000, 12000, 15000, 20000, 25000];
const TERMS = [24, 36, 48, 60];

const num = (s: string) => { const n = Number(String(s).replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };

export function FuelCalculator({ prices, vehicles, preparedBy }: { prices: FuelPrice[]; vehicles: FuelVehicle[]; preparedBy: string }) {
  const published = useMemo(() => Object.fromEntries(prices.map((p) => [p.key, p])) as Partial<Record<PriceKey, FuelPrice>>, [prices]);

  const [customerName, setCustomerName] = useState("");
  const [segment, setSegment] = useState<Segment>("van");
  const [customer, setCustomer] = useState<CustomerType>("private");
  const [annualMiles, setAnnualMiles] = useState("10000");
  const [termMonths, setTermMonths] = useState(48);

  // Prices: as published, editable for this comparison only.
  const [priceEdits, setPriceEdits] = useState<Partial<Record<PriceKey, string>>>({});
  const priceOf = (k: PriceKey) => (priceEdits[k] != null && priceEdits[k] !== "" ? num(priceEdits[k]!) : published[k]?.value ?? 0);

  // ── Current vehicle (petrol / diesel) ──
  const iceList = useMemo(() => vehicles.filter((v) => v.powertrain === "ice" && v.segment === segment), [vehicles, segment]);
  const [iceMode, setIceMode] = useState<"list" | "mpg" | "co2">("list");
  const [iceModelKey, setIceModelKey] = useState("");
  const [iceId, setIceId] = useState("");
  const [iceMpgEdit, setIceMpgEdit] = useState<string | null>(null);
  const [manualFuel, setManualFuel] = useState<FuelType>("diesel");
  const [manualMpg, setManualMpg] = useState("");
  const [co2, setCo2] = useState("");
  const [firstReg, setFirstReg] = useState("");
  const [cycleChoice, setCycleChoice] = useState<TestCycle | null>(null);
  const [iceName, setIceName] = useState("");

  const iceModels = useMemo(() => groupModels(iceList), [iceList]);
  const iceModel = iceModels.find((m) => m.key === iceModelKey) ?? iceModels[0];
  const iceVehicle = iceModel?.vehicles.find((v) => v.id === iceId) ?? iceModel?.vehicles[0];
  const listMode = iceMode === "list" && !!iceVehicle;
  const effectiveIceMode = iceMode === "list" && !iceVehicle ? "mpg" : iceMode;
  const autoCycle = testCycleFor(segment, firstReg || null);
  const cycle = cycleChoice ?? autoCycle;
  const iceFuel: FuelType = listMode ? (iceVehicle!.fuel as FuelType) : manualFuel;
  const co2Mpg = mpgFromCo2(num(co2), manualFuel, cycle);
  const iceMpg = effectiveIceMode === "list" ? (iceMpgEdit != null ? num(iceMpgEdit) : iceVehicle?.efficiency ?? 0)
    : effectiveIceMode === "co2" ? co2Mpg ?? 0 : num(manualMpg);
  const iceDescription = effectiveIceMode === "list" && iceVehicle
    ? `${iceVehicle.make} ${iceVehicle.model} ${iceVehicle.derivative}`
    : iceName.trim() || `Current ${iceFuel} ${segment}`;
  const iceBasis = effectiveIceMode === "list" && iceVehicle
    ? (iceMpgEdit != null ? "MPG edited for this comparison" : iceVehicle.source ?? "Manufacturer WLTP combined")
    : effectiveIceMode === "co2" ? `From ${num(co2) || "—"} g/km CO₂ (${cycle.toUpperCase()}${cycle === "nedc" ? " — older test, flatters economy" : ""})`
    : "MPG entered";

  // ── Electric vehicle ──
  const evList = useMemo(() => vehicles.filter((v) => v.powertrain === "ev" && v.segment === segment), [vehicles, segment]);
  const [evMode, setEvMode] = useState<"list" | "manual">("list");
  const [evModelKey, setEvModelKey] = useState("");
  const [evId, setEvId] = useState("");
  const [evEffEdit, setEvEffEdit] = useState<string | null>(null);
  const [manualEff, setManualEff] = useState("");
  const [evName, setEvName] = useState("");
  const evModels = useMemo(() => groupModels(evList), [evList]);
  const evModel = evModels.find((m) => m.key === evModelKey) ?? evModels[0];
  const evVehicle = evModel?.vehicles.find((v) => v.id === evId) ?? evModel?.vehicles[0];
  const evListMode = evMode === "list" && !!evVehicle;
  const milesPerKwh = evListMode ? (evEffEdit != null ? num(evEffEdit) : evVehicle!.efficiency) : num(manualEff);
  const evDescription = evListMode ? `${evVehicle!.make} ${evVehicle!.model} ${evVehicle!.derivative}` : evName.trim() || `Electric ${segment}`;
  const evBasis = evListMode ? (evEffEdit != null ? "Efficiency edited for this comparison" : evVehicle!.source ?? "Manufacturer WLTP") : "Miles per kWh entered";

  const [mix, setMix] = useState<ChargeMix>(DEFAULT_MIX.van);

  // ── The comparison ──
  const input: ComparisonInput = {
    annualMiles: num(annualMiles),
    termMonths,
    customer,
    ice: { fuel: iceFuel, mpg: iceMpg, pricePence: priceOf(iceFuel) },
    ev: { milesPerKwh, mix, pricesPence: Object.fromEntries(CHARGE_KEYS.map((k) => [k, priceOf(k)])) as Record<ChargeKey, number> },
  };
  const r = compare(input);
  const v = verdict(r, iceFuel);
  const steps = workings(input, r, { iceFuel, chargeLabels: CHARGE_LABEL });
  const mixTotal = CHARGE_KEYS.reduce((n, k) => n + (mix[k] || 0), 0);

  const [showWorkings, setShowWorkings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportPdf() {
    setExporting(true);
    setExportError(null);
    try {
      const usedPrices = [iceFuel as PriceKey, ...CHARGE_KEYS.filter((k) => r.ev.shares[k] > 0)];
      const data: FuelPdfInput = {
        customerName: customerName.trim(),
        preparedBy,
        date: new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" }),
        segment, customer, termMonths, annualMiles: input.annualMiles,
        ice: { name: iceDescription, fuel: iceFuel, mpg: iceMpg, basis: iceBasis },
        ev: { name: evDescription, milesPerKwh, basis: evBasis },
        result: r,
        verdict: v,
        workings: steps,
        prices: usedPrices.map((k) => ({
          label: PRICE_META[k].label,
          short: PRICE_META[k].short,
          unit: PRICE_META[k].unit,
          published: priceOf(k),
          paid: effectivePence(k, priceOf(k), customer),
          incVat: showsVat(k, customer),
          share: k === iceFuel ? null : Math.round(r.ev.shares[k as ChargeKey] * 100),
          source: priceEdits[k] ? "Entered for this comparison" : published[k]?.override ? "Set by TF Leasing" : published[k]?.source ?? "—",
          period: priceEdits[k] ? null : published[k]?.period ?? null,
        })),
      };
      const [{ pdf }, { FuelComparisonPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./fuel-pdf")]);
      const blob = await pdf(<FuelComparisonPdf {...data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Fuel comparison${data.customerName ? ` - ${data.customerName.replace(/[\\/:*?"<>|]/g, "")}` : ""} - ${data.date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      console.error("Fuel comparison PDF failed", e);
      setExportError("Couldn't build the PDF — try again.");
    } finally {
      setExporting(false);
    }
  }

  const priceRow = (k: PriceKey) => (
    <PriceInput key={k} k={k} published={published[k]} value={priceEdits[k]} customer={customer}
      onChange={(val) => setPriceEdits((e) => ({ ...e, [k]: val }))} onReset={() => setPriceEdits((e) => { const n = { ...e }; delete n[k]; return n; })} />
  );

  return (
    <div className="mt-5 space-y-5">
      {/* Setup */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_auto_auto]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer name</span>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="For the PDF — e.g. Smith Plumbing Ltd"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none" />
          </label>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle</span>
            <Segmented value={segment} onChange={(s) => { setSegment(s); setIceMpgEdit(null); setEvEffEdit(null); }} options={[["car", "Car"], ["van", "Van"]]} />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</span>
            <Segmented value={customer} onChange={setCustomer} options={[["private", "Private"], ["business", "Business"]]} />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {customer === "business"
            ? "Business: VAT taken off fuel, depot and public charging, as a VAT-registered business reclaims it. Home electricity keeps its VAT — it isn't reclaimable on a domestic bill."
            : "Private: every price includes VAT, as the customer pays it."}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Annual mileage</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input inputMode="numeric" value={Number(num(annualMiles)).toLocaleString("en-GB")} onChange={(e) => setAnnualMiles(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none" aria-label="Annual mileage" />
              <span className="text-xs text-slate-500">miles a year</span>
              {MILEAGE_CHIPS.map((m) => (
                <button key={m} onClick={() => setAnnualMiles(String(m))}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${num(annualMiles) === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}>
                  {(m / 1000).toLocaleString("en-GB")}k
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compare over</span>
            <Segmented value={String(termMonths)} onChange={(t) => setTermMonths(Number(t))} options={TERMS.map((t) => [String(t), `${t} months`])} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Current vehicle */}
        <Card title={`Current ${segment} — petrol or diesel`} accent="#b45309"
          foot={<SideResult perMile={r.ice.pencePerMile} monthly={r.ice.monthly} ok={r.valid || iceMpg > 0} />}>
          <ModeTabs value={effectiveIceMode} onChange={(m) => setIceMode(m as typeof iceMode)}
            options={[["list", "Pick from list"], ["mpg", "Enter MPG"], ["co2", "From CO₂ on the V5C"]]} />
          {effectiveIceMode === "list" && iceVehicle && (
            <div className="mt-3 space-y-3">
              <SelectField label="Model" value={iceModel.key} onChange={(k) => { setIceModelKey(k); setIceId(""); setIceMpgEdit(null); }}
                options={iceModels.map((m) => [m.key, m.label])} />
              <SelectField label="Derivative" value={iceVehicle.id} onChange={(id) => { setIceId(id); setIceMpgEdit(null); }}
                options={iceModel.vehicles.map((x) => [x.id, `${x.derivative} · ${x.fuel === "petrol" ? "Petrol" : "Diesel"}`])} />
              <EfficiencyField label="MPG" value={iceMpgEdit ?? String(iceVehicle.efficiency)} onChange={setIceMpgEdit}
                edited={iceMpgEdit != null} onReset={() => setIceMpgEdit(null)} note={iceBasis} />
            </div>
          )}
          {effectiveIceMode === "list" && !iceVehicle && <p className="mt-3 text-xs text-amber-700">No {segment}s in the list yet — enter the MPG instead.</p>}
          {effectiveIceMode === "mpg" && (
            <div className="mt-3 space-y-3">
              <FuelPicker value={manualFuel} onChange={setManualFuel} />
              <EfficiencyField label="MPG" value={manualMpg} onChange={setManualMpg} note="The official combined figure is fairest — it's what the electric side uses too." placeholder="e.g. 42.8" />
              <TextField label="Vehicle (for the PDF)" value={iceName} onChange={setIceName} placeholder="e.g. 2019 Volkswagen Transporter 2.0 TDI" />
            </div>
          )}
          {effectiveIceMode === "co2" && (
            <div className="mt-3 space-y-3">
              <FuelPicker value={manualFuel} onChange={setManualFuel} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">CO₂ (g/km)</span>
                  <input inputMode="numeric" value={co2} onChange={(e) => setCo2(e.target.value.replace(/[^\d.]/g, ""))} placeholder="V5C box V.7"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-slate-500 focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">First registered</span>
                  <input type="month" value={firstReg} onChange={(e) => { setFirstReg(e.target.value); setCycleChoice(null); }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>Test the CO₂ came from:</span>
                <Segmented small value={cycle} onChange={(c) => setCycleChoice(c)} options={[["wltp", "WLTP"], ["nedc", "NEDC (older)"]]} />
                {cycleChoice == null && firstReg && <span className="text-slate-400">set from the registration date</span>}
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                {co2Mpg ? <><b className="tabular-nums">{co2Mpg.toFixed(1)} MPG</b> <span className="text-xs text-slate-500">— worked back from the CO₂, the way the official figure is calculated</span></> : <span className="text-xs text-slate-500">Enter the CO₂ figure to work out the MPG.</span>}
                {cycle === "nedc" && co2Mpg ? <div className="mt-1 text-[11px] text-amber-700">NEDC figures (before {segment === "van" ? "Sept 2019" : "Sept 2018"}) flatter economy, so this leans in the current vehicle&apos;s favour.</div> : null}
              </div>
              <TextField label="Vehicle (for the PDF)" value={iceName} onChange={setIceName} placeholder="e.g. 2017 Ford Transit Custom 2.0 TDCi" />
            </div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3">{priceRow(iceFuel)}</div>
        </Card>

        {/* Electric */}
        <Card title={`Electric ${segment}`} accent="#047857"
          foot={<SideResult perMile={r.ev.pencePerMile} monthly={r.ev.monthly} ok={milesPerKwh > 0} sub={`${fmtPence(r.ev.blendedPence)} a kWh blended`} />}>
          <ModeTabs value={evListMode ? "list" : "manual"} onChange={(m) => setEvMode(m as typeof evMode)}
            options={[["list", "Pick from list"], ["manual", "Enter miles per kWh"]]} />
          {evListMode ? (
            <div className="mt-3 space-y-3">
              <SelectField label="Model" value={evModel.key} onChange={(k) => { setEvModelKey(k); setEvId(""); setEvEffEdit(null); }}
                options={evModels.map((m) => [m.key, m.label])} />
              <SelectField label="Derivative" value={evVehicle!.id} onChange={(id) => { setEvId(id); setEvEffEdit(null); }}
                options={evModel.vehicles.map((x) => [x.id, x.derivative])} />
              <EfficiencyField label="Miles per kWh" value={evEffEdit ?? String(evVehicle!.efficiency)} onChange={setEvEffEdit}
                edited={evEffEdit != null} onReset={() => setEvEffEdit(null)} note={evBasis} />
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {evMode === "list" && !evVehicle && <p className="text-xs text-amber-700">No electric {segment}s in the list yet — enter the miles per kWh.</p>}
              <EfficiencyField label="Miles per kWh" value={manualEff} onChange={setManualEff} placeholder="e.g. 3.6" note="Official WLTP figure — it's measured at the plug, so charging losses are already in it." />
              <TextField label="Vehicle (for the PDF)" value={evName} onChange={setEvName} placeholder="e.g. Ford Explorer Extended Range RWD" />
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where it&apos;s charged</span>
              <span className={`text-xs font-semibold ${mixTotal === 100 ? "text-emerald-700" : "text-amber-700"}`}>
                {mixTotal === 100 ? "Adds to 100%" : `Adds to ${mixTotal}% — scaled to 100%`}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MIX_PRESETS.map((p) => (
                <button key={p.label} onClick={() => setMix(p.mix)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${CHARGE_KEYS.every((k) => p.mix[k] === mix[k]) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2.5">
              {CHARGE_KEYS.map((k) => (
                <div key={k} className="grid grid-cols-[minmax(0,1fr)_88px] items-start gap-3">
                  {priceRow(k)}
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-600">Share</span>
                    <div className="relative mt-1">
                      <input inputMode="numeric" value={String(mix[k])} onChange={(e) => setMix((m) => ({ ...m, [k]: Math.min(100, num(e.target.value)) }))}
                        className="w-full rounded-lg border border-slate-300 py-1.5 pl-2 pr-6 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none" aria-label={`${CHARGE_LABEL[k]} share`} />
                      <span className="pointer-events-none absolute right-2 top-1.5 text-sm text-slate-400">%</span>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* The answer */}
      <section className={`rounded-2xl border p-5 shadow-sm ${v.tone === "saving" ? "border-emerald-200 bg-emerald-50" : v.tone === "cost" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className={`text-2xl font-bold sm:text-3xl ${v.tone === "saving" ? "text-emerald-800" : v.tone === "cost" ? "text-amber-800" : "text-slate-700"}`}>{v.headline}</div>
            {r.valid && (
              <div className="mt-1 text-sm text-slate-700">
                {fmtPounds(Math.abs(r.saving.annual))} a year · {fmtPounds(Math.abs(r.saving.overTerm))} over {termMonths} months ·{" "}
                {fmtPence(r.ice.pencePerMile)} a mile on {iceFuel} against {fmtPence(r.ev.pencePerMile)} electric
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowWorkings((s) => !s)} disabled={!r.valid}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              {showWorkings ? "Hide the workings" : "Show the workings"}
            </button>
            <button onClick={exportPdf} disabled={!r.valid || exporting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
              {exporting ? "Preparing PDF…" : "Export PDF"}
            </button>
          </div>
        </div>
        {exportError && <p className="mt-2 text-xs text-rose-700">{exportError}</p>}
        {r.valid && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200/80">
                  <th className="py-1.5 text-left font-semibold" />
                  <th className="py-1.5 text-right font-semibold">A mile</th>
                  <th className="py-1.5 text-right font-semibold">A month</th>
                  <th className="py-1.5 text-right font-semibold">A year</th>
                  <th className="py-1.5 text-right font-semibold">Over {termMonths} months</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <CostRow label={iceFuel === "petrol" ? "Petrol" : "Diesel"} s={r.ice} />
                <CostRow label="Electric" s={r.ev} />
                <tr className="font-semibold">
                  <td className="py-1.5">{r.saving.monthly >= 0 ? "Electric saves" : "Electric costs more"}</td>
                  <td className="py-1.5 text-right">{fmtPence(Math.abs(r.saving.pencePerMile))}</td>
                  <td className="py-1.5 text-right">{fmtPounds(Math.abs(r.saving.monthly), 2)}</td>
                  <td className="py-1.5 text-right">{fmtPounds(Math.abs(r.saving.annual))}</td>
                  <td className="py-1.5 text-right">{fmtPounds(Math.abs(r.saving.overTerm))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {showWorkings && r.valid && (
          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            {steps.map((s) => (
              <div key={s.title}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.title}</div>
                {s.lines.map((l, i) => <div key={i} className={`font-mono text-[12px] leading-relaxed ${l.startsWith("  ") ? "pl-4 text-slate-500" : "text-slate-800"}`}>{l.trim()}</div>)}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-slate-500">
        For comparison only — not a formal quotation. Figures are estimates from official (WLTP) efficiency and UK average
        prices, and real-world results vary with driving style, journey type, load, weather, battery age and the prices actually paid.
        {" "}{customer === "private" ? "Prices include VAT." : "Business prices exclude reclaimable VAT; home electricity includes VAT."}
      </p>
    </div>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────────────

function groupModels(list: FuelVehicle[]) {
  const m = new Map<string, { key: string; label: string; vehicles: FuelVehicle[] }>();
  for (const v of list) {
    const key = `${v.make}|${v.model}`;
    const g = m.get(key) ?? { key, label: `${v.make} ${v.model}`, vehicles: [] };
    g.vehicles.push(v);
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function Card({ title, accent, children, foot }: { title: string; accent: string; children: ReactNode; foot: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ borderTop: `4px solid ${accent}` }}>
      <div className="flex-1 p-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">{foot}</div>
    </section>
  );
}

function SideResult({ perMile, monthly, ok, sub }: { perMile: number; monthly: number; ok: boolean; sub?: string }) {
  if (!ok || !Number.isFinite(monthly)) return <div className="text-sm text-slate-400">—</div>;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><span className="text-2xl font-bold tabular-nums text-slate-900">{fmtPounds(monthly)}</span> <span className="text-sm text-slate-500">a month</span></div>
      <div className="text-sm text-slate-600 tabular-nums">{fmtPence(perMile)} a mile{sub && <span className="text-slate-400"> · {sub}</span>}</div>
    </div>
  );
}

function CostRow({ label, s }: { label: string; s: { pencePerMile: number; monthly: number; annual: number; overTerm: number } }) {
  return (
    <tr className="border-b border-slate-200/60">
      <td className="py-1.5 text-slate-700">{label}</td>
      <td className="py-1.5 text-right">{fmtPence(s.pencePerMile)}</td>
      <td className="py-1.5 text-right">{fmtPounds(s.monthly, 2)}</td>
      <td className="py-1.5 text-right">{fmtPounds(s.annual)}</td>
      <td className="py-1.5 text-right">{fmtPounds(s.overTerm)}</td>
    </tr>
  );
}

function Segmented<T extends string>({ value, onChange, options, small }: { value: T; onChange: (v: T) => void; options: [T, string][]; small?: boolean }) {
  return (
    <div className={`${small ? "" : "mt-1"} inline-flex rounded-lg bg-slate-100 p-0.5`}>
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`rounded-md ${small ? "px-2 py-0.5 text-[11px]" : "px-3 py-1.5 text-sm"} font-medium transition ${value === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ModeTabs({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs font-semibold ${value === k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus:border-slate-500 focus:outline-none">
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none" />
    </label>
  );
}

function EfficiencyField({ label, value, onChange, note, edited, onReset, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; note?: string; edited?: boolean; onReset?: () => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} placeholder={placeholder}
          className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm font-semibold tabular-nums focus:border-slate-500 focus:outline-none" />
        {edited && onReset && <button type="button" onClick={onReset} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Reset</button>}
      </div>
      {note && <span className="mt-1 block text-[11px] text-slate-500">{note}</span>}
    </label>
  );
}

function FuelPicker({ value, onChange }: { value: FuelType; onChange: (f: FuelType) => void }) {
  return (
    <div>
      <span className="text-xs font-semibold text-slate-600">Fuel</span>
      <div><Segmented value={value} onChange={onChange} options={[["diesel", "Diesel"], ["petrol", "Petrol"]]} /></div>
    </div>
  );
}

// One price: the UK average as published, editable for this comparison,
// with where it came from and what this customer actually pays.
function PriceInput({ k, published, value, customer, onChange, onReset }: {
  k: PriceKey; published: FuelPrice | undefined; value: string | undefined; customer: CustomerType; onChange: (v: string) => void; onReset: () => void;
}) {
  const meta = PRICE_META[k];
  const edited = value != null && value !== "";
  const pub = edited ? num(value!) : published?.value ?? 0;
  const paid = effectivePence(k, pub, customer);
  const differs = Math.abs(paid - pub) > 0.005;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-600">{k === "petrol" || k === "diesel" ? `${meta.label} price` : CHARGE_LABEL[k as ChargeKey]}</span>
        {edited && <button type="button" onClick={onReset} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800">Reset</button>}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="relative">
          <input inputMode="decimal" value={edited ? value : String(published?.value ?? "")} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
            className={`w-28 rounded-lg border py-1.5 pl-2 pr-12 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none ${edited ? "border-indigo-300 bg-indigo-50/50" : "border-slate-300"}`}
            aria-label={`${meta.label} price, pence per ${meta.unit}`} />
          <span className="pointer-events-none absolute right-2 top-1.5 text-xs text-slate-400">p/{meta.unit === "litre" ? "L" : "kWh"}</span>
        </div>
        {differs && <span className="text-[11px] text-slate-600">pays <b className="tabular-nums">{paid.toFixed(2)}p</b> {showsVat(k, customer) ? "incl. VAT" : "ex VAT"}</span>}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
        {edited ? "Entered for this comparison"
          : published ? <>{published.override ? "Set by TF Leasing" : published.source}{published.period ? ` · ${published.period}` : ""}{meta.includesVat ? " · incl. VAT" : " · ex VAT"}{published.stale && <span className="font-semibold text-amber-700"> · may be out of date</span>}</>
          : "No published price"}
      </div>
    </div>
  );
}
