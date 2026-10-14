"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FuelPrice, FuelVehicle } from "@/lib/fuel-prices";
import {
  CHARGE_KEYS, DEFAULT_MIX, PRICE_META, compare, effectivePence, fmtPence, fmtPounds, mpgFromCo2, showsVat, testCycleFor, verdict, workings,
  type ChargeKey, type ChargeMix, type ComparisonInput, type CustomerType, type FuelType, type PriceKey, type Segment, type TestCycle,
} from "@/lib/fuel-calc";
import { decodeReference, type ReferenceFile } from "@/lib/fuel-reference";
import {
  engineLabel, enginesFor, fromLibrary, fromReference, likeliest, makesFor, modelsFor, searchCatalogue, versionsFor, yearsFor, yearsOf,
  type PickVehicle, type YearChoice,
} from "@/lib/fuel-catalogue";
import {
  BigFigure, CHARGE_COLOUR, Chip, ELECTRIC, FOSSIL, Field, LinkButton, Note, Segmented, Select, Step, Tag, TextInput, UnitInput,
} from "./ui";
import type { FuelPdfInput } from "./fuel-pdf";

// The Fuel Cost Calculator. Everything recalculates as it's typed; the maths
// is lib/fuel-calc.ts, the same code the PDF prints its workings from.

const CHARGE_NAME: Record<ChargeKey, string> = {
  home_overnight: "Home overnight", home_standard: "Home daytime", depot: "Depot or workplace", public_rapid: "Public rapid",
};

const MIX_PRESETS: { label: string; mix: ChargeMix }[] = [
  { label: "Mostly at home", mix: { home_overnight: 80, home_standard: 10, depot: 0, public_rapid: 10 } },
  { label: "Home only", mix: { home_overnight: 90, home_standard: 10, depot: 0, public_rapid: 0 } },
  { label: "At the depot", mix: { home_overnight: 0, home_standard: 0, depot: 90, public_rapid: 10 } },
  { label: "Public only", mix: { home_overnight: 0, home_standard: 0, depot: 0, public_rapid: 100 } },
];

const MILEAGE_CHIPS = [8000, 10000, 12000, 15000, 20000, 25000];
const TERMS = [24, 36, 48, 60];

const num = (s: string) => { const n = Number(String(s).replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "2.0 diesel" reads as "2.0 litre diesel". */
const engineText = (label: string) => cap(label.replace(/^(\d\.\d) /, "$1 litre "));

// ─── The reference list, fetched once per visit ────────────────────────────

let referencePromise: Promise<PickVehicle[]> | null = null;
function loadReference(): Promise<PickVehicle[]> {
  referencePromise ??= fetch("/fuel-reference.json")
    .then((res) => { if (!res.ok) throw new Error(`Reference list: ${res.status}`); return res.json() as Promise<ReferenceFile>; })
    .then((file) => decodeReference(file).map(fromReference))
    .catch((e) => { referencePromise = null; throw e; });
  return referencePromise;
}

function useReference() {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; vehicles: PickVehicle[] }>({ status: "loading", vehicles: [] });
  useEffect(() => {
    let live = true;
    loadReference().then(
      (vehicles) => { if (live) setState({ status: "ready", vehicles }); },
      () => { if (live) setState({ status: "error", vehicles: [] }); },
    );
    return () => { live = false; };
  }, []);
  return state;
}

interface Pick { make: string; model: string; year: YearChoice; engine: string; versionId: string }
const NO_PICK: Pick = { make: "", model: "", year: "any", engine: "any", versionId: "" };

export function FuelCalculator({ prices, vehicles, preparedBy, canManage }: { prices: FuelPrice[]; vehicles: FuelVehicle[]; preparedBy: string; canManage: boolean }) {
  const published = useMemo(() => Object.fromEntries(prices.map((p) => [p.key, p])) as Partial<Record<PriceKey, FuelPrice>>, [prices]);

  const [customerName, setCustomerName] = useState("");
  const [segment, setSegmentRaw] = useState<Segment>("van");
  const [customer, setCustomer] = useState<CustomerType>("private");
  const [annualMiles, setAnnualMiles] = useState("12000");
  const [termMonths, setTermMonths] = useState(48);

  // Prices: as published, editable for this comparison only.
  const [priceEdits, setPriceEdits] = useState<Partial<Record<PriceKey, string>>>({});
  const priceOf = (k: PriceKey) => (priceEdits[k] != null && priceEdits[k] !== "" ? num(priceEdits[k]!) : published[k]?.value ?? 0);
  const editPrice = (k: PriceKey, v: string | null) => setPriceEdits((e) => { const n = { ...e }; if (v == null) delete n[k]; else n[k] = v; return n; });

  // ── Their current vehicle ──
  const reference = useReference();
  const library = useMemo(() => vehicles.map(fromLibrary).filter((v): v is PickVehicle => v != null), [vehicles]);
  const catalogue = useMemo(() => [...library, ...reference.vehicles], [library, reference.vehicles]);
  const [iceMode, setIceMode] = useState<"find" | "mpg" | "co2">("find");
  const [pick, setPick] = useState<Pick>(NO_PICK);
  const [query, setQuery] = useState("");
  const [mpgEdit, setMpgEdit] = useState<string | null>(null);
  const [manualFuel, setManualFuel] = useState<FuelType>("diesel");
  const [manualMpg, setManualMpg] = useState("");
  const [co2, setCo2] = useState("");
  const [firstReg, setFirstReg] = useState("");
  const [cycleChoice, setCycleChoice] = useState<TestCycle | null>(null);
  const [iceName, setIceName] = useState("");

  const filter = { segment, make: pick.make, model: pick.model, year: pick.year, engine: pick.engine };
  const versions = useMemo(() => (pick.model ? versionsFor(catalogue, filter) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogue, segment, pick.make, pick.model, pick.year, pick.engine]);
  const chosen = versions.find((v) => v.id === pick.versionId) ?? likeliest(versions);
  const autoChosen = !!chosen && chosen.id !== pick.versionId && versions.length > 1;

  const cycle = cycleChoice ?? testCycleFor(segment, firstReg || null);
  const co2Mpg = mpgFromCo2(num(co2), manualFuel, cycle);
  const iceFuel: FuelType = iceMode === "find" ? chosen?.fuel ?? "diesel" : manualFuel;
  const iceMpg = iceMode === "find" ? (mpgEdit != null ? num(mpgEdit) : chosen?.mpg ?? 0) : iceMode === "co2" ? co2Mpg ?? 0 : num(manualMpg);
  const iceNedc = iceMode === "find" ? chosen?.cycle === "nedc" && mpgEdit == null : iceMode === "co2" && cycle === "nedc";

  const setSegment = (s: Segment) => { setSegmentRaw(s); setPick(NO_PICK); setQuery(""); setMpgEdit(null); setEvEdit(null); setEvKey(""); };
  const choose = (p: Partial<Pick>) => { setPick((cur) => ({ ...cur, ...p })); setMpgEdit(null); };

  // ── The electric alternative ──
  const evModels = useMemo(() => groupModels(vehicles.filter((v) => v.powertrain === "ev" && v.segment === segment)), [vehicles, segment]);
  const [evMode, setEvMode] = useState<"range" | "manual">("range");
  const [evKey, setEvKey] = useState("");
  const [evId, setEvId] = useState("");
  const [evEdit, setEvEdit] = useState<string | null>(null);
  const [manualEff, setManualEff] = useState("");
  const [evName, setEvName] = useState("");
  const evModel = evModels.find((m) => m.key === evKey) ?? evModels[0];
  const evVehicle = evModel?.vehicles.find((v) => v.id === evId) ?? evModel?.vehicles[0];
  const evFromRange = evMode === "range" && !!evVehicle;
  const milesPerKwh = evFromRange ? (evEdit != null ? num(evEdit) : evVehicle!.efficiency) : num(manualEff);

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
  const steps = workings(input, r, { iceFuel, chargeLabels: CHARGE_NAME });
  const mixTotal = CHARGE_KEYS.reduce((n, k) => n + (mix[k] || 0), 0);
  const fuelName = cap(iceFuel);

  const missing = [
    !(iceMpg > 0) && (iceMode === "find" ? "Find their current vehicle, or enter its MPG" : iceMode === "co2" ? "Enter the CO₂ figure from the V5C" : "Enter their current MPG"),
    !(milesPerKwh > 0) && "Choose the electric vehicle, or enter its miles per kWh",
    !(input.annualMiles > 0) && "Enter the annual mileage",
  ].filter((m): m is string => !!m);

  // ── Describing both vehicles, for the PDF ──
  const ice = iceMode === "find" && chosen
    ? {
        name: `${chosen.make} ${chosen.model}`,
        detail: `${chosen.version} · ${engineText(engineLabel(chosen))} · ${yearsOf(chosen)}`,
        basis: mpgEdit != null ? "MPG adjusted for this comparison" : chosen.source,
      }
    : {
        name: iceName.trim() || `Their ${iceFuel} ${segment}`,
        detail: null,
        basis: iceMode === "co2" ? `Official ${cycle.toUpperCase()} figure, from ${num(co2)} g/km CO₂ on the V5C` : "MPG entered",
      };
  const ev = evFromRange
    ? { name: `${evVehicle!.make} ${evVehicle!.model}`, detail: evVehicle!.derivative, basis: evEdit != null ? "Efficiency adjusted for this comparison" : evVehicle!.source ?? "Manufacturer WLTP" }
    : { name: evName.trim() || `Electric ${segment}`, detail: null, basis: "Miles per kWh entered" };

  const [showWorkings, setShowWorkings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportPdf() {
    setExporting(true);
    setExportError(null);
    try {
      const used = [iceFuel as PriceKey, ...CHARGE_KEYS.filter((k) => r.ev.shares[k] > 0)];
      const data: FuelPdfInput = {
        customerName: customerName.trim(),
        preparedBy,
        date: new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" }),
        segment, customer, termMonths, annualMiles: input.annualMiles,
        ice: { ...ice, fuel: iceFuel, mpg: iceMpg, nedc: iceNedc },
        ev: { ...ev, milesPerKwh },
        result: r,
        tone: v.tone,
        headline: v.headline,
        workings: steps,
        prices: used.map((k) => ({
          key: k,
          label: k === "petrol" || k === "diesel" ? PRICE_META[k].label : CHARGE_NAME[k as ChargeKey],
          unit: PRICE_META[k].unit,
          paid: effectivePence(k, priceOf(k), customer),
          incVat: showsVat(k, customer),
          share: k === iceFuel ? null : Math.round(r.ev.shares[k as ChargeKey] * 100),
          source: priceEdits[k] ? "Entered for this comparison" : published[k]?.override ? "Set by TF Leasing" : published[k]?.source ?? "No published price",
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
      setExportError("The PDF couldn't be built. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  // The phone's answer bar steps aside once the answer itself is on screen.
  const answerRef = useRef<HTMLDivElement>(null);
  const [answerInView, setAnswerInView] = useState(false);
  useEffect(() => {
    const el = answerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setAnswerInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const workingsRef = useRef<HTMLElement>(null);
  const openWorkings = () => {
    setShowWorkings(true);
    requestAnimationFrame(() => workingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const priceProps = (k: PriceKey) => ({
    k, published: published[k], value: priceEdits[k], customer,
    onChange: (val: string) => editPrice(k, val), onReset: () => editPrice(k, null),
  });

  return (
    <div className="grid gap-5 pb-28 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:pb-12 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ── The inputs ── */}
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
        <Step n={1} title="The customer">
          <div className="grid gap-5">
            <Field label="Customer name" hint="Printed at the top of the PDF.">
              <TextInput value={customerName} onChange={setCustomerName} placeholder="e.g. Smith Plumbing Ltd" label="Customer name" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Vehicle">
                <Segmented label="Vehicle" value={segment} onChange={setSegment} options={[["car", "Car"], ["van", "Van"]]} />
              </Field>
              <Field label="Customer">
                <Segmented label="Customer" value={customer} onChange={setCustomer} options={[["private", "Private"], ["business", "Business"]]} />
              </Field>
            </div>
            <p className="-mt-2 text-[12.5px] leading-5 text-slate-500">
              {customer === "business"
                ? "Business prices leave out the VAT a VAT-registered business reclaims on fuel, depot and public charging. Home electricity keeps its 5% VAT, as it isn't reclaimable on a domestic bill."
                : "Every price includes VAT, as a private customer pays it."}
            </p>
            <Field label="Annual mileage">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <UnitInput value={num(annualMiles) ? num(annualMiles).toLocaleString("en-GB") : ""} onChange={(s) => setAnnualMiles(s.replace(/\D/g, "").slice(0, 6))}
                  unit="miles a year" label="Annual mileage" className="sm:w-52" />
                <div className="flex flex-wrap gap-1.5">
                  {MILEAGE_CHIPS.map((m) => (
                    <Chip key={m} on={num(annualMiles) === m} onClick={() => setAnnualMiles(String(m))}>{(m / 1000).toLocaleString("en-GB")}k</Chip>
                  ))}
                </div>
              </div>
            </Field>
            <Field label={<>Compare over<span className="sm:hidden">, in months</span></>}>
              <Segmented label="Compare over" value={String(termMonths)} onChange={(t) => setTermMonths(Number(t))}
                options={TERMS.map((t) => [String(t), <>{t}<span className="max-sm:hidden"> months</span></>])} />
            </Field>
          </div>
        </Step>

        <Step n={2} title={`Their current ${segment}`} hint="Petrol or diesel. Find it in the list, or work it out from the V5C.">
          <Segmented label="How to find it" value={iceMode} onChange={(m) => { setIceMode(m); setMpgEdit(null); }} size="sm"
            options={[["find", "Find it"], ["co2", "From the V5C"], ["mpg", "Enter MPG"]]} />

          {iceMode === "find" && (
            <div className="mt-5 space-y-5">
              <VehicleSearch list={catalogue} segment={segment} query={query} setQuery={setQuery} status={reference.status}
                onPick={(p) => { choose({ make: p.make, model: p.model, year: "any", engine: "any", versionId: p.id }); setQuery(""); }} />
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Field label="Make">
                  <Select label="Make" value={pick.make} placeholder={reference.status === "loading" ? "Loading makes" : "Choose make"}
                    onChange={(make) => choose({ ...NO_PICK, make })} options={makesFor(catalogue, segment).map((m) => ({ value: m, label: m }))} />
                </Field>
                <Field label="Model">
                  <Select label="Model" value={pick.model} placeholder="Choose model" disabled={!pick.make}
                    onChange={(model) => choose({ ...NO_PICK, make: pick.make, model })} options={pick.make ? modelsFor(catalogue, segment, pick.make).map((m) => ({ value: m, label: m })) : []} />
                </Field>
                <Field label="Year registered">
                  <Select label="Year registered" value={pick.year === "any" ? "" : pick.year} placeholder="Any year" disabled={!pick.model}
                    onChange={(y) => choose({ year: (y || "any") as YearChoice, engine: "any", versionId: "" })}
                    options={pick.model ? yearsFor(catalogue, filter).map((y) => ({ value: y, label: y === "current" ? "Current model" : y })) : []} />
                </Field>
                <Field label="Engine">
                  <Select label="Engine" value={pick.engine === "any" ? "" : pick.engine} placeholder="Any engine" disabled={!pick.model}
                    onChange={(e) => choose({ engine: e || "any", versionId: "" })}
                    options={pick.model ? enginesFor(catalogue, filter).map((e) => ({ value: e, label: engineText(e) })) : []} />
                </Field>
                <div className="col-span-2">
                  <Field label={versions.length > 1 ? `Version (${versions.length.toLocaleString("en-GB")})` : "Version"}>
                    <Select label="Version" value={chosen?.id ?? ""} placeholder={chosen ? undefined : "Choose make and model first"} disabled={!versions.length}
                      onChange={(id) => choose({ versionId: id })}
                      options={versions.map((x) => ({ value: x.id, label: `${x.version} · ${engineLabel(x)} · ${yearsOf(x)} · ${x.mpg.toFixed(1)} mpg` }))} />
                  </Field>
                </div>
              </div>
              {reference.status === "error" && <Note tone="amber">The full vehicle list didn&apos;t load, so only the TF Leasing list is shown. Refresh to try again, or enter the MPG.</Note>}
              {chosen && (
                <VehicleCard title={`${chosen.make} ${chosen.model}`} subtitle={chosen.version}
                  tags={<>
                    <Tag>{engineText(engineLabel(chosen))}</Tag>
                    <Tag>{yearsOf(chosen)}</Tag>
                    {chosen.cycle === "nedc" ? <Tag tone="amber">NEDC</Tag> : <Tag tone="emerald">WLTP</Tag>}
                  </>}
                  figure={<BigFigure label="MPG" unit="MPG" value={mpgEdit ?? chosen.mpg.toFixed(1)} onChange={setMpgEdit} edited={mpgEdit != null} onReset={() => setMpgEdit(null)} />}
                  foot={<>
                    {mpgEdit != null ? "MPG adjusted for this comparison." : `${chosen.source}${chosen.registrations ? `. ${chosen.registrations.toLocaleString("en-GB")} registered.` : "."}`}
                    {autoChosen && " The version shown is the one most often registered. Choose theirs above for a closer figure."}
                  </>} />
              )}
              {chosen && iceNedc && <NedcNote segment={segment} />}
            </div>
          )}

          {iceMode === "co2" && (
            <div className="mt-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fuel"><Segmented label="Fuel" value={manualFuel} onChange={setManualFuel} options={[["diesel", "Diesel"], ["petrol", "Petrol"]]} /></Field>
                <Field label="CO₂" hint="Box V.7 on the V5C.">
                  <UnitInput value={co2} onChange={setCo2} unit="g/km" label="CO₂ in grams per kilometre" placeholder="e.g. 182" />
                </Field>
                <Field label="First registered" hint="Box B on the V5C. Sets which test the CO₂ came from.">
                  <input type="month" value={firstReg} onChange={(e) => { setFirstReg(e.target.value); setCycleChoice(null); }} aria-label="First registered"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 transition hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[15px]" />
                </Field>
                <Field label="Test">
                  <Segmented label="Test" value={cycle} onChange={(c) => setCycleChoice(c)} options={[["wltp", "WLTP"], ["nedc", "NEDC (older)"]]} />
                </Field>
              </div>
              <Field label="Vehicle" hint="Optional. How it reads on the PDF.">
                <TextInput value={iceName} onChange={setIceName} placeholder="e.g. 2017 Ford Transit Custom 2.0 TDCi" label="Vehicle name" />
              </Field>
              <VehicleCard title={iceName.trim() || `Their ${manualFuel} ${segment}`} subtitle={co2Mpg ? `${num(co2)} g/km CO₂, ${cycle.toUpperCase()} test` : "Enter the CO₂ to work out the MPG"}
                figure={<div className="text-right"><div className="text-[28px] font-semibold leading-9 tracking-tight tabular-nums text-slate-900">{co2Mpg ? co2Mpg.toFixed(1) : "0.0"}</div><div className="mt-0.5 text-[12px] font-medium text-slate-500">MPG</div></div>}
                foot="Worked back from the CO₂, the way the official MPG is calculated." />
              {co2Mpg && cycle === "nedc" ? <NedcNote segment={segment} /> : null}
            </div>
          )}

          {iceMode === "mpg" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Fuel"><Segmented label="Fuel" value={manualFuel} onChange={setManualFuel} options={[["diesel", "Diesel"], ["petrol", "Petrol"]]} /></Field>
              <Field label="MPG" hint="The official combined figure is fairest, as the electric side uses one too.">
                <UnitInput value={manualMpg} onChange={setManualMpg} unit="MPG" label="Miles per gallon" placeholder="e.g. 42.8" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Vehicle" hint="Optional. How it reads on the PDF.">
                  <TextInput value={iceName} onChange={setIceName} placeholder="e.g. 2019 Volkswagen Transporter 2.0 TDI" label="Vehicle name" />
                </Field>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-slate-100 pt-5">
            <PriceRow {...priceProps(iceFuel)} name={`${fuelName} price`} />
          </div>
        </Step>

        <Step n={3} title={`The electric ${segment}`} hint={evModels.length ? "From the Ford range, or any electric vehicle by its miles per kWh." : undefined}>
          {evModels.length > 0 && (
            <div className="mb-5">
              <Segmented label="Electric vehicle" value={evFromRange ? "range" : "manual"} onChange={setEvMode} size="sm"
                options={[["range", "Ford range"], ["manual", "Enter miles per kWh"]]} />
            </div>
          )}
          {evFromRange ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Model">
                  <Select label="Electric model" value={evModel.key} onChange={(k) => { setEvKey(k); setEvId(""); setEvEdit(null); }}
                    options={evModels.map((m) => ({ value: m.key, label: m.label }))} />
                </Field>
                <Field label="Version">
                  <Select label="Electric version" value={evVehicle!.id} onChange={(id) => { setEvId(id); setEvEdit(null); }}
                    options={evModel.vehicles.map((x) => ({ value: x.id, label: x.derivative }))} />
                </Field>
              </div>
              <VehicleCard title={`${evVehicle!.make} ${evVehicle!.model}`} subtitle={evVehicle!.derivative}
                tags={<><Tag tone="emerald">Electric</Tag><Tag tone="emerald">WLTP</Tag></>}
                figure={<BigFigure label="Miles per kWh" unit="miles per kWh" value={evEdit ?? evVehicle!.efficiency.toFixed(1)} onChange={setEvEdit} edited={evEdit != null} onReset={() => setEvEdit(null)} />}
                foot={evEdit != null ? "Efficiency adjusted for this comparison." : `${evVehicle!.source ?? "Manufacturer WLTP"}. Measured at the plug, so charging losses are already in it.`} />
            </div>
          ) : (
            <div className="space-y-4">
              {evModels.length === 0 && (
                <Note>
                  The Ford electric {segment}s aren&apos;t in the list yet, so enter the official miles per kWh.
                  {canManage && <> They can be added on <a href="/fuel-calculator/admin" className="font-medium text-indigo-600 hover:text-indigo-800">Vehicles and prices</a>.</>}
                </Note>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Miles per kWh" hint="The official WLTP figure. It's measured at the plug, so charging losses are already in it.">
                  <UnitInput value={manualEff} onChange={setManualEff} unit="miles per kWh" label="Miles per kWh" placeholder="e.g. 3.6" />
                </Field>
                <Field label="Vehicle" hint="Optional. How it reads on the PDF.">
                  <TextInput value={evName} onChange={setEvName} placeholder={segment === "van" ? "e.g. Ford E-Transit Custom" : "e.g. Ford Explorer Extended Range RWD"} label="Electric vehicle name" />
                </Field>
              </div>
            </div>
          )}
        </Step>

        <Step n={4} title="Where it's charged" hint="Each source at today's UK average. Change any price for this comparison.">
          <div className="flex flex-wrap gap-1.5">
            {MIX_PRESETS.map((p) => <Chip key={p.label} on={CHARGE_KEYS.every((k) => p.mix[k] === mix[k])} onClick={() => setMix(p.mix)}>{p.label}</Chip>)}
          </div>
          <div className="mt-5">
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img"
              aria-label={CHARGE_KEYS.filter((k) => r.ev.shares[k] > 0).map((k) => `${CHARGE_NAME[k]} ${Math.round(r.ev.shares[k] * 100)}%`).join(", ")}>
              {CHARGE_KEYS.filter((k) => r.ev.shares[k] > 0).map((k) => (
                <div key={k} className="h-full transition-all first:rounded-l-full last:rounded-r-full" style={{ flexGrow: r.ev.shares[k], flexBasis: 0, background: CHARGE_COLOUR[k] }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px]">
              <span className={mixTotal === 100 ? "text-slate-500" : "font-medium text-amber-700"}>
                {mixTotal === 100 ? "Shares add to 100%" : `Shares add to ${mixTotal}%, so they're scaled to 100%`}
              </span>
              <span className="text-slate-500">Blended <b className="font-semibold tabular-nums text-slate-900">{fmtPence(r.ev.blendedPence, 2)}</b> a kWh</span>
            </div>
          </div>
          <div className="mt-5 hidden grid-cols-[minmax(0,1fr)_9rem_6rem] gap-3 border-b border-slate-100 pb-2 text-[12px] font-medium text-slate-500 sm:grid">
            <span>Source</span><span className="text-right">Price</span><span className="text-right">Share</span>
          </div>
          <div className="divide-y divide-slate-100">
            {CHARGE_KEYS.map((k) => (
              <ChargeRow key={k} {...priceProps(k)} share={String(mix[k])} onShare={(s) => setMix((m) => ({ ...m, [k]: Math.min(100, num(s)) }))} />
            ))}
          </div>
        </Step>
      </div>

      {/* ── The answer ── */}
      <aside ref={answerRef} id="answer" className="min-w-0 scroll-mt-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <Answer r={r} tone={v.tone} valid={r.valid} missing={missing} fuelName={fuelName} termMonths={termMonths} customerName={customerName.trim()}
          onExport={exportPdf} exporting={exporting} exportError={exportError} onWorkings={openWorkings} />
      </aside>

      {/* ── The workings ── */}
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">
        <section ref={workingsRef} className="scroll-mt-6 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
          <button type="button" onClick={() => setShowWorkings((s) => !s)} aria-expanded={showWorkings}
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">The workings</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">Every step from the figures above to the answer, so it can be checked by hand.</p>
            </div>
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-5 w-5 shrink-0 text-slate-400 transition ${showWorkings ? "rotate-180" : ""}`}>
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
          {showWorkings && (
            <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
              {r.valid ? (
                <ol className="space-y-5">
                  {steps.map((s, i) => (
                    <li key={s.title} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
                      <div className="flex items-center gap-2 sm:items-start">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-600">{i + 1}</span>
                        <span className="text-[14px] font-semibold text-slate-900">{s.title}</span>
                      </div>
                      <div className="space-y-1 break-words font-mono text-[12.5px] leading-5 text-slate-800">
                        {s.lines.map((l, j) => <div key={j} className={l.startsWith("  ") ? "pl-4 text-slate-500" : ""}>{l.trim()}</div>)}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[14px] text-slate-500">The workings appear once both vehicles and the mileage are in.</p>
              )}
            </div>
          )}
        </section>
        <p className="px-1 text-[12px] leading-5 text-slate-500">
          For comparison only, and not a formal quotation. Figures are estimates from official efficiency figures and UK average prices.
          Real running costs vary with driving style, journey type, load, weather, battery age and the prices actually paid.
          {" "}{customer === "private" ? "Prices include VAT." : "Business prices exclude reclaimable VAT; home electricity includes VAT."}
        </p>
      </div>

      {/* ── On a phone: the answer, always in reach ── */}
      {r.valid && !answerInView && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-900/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 text-white shadow-[0_-8px_24px_rgba(15,23,42,0.18)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <button type="button" onClick={() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="min-w-0 text-left">
              <div className={`text-[12px] font-medium ${v.tone === "cost" ? "text-amber-300" : "text-emerald-300"}`}>
                {v.tone === "saving" ? "Electric saves" : v.tone === "cost" ? "Electric costs more by" : "About the same"}
              </div>
              <div className="text-[20px] font-semibold leading-7 tabular-nums">
                {fmtPounds(Math.abs(r.saving.monthly))} <span className="text-[13px] font-normal text-slate-300">a month</span>
              </div>
            </button>
            <button type="button" onClick={exportPdf} disabled={exporting}
              className="h-11 shrink-0 rounded-xl bg-white px-4 text-[14px] font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60">
              {exporting ? "Preparing…" : "Export PDF"}
            </button>
          </div>
        </div>
      )}
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

function NedcNote({ segment }: { segment: Segment }) {
  return (
    <Note tone="amber">
      This figure comes from NEDC, the test used before September {segment === "van" ? "2019" : "2018"}. It flatters economy, typically by
      around a fifth, so the saving shown is if anything on the low side.
    </Note>
  );
}

function VehicleCard({ title, subtitle, tags, figure, foot }: { title: string; subtitle: string; tags?: ReactNode; figure: ReactNode; foot: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-6 text-slate-900">{title}</div>
          <div className="mt-0.5 text-[14px] leading-5 text-slate-600">{subtitle}</div>
          {tags && <div className="mt-3 flex flex-wrap gap-1.5">{tags}</div>}
        </div>
        <div className="shrink-0">{figure}</div>
      </div>
      <p className="mt-3 border-t border-slate-200/70 pt-3 text-[12.5px] leading-5 text-slate-500">{foot}</p>
    </div>
  );
}

function VehicleSearch({ list, segment, query, setQuery, status, onPick }: {
  list: PickVehicle[]; segment: Segment; query: string; setQuery: (q: string) => void; status: "loading" | "ready" | "error"; onPick: (v: PickVehicle) => void;
}) {
  const results = useMemo(() => searchCatalogue(list, query, segment, 8), [list, query, segment]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const show = open && query.trim().length > 0;
  return (
    <div className="relative">
      <div className="relative">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
        </svg>
        <input value={query} role="combobox" aria-expanded={show} aria-controls="vehicle-results" aria-label="Search for their vehicle"
          placeholder={status === "loading" ? "Loading 22,000 vehicles…" : `e.g. ${segment === "van" ? "Transit Custom 2.0 2018" : "Golf 1.5 TSI 2019"}`}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); onPick(results[active]); setOpen(false); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-base text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition placeholder:text-slate-400 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[15px]" />
      </div>
      {show && (
        <div id="vehicle-results" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/10">
          {results.length === 0 ? (
            <div className="px-4 py-3.5 text-[14px] text-slate-500">
              {status === "loading" ? "Still loading the vehicle list…" : "Nothing matches. Try fewer words, or the make and model alone."}
            </div>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto py-1">
              {results.map((x, i) => (
                <li key={x.id} role="option" aria-selected={i === active}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => { onPick(x); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left ${i === active ? "bg-slate-50" : ""}`}>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-slate-900">{x.make} {x.model}</div>
                      <div className="truncate text-[13px] text-slate-500">{x.version}</div>
                      <div className="text-[12px] text-slate-400">{engineText(engineLabel(x))} · {yearsOf(x)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[15px] font-semibold tabular-nums text-slate-900">{x.mpg.toFixed(1)}</div>
                      <div className="text-[11px] font-medium text-slate-400">MPG {x.cycle.toUpperCase()}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-1.5 text-[12.5px] text-slate-500">
        Search every car and van sold new in the UK 2012 to 2020 and Ireland 2021 to 2022, plus current Ford models. Or choose below.
      </p>
    </div>
  );
}

interface PriceProps { k: PriceKey; published: FuelPrice | undefined; value: string | undefined; customer: CustomerType; onChange: (v: string) => void; onReset: () => void }

function priceText({ k, published, value, customer }: PriceProps) {
  const edited = value != null && value !== "";
  const pub = edited ? num(value!) : published?.value ?? 0;
  const paid = effectivePence(k, pub, customer);
  const source = edited ? "Entered for this comparison" : published ? `${published.override ? "Set by TF Leasing" : published.source}${published.period ? `, ${published.period}` : ""}` : "No published price yet";
  return { edited, pub, paid, source, differs: Math.abs(paid - pub) > 0.005, vat: showsVat(k, customer) ? "incl. VAT" : "ex VAT" };
}

function PriceRow(p: PriceProps & { name: string }) {
  const t = priceText(p);
  const unit = PRICE_META[p.k].unit === "litre" ? "p/litre" : "p/kWh";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-slate-900">{p.name}</div>
        <div className="mt-0.5 text-[12.5px] leading-5 text-slate-500">
          UK average. {t.source}{p.published?.stale && !t.edited && <span className="font-medium text-amber-700">. May be out of date</span>}
        </div>
      </div>
      <div className="shrink-0 sm:w-44">
        <UnitInput value={t.edited ? p.value! : String(p.published?.value ?? "")} onChange={p.onChange} unit={unit} label={`${p.name}, pence per ${PRICE_META[p.k].unit}`} edited={t.edited} />
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[12px] text-slate-500 sm:justify-end">
          {t.differs && <span>Pays <b className="font-semibold tabular-nums text-slate-700">{t.paid.toFixed(2)}p</b> {t.vat}</span>}
          {t.edited && <LinkButton onClick={p.onReset}>Reset</LinkButton>}
        </div>
      </div>
    </div>
  );
}

function ChargeRow(p: PriceProps & { share: string; onShare: (s: string) => void }) {
  const t = priceText(p);
  const k = p.k as ChargeKey;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_9rem_6rem] sm:items-start">
      <div className="col-span-2 flex min-w-0 gap-2.5 sm:col-span-1">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHARGE_COLOUR[k] }} />
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-slate-900">{CHARGE_NAME[k]}</div>
          <div className="mt-0.5 text-[12.5px] leading-5 text-slate-500">
            {t.source}{p.published?.stale && !t.edited && <span className="font-medium text-amber-700">. May be out of date</span>}
          </div>
        </div>
      </div>
      <div>
        <UnitInput value={t.edited ? p.value! : String(p.published?.value ?? "")} onChange={p.onChange} unit="p/kWh" label={`${CHARGE_NAME[k]} price, pence per kWh`} edited={t.edited} />
        {(t.differs || t.edited) && (
          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[12px] text-slate-500">
            {t.differs ? <span>Pays <b className="font-semibold tabular-nums text-slate-700">{t.paid.toFixed(2)}p</b> {t.vat}</span> : <span />}
            {t.edited && <LinkButton onClick={p.onReset}>Reset</LinkButton>}
          </div>
        )}
      </div>
      <UnitInput value={p.share} onChange={p.onShare} unit="%" label={`${CHARGE_NAME[k]} share of charging`} />
    </div>
  );
}

function Answer({ r, tone, valid, missing, fuelName, termMonths, customerName, onExport, exporting, exportError, onWorkings }: {
  r: ReturnType<typeof compare>; tone: "saving" | "cost" | "level"; valid: boolean; missing: string[]; fuelName: string; termMonths: number; customerName: string;
  onExport: () => void; exporting: boolean; exportError: string | null; onWorkings: () => void;
}) {
  const max = Math.max(r.ice.monthly || 0, r.ev.monthly || 0, 1);
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07),0_12px_32px_-12px_rgba(15,23,42,0.18)]">
      <div className="bg-slate-900 px-6 pb-6 pt-5 text-white">
        <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-slate-400">
          <span>Monthly running cost</span>
          {customerName && <span className="truncate">{customerName}</span>}
        </div>
        {valid ? (
          <>
            <p className={`mt-5 text-[15px] font-medium ${tone === "cost" ? "text-amber-300" : "text-emerald-300"}`}>
              {tone === "saving" ? "Electric saves" : tone === "cost" ? "Electric costs more by" : "Electric costs about the same"}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[44px] font-semibold leading-none tracking-tight tabular-nums">{fmtPounds(Math.abs(r.saving.monthly))}</span>
              <span className="text-[15px] text-slate-300">a month</span>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-slate-300">
              <b className="font-semibold text-white tabular-nums">{fmtPounds(Math.abs(r.saving.annual))}</b> a year, and{" "}
              <b className="font-semibold text-white tabular-nums">{fmtPounds(Math.abs(r.saving.overTerm))}</b> over {termMonths} months
            </p>
          </>
        ) : (
          <>
            <p className="mt-5 text-[20px] font-semibold leading-7">The answer appears here</p>
            <ul className="mt-3 space-y-2 text-[14px] leading-5 text-slate-300">
              {missing.map((m) => (
                <li key={m} className="flex gap-2.5"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />{m}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="px-6 py-5">
        <div className="space-y-4">
          <Bar label={fuelName} colour={FOSSIL.fill} monthly={r.ice.monthly} perMile={r.ice.pencePerMile} max={max} ok={Number.isFinite(r.ice.monthly) && valid} />
          <Bar label="Electric" colour={ELECTRIC.fill} monthly={r.ev.monthly} perMile={r.ev.pencePerMile} max={max} ok={Number.isFinite(r.ev.monthly) && valid} />
        </div>

        {valid && (
          <table className="mt-5 w-full text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-slate-100 text-[12px] text-slate-500">
                <th className="pb-2 text-left font-medium" />
                <th className="pb-2 text-right font-medium">{fuelName}</th>
                <th className="pb-2 text-right font-medium">Electric</th>
                <th className="pb-2 text-right font-medium">{tone === "cost" ? "Extra" : "Saving"}</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {([
                ["A mile", fmtPence(r.ice.pencePerMile), fmtPence(r.ev.pencePerMile), fmtPence(Math.abs(r.saving.pencePerMile))],
                ["A month", fmtPounds(r.ice.monthly), fmtPounds(r.ev.monthly), fmtPounds(Math.abs(r.saving.monthly))],
                ["A year", fmtPounds(r.ice.annual), fmtPounds(r.ev.annual), fmtPounds(Math.abs(r.saving.annual))],
                [`${termMonths} months`, fmtPounds(r.ice.overTerm), fmtPounds(r.ev.overTerm), fmtPounds(Math.abs(r.saving.overTerm))],
              ] as const).map(([label, a, b, c]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-500">{label}</td>
                  <td className="py-2 text-right">{a}</td>
                  <td className="py-2 text-right">{b}</td>
                  <td className={`py-2 text-right font-semibold ${tone === "cost" ? "text-amber-700" : "text-emerald-700"}`}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button type="button" onClick={onExport} disabled={!valid || exporting}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          {exporting ? "Preparing the PDF…" : "Export PDF"}
        </button>
        {exportError && <p className="mt-2 text-[13px] text-rose-700">{exportError}</p>}
        {valid && <div className="mt-3 text-center"><LinkButton onClick={onWorkings}>See the workings</LinkButton></div>}
      </div>
    </div>
  );
}

function Bar({ label, colour, monthly, perMile, max, ok }: { label: string; colour: string; monthly: number; perMile: number; max: number; ok: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[14px] font-medium text-slate-900">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />{label}
        </span>
        <span className="text-[14px] tabular-nums text-slate-500">
          {ok ? <><b className="font-semibold text-slate-900">{fmtPounds(monthly)}</b> a month</> : "Not yet"}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: ok ? `${Math.max(2, (monthly / max) * 100)}%` : "0%", background: colour }} />
      </div>
      {ok && <div className="mt-1 text-[12px] tabular-nums text-slate-500">{fmtPence(perMile)} a mile</div>}
    </div>
  );
}
