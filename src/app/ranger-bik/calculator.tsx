"use client";

import { useEffect, useRef, useState } from "react";
import {
  TRIMS, breakdown, compareRangers, listExVatOf, money, pounds, rangerById, ratesFor, rulesFor, sourcesFor, versionsOfTrim, workings,
  type BreakdownSection, type Comparison, type RangerTrim, type Seats, type Settings, type TaxYearRates, type VehicleInput, type VehicleResult,
} from "@/lib/ranger-tax";
import { Chip, Field, LinkButton, Note, Segmented, Select, Step, Tag, TextInput, UnitInput } from "../fuel-calculator/ui";
import type { RangerPdfInput } from "./ranger-pdf";
import { saveRangerExportAction } from "./actions";

// The Ranger BIK Calculator. Everything recalculates as it's typed; the maths
// is lib/ranger-tax.ts, the same code the PDF prints its rows and workings from.
// Amber is taxed as a car, emerald taxed as a van and any saving.

export const CAR_FILL = "#d97706";
export const VAN_FILL = "#059669";

interface Slot { key: number; id: string; seats: Seats; options: string; rental: string; price: string }

// The usual conversation: the Wildtrak they came in for, its PHEV, and the 2-Seat.
const DEFAULT_SLOTS: Slot[] = [
  { key: 1, id: "wildtrak-diesel", seats: 5, options: "", rental: "", price: "" },
  { key: 2, id: "wildtrak-phev", seats: 5, options: "", rental: "", price: "" },
  { key: 3, id: "wildtrak-diesel", seats: 2, options: "", rental: "", price: "" },
];
const MAX_SLOTS = 4;
const TERMS = [24, 36, 48, 60];
const TAX_CHIPS = [20, 40, 45];
const BIZ_CHIPS = [19, 25];

const num = (s: string) => { const n = Number(String(s).replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
/** "£900 a month less", "£12 a month more", "the same". */
const lessOrMore = (n: number, per: string) => (Math.abs(n) < 0.5 ? "the same" : `${pounds(Math.abs(n))} ${per} ${n > 0 ? "less" : "more"}`);

export function RangerCalculator({ preparedBy, today }: { preparedBy: string; today: string }) {
  const { rates } = ratesFor(today);

  const [customerName, setCustomerName] = useState("");
  const [taxRate, setTaxRate] = useState("40");
  const [fuelCard, setFuelCard] = useState<"no" | "yes">("no");
  const [privateUse, setPrivateUse] = useState<"full" | "commuting">("full");
  const [funding, setFunding] = useState<"hire" | "buy">("hire");
  const [bizRate, setBizRate] = useState("25");
  const [vatReg, setVatReg] = useState<"yes" | "no">("yes");
  const [termMonths, setTermMonths] = useState(48);
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const nextKey = useRef(DEFAULT_SLOTS.length + 1);

  // VAT only comes into it with a Raptor: every other Ranger's VAT is reclaimable, and the same whichever is chosen.
  const hasRaptor = slots.some((s) => rangerById(s.id)!.payloadUnderTonne);
  const settings: Settings = {
    incomeTaxPct: Math.min(60, num(taxRate)), fuelCard: fuelCard === "yes", privateUse, funding,
    businessTaxPct: Math.min(50, num(bizRate)), vatRegistered: hasRaptor ? vatReg === "yes" : true, termMonths,
  };
  const inputs: VehicleInput[] = slots.map((s) => ({
    version: rangerById(s.id)!, seats: s.seats, optionsIncVat: num(s.options),
    monthlyRental: num(s.rental) > 0 ? num(s.rental) : null,
    pricePaidExVat: num(s.price) > 0 ? num(s.price) : null,
  }));
  const c = compareRangers(inputs, settings, rates);
  const sections = breakdown(c, settings, rates);
  const rules = rulesFor(c, rates);
  const steps = workings(c, settings, rates);
  const sources = sourcesFor(c, settings, rates);
  const rentalsIn = slots.filter((s) => num(s.rental) > 0).length;

  const update = (key: number, patch: Partial<Slot>) => setSlots((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const remove = (key: number) => setSlots((ss) => ss.filter((s) => s.key !== key));
  const add = () => setSlots((ss) => {
    if (ss.length >= MAX_SLOTS) return ss;
    // Offer the one the comparison doesn't have yet: the 2-Seat of the first, if it has one, else the first as it is.
    const first = rangerById(ss[0].id)!;
    const seats: Seats = first.twoSeat && !ss.some((s) => s.id === first.id && s.seats === 2) ? 2 : 5;
    return [...ss, { key: nextKey.current++, id: first.id, seats, options: "", rental: "", price: "" }];
  });

  const [showWorkings, setShowWorkings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const settingsLine = [
    `Driver pays ${settings.incomeTaxPct}% income tax`,
    settings.fuelCard ? "fuel card for private fuel" : "no private fuel",
    settings.privateUse === "commuting" ? "private use limited to commuting" : "full private use",
    settings.funding === "hire" ? "contract hire" : "bought or HP",
    `${settings.businessTaxPct}% business tax`,
    ...(hasRaptor ? [settings.vatRegistered ? "VAT registered" : "not VAT registered"] : []),
  ].join(" · ");

  async function exportPdf() {
    setExporting(true);
    setExportError(null);
    try {
      const date = new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });
      const data: RangerPdfInput = {
        customerName: customerName.trim(), preparedBy, date, ratesLabel: rates.label, termMonths, settingsLine,
        comparison: c, sections, rules, workings: steps, sources,
      };
      const [{ pdf }, { RangerComparisonPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./ranger-pdf")]);
      const blob = await pdf(<RangerComparisonPdf {...data} />).toBlob();
      const filename = `Ranger tax comparison${data.customerName ? ` - ${data.customerName.replace(/[\\/:*?"<>|]/g, "")}` : ""} - ${date}.pdf`;
      // Keep a copy for Saved comparisons; the download never waits on it.
      blobToBase64(blob).then((pdfBase64) => saveRangerExportAction({
        filename, customerName: data.customerName, vehicles: c.vehicles.map((v) => v.name).join(", "),
        bestName: c.best != null ? c.vehicles[c.best].name : null, savingAnnual: c.best != null ? c.savings[c.best] : null,
        savingMonthly: c.best != null ? c.savingsMonthly[c.best] : null, pdfBase64,
      })).catch((e) => console.error("Saving the export failed", e));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      console.error("Ranger comparison PDF failed", e);
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

  const best = c.best != null ? c.vehicles[c.best] : null;

  return (
    <div className="grid gap-5 pb-28 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:pb-12 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ── The inputs ── */}
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
        <Step n={1} title="The driver">
          <div className="grid gap-5">
            <Field label="Customer name" hint="Printed at the top of the PDF.">
              <TextInput value={customerName} onChange={setCustomerName} placeholder="e.g. Smith Groundworks Ltd" label="Customer name" />
            </Field>
            <Field label="Their income tax rate" hint="Their top rate. A Scottish taxpayer has their own rates, so enter theirs.">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap gap-1.5">
                  {TAX_CHIPS.map((t) => <Chip key={t} on={num(taxRate) === t} onClick={() => setTaxRate(String(t))}>{t}%</Chip>)}
                </div>
                <UnitInput value={taxRate} onChange={(v) => setTaxRate(v.slice(0, 5))} unit="%" label="Income tax rate, per cent" className="sm:w-32" />
              </div>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Private fuel" hint={`A car's fuel benefit is ${pounds(rates.carFuelMultiplier)} × its BIK rate; a van's is a flat ${pounds(rates.vanFuelBenefit)}.`}>
                <Segmented label="Private fuel" value={fuelCard} onChange={setFuelCard} options={[["no", "No fuel card"], ["yes", "Fuel card"]]} />
              </Field>
              <Field label="Private use" hint={privateUse === "commuting"
                ? "Only where their terms forbid other private use, and any other is insignificant. A car is taxed in full either way."
                : "A van used only for commuting carries no benefit charge at all."}>
                <Segmented label="Private use" value={privateUse} onChange={setPrivateUse} options={[["full", "Full"], ["commuting", "Commuting only"]]} />
              </Field>
            </div>
          </div>
        </Step>

        <Step n={2} title="The business">
          <div className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Funded by">
                <Segmented label="Funded by" value={funding} onChange={setFunding} options={[["hire", "Contract hire"], ["buy", "Bought or HP"]]} />
              </Field>
              {hasRaptor && (
                <Field label="VAT registered" hint="Asked because of the Raptor: it's a car for VAT, so some of its VAT can't be reclaimed.">
                  <Segmented label="VAT registered" value={vatReg} onChange={setVatReg} options={[["yes", "Yes"], ["no", "No"]]} />
                </Field>
              )}
            </div>
            <Field label="Business tax rate" hint="Corporation tax is 19% on profits up to £50,000 and 25% over £250,000. A sole trader or partnership enters the owner's income tax rate.">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-wrap gap-1.5">
                  {BIZ_CHIPS.map((t) => <Chip key={t} on={num(bizRate) === t} onClick={() => setBizRate(String(t))}>{t}%</Chip>)}
                </div>
                <UnitInput value={bizRate} onChange={(v) => setBizRate(v.slice(0, 5))} unit="%" label="Business tax rate, per cent" className="sm:w-32" />
              </div>
            </Field>
            <Field label={<>Compare over<span className="sm:hidden">, in months</span></>}>
              <Segmented label="Compare over" value={String(termMonths)} onChange={(t) => setTermMonths(Number(t))}
                options={TERMS.map((t) => [String(t), <>{t}<span className="max-sm:hidden"> months</span></>])} />
            </Field>
          </div>
        </Step>

        <Step n={3} title="The Rangers" hint="Up to four. The first is their choice; the others are measured against it.">
          <div className="space-y-4">
            {slots.map((s, i) => (
              <RangerSlot key={s.key} slot={s} index={i} result={c.vehicles[i]} funding={funding} canRemove={slots.length > 2}
                onChange={(p) => update(s.key, p)} onRemove={() => remove(s.key)} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {slots.length < MAX_SLOTS ? (
              <button type="button" onClick={add}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
                Add a Ranger
              </button>
            ) : <span className="text-[13px] text-slate-500">Four is the most a comparison takes.</span>}
          </div>
          {funding === "hire" && (
            <div className="mt-4">
              {rentalsIn === 0
                ? <Note>{`Add each Ranger's monthly rental to count the lease restriction on a car${hasRaptor ? " and the Raptor's VAT that can't be reclaimed" : ""}.`}</Note>
                : rentalsIn < slots.length
                  ? <Note tone="amber">{`Add a rental for every Ranger to count the lease restriction${hasRaptor ? " and VAT" : ""}. Until then it's left out for all of them, so they're compared like for like.`}</Note>
                  : null}
            </div>
          )}
        </Step>
      </div>

      {/* ── The answer ── */}
      <aside ref={answerRef} id="answer" className="min-w-0 scroll-mt-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start">
        <Answer c={c} rates={rates} termMonths={termMonths} customerName={customerName.trim()}
          onExport={exportPdf} exporting={exporting} exportError={exportError} onWorkings={openWorkings} />
      </aside>

      {/* ── The full picture, why, and the workings ── */}
      <div className="min-w-0 space-y-5 lg:col-span-2 lg:row-start-2">
        <FullPicture c={c} sections={sections} />
        <section className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
          <header className="px-5 pt-5 sm:px-6 sm:pt-6">
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Why each is taxed this way</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">HMRC&apos;s rules for pick-ups, {rates.label}.</p>
          </header>
          <div className="grid gap-x-6 gap-y-4 px-5 pb-5 pt-4 sm:grid-cols-2 sm:px-6 sm:pb-6">
            {rules.map((r) => (
              <div key={r.title} className="border-t-2 border-slate-100 pt-3">
                <h3 className="text-[14px] font-semibold text-slate-900">{r.title}</h3>
                <p className="mt-1 text-[13px] leading-5 text-slate-600">{r.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section ref={workingsRef} className="scroll-mt-6 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
          <button type="button" onClick={() => setShowWorkings((s) => !s)} aria-expanded={showWorkings}
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">The workings</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">Every step from the price list to the answer, so it can be checked by hand.</p>
            </div>
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-5 w-5 shrink-0 text-slate-400 transition ${showWorkings ? "rotate-180" : ""}`}>
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
          {showWorkings && (
            <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
              <ol className="grid gap-x-8 gap-y-6 md:grid-cols-2">
                {steps.map((s) => (
                  <li key={s.title} className={`min-w-0 ${s.title === "The difference" ? "md:col-span-2" : ""}`}>
                    <div className="text-[14px] font-semibold text-slate-900">{s.title}</div>
                    <div className="mt-2 space-y-1 break-words font-mono text-[12.5px] leading-5 text-slate-800">
                      {s.lines.map((l, j) => <div key={j} className={l.startsWith("  ") ? "pl-4 text-slate-500" : ""}>{l.trim()}</div>)}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-[12.5px] leading-5 text-slate-500">
                Rates: {sources.map((x) => `${x.label}, ${x.detail}`).join(". ")}.
              </p>
            </div>
          )}
        </section>
        <p className="px-1 text-[12px] leading-5 text-slate-500">
          {/* One string: the React Compiler drops a space after {value} in JSX text holding an &apos; entity. */}
          {`For comparison only, and not tax advice. Figures use HMRC's ${rates.label} rates and Ford's list prices, worked at the rates entered. The driver's and the business's own circumstances decide what they actually pay, and rates change each April. Over the term is at ${rates.label} rates.`}
        </p>
      </div>

      {/* ── On a phone: the answer, always in reach ── */}
      {!answerInView && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-900/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 text-white shadow-[0_-8px_24px_rgba(15,23,42,0.18)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <button type="button" onClick={() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="min-w-0 text-left">
              <div className="truncate text-[12px] font-medium text-emerald-300">{best ? `The ${best.name} saves` : "Lowest tax"}</div>
              <div className="text-[20px] font-semibold leading-7 tabular-nums">
                {best
                  ? <>{pounds(c.savings[c.best!])} <span className="text-[13px] font-normal text-slate-300">a year ·</span> {pounds(c.savingsMonthly[c.best!])} <span className="text-[13px] font-normal text-slate-300">a month</span></>
                  : <span className="text-[15px]">{c.vehicles[0].name}</span>}
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ─── Pieces ────────────────────────────────────────────────────────────────

function ClassTag({ v }: { v: VehicleResult }) {
  return <Tag tone={v.taxClass === "car" ? "amber" : "emerald"}>{v.taxClass === "car" ? "Taxed as a car" : "Taxed as a van"}</Tag>;
}

function RangerSlot({ slot, index, result, funding, canRemove, onChange, onRemove }: {
  slot: Slot; index: number; result: VehicleResult; funding: "hire" | "buy"; canRemove: boolean; onChange: (p: Partial<Slot>) => void; onRemove: () => void;
}) {
  const v = rangerById(slot.id)!;
  const versions = versionsOfTrim(v.trim);
  const isCar = result.taxClass === "car";
  const chooseTrim = (trim: RangerTrim) => {
    const list = versionsOfTrim(trim);
    const next = list.find((x) => x.fuel === v.fuel) ?? list[0];
    onChange({ id: next.id, seats: slot.seats === 2 && next.twoSeat ? 2 : 5 });
  };
  const chooseEngine = (id: string) => {
    const next = rangerById(id)!;
    onChange({ id, seats: slot.seats === 2 && next.twoSeat ? 2 : 5 });
  };
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold tabular-nums text-white">{index + 1}</span>
          <span className="text-[13px] font-medium text-slate-700">{index === 0 ? "Their choice" : "Alternative"}</span>
        </div>
        {canRemove && <LinkButton onClick={onRemove}>Remove</LinkButton>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Field label="Model">
          <Select label={`Ranger ${index + 1} model`} value={v.trim} onChange={(t) => chooseTrim(t as RangerTrim)} options={TRIMS.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Engine">
          <Select label={`Ranger ${index + 1} engine`} value={v.id} onChange={chooseEngine} options={versions.map((x) => ({ value: x.id, label: x.engineShort }))} />
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Seats">
            {v.twoSeat ? (
              <Segmented label={`Ranger ${index + 1} seats`} value={String(slot.seats) as "5" | "2"} onChange={(s) => onChange({ seats: Number(s) as Seats })}
                options={[["5", "5 seats"], ["2", "2-Seat"]]} />
            ) : (
              <div className="flex h-11 items-center rounded-xl bg-slate-100 px-3.5 text-[13px] text-slate-500">5 seats, no 2-Seat {v.trim}</div>
            )}
          </Field>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4 border-t border-slate-200/70 pt-4">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-6 text-slate-900">Ranger {result.name}</div>
          <div className="mt-0.5 text-[13px] leading-5 text-slate-600">Double Cab, {result.input.seats === 2 ? "2 seats" : "5 seats"}, {v.engine}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ClassTag v={result} />
            <Tag>{v.co2} g/km CO₂</Tag>
            <Tag>{result.pct != null ? `${result.pct}% BIK` : "Flat van charge"}</Tag>
            {v.payloadUnderTonne ? <Tag tone="amber">Car for VAT</Tag> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[24px] font-semibold leading-8 tracking-tight tabular-nums text-slate-900">{pounds(result.p11d)}</div>
          <div className="text-[12px] font-medium text-slate-500">P11D value</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Factory options" hint={isCar ? "At list price. They add to a car's P11D value." : "A van's tax is flat, so options don't change it."}>
          <UnitInput value={slot.options} onChange={(o) => onChange({ options: o.slice(0, 7) })} unit="£ incl. VAT" label={`Ranger ${index + 1} options, pounds incl. VAT`} placeholder="0" />
        </Field>
        {funding === "hire" ? (
          <Field label="Monthly rental" hint="Leave out any maintenance charge shown separately.">
            <UnitInput value={slot.rental} onChange={(o) => onChange({ rental: o.slice(0, 7) })} unit="£ ex VAT" label={`Ranger ${index + 1} monthly rental, pounds ex VAT`} placeholder="Optional" />
          </Field>
        ) : (
          <Field label="Price paid" hint={`List ${money(listExVatOf(v, num(slot.options)))}. Enter the price after any discount.`}>
            <UnitInput value={slot.price} onChange={(o) => onChange({ price: o.slice(0, 9) })} unit="£ ex VAT" label={`Ranger ${index + 1} price paid, pounds ex VAT`}
              placeholder={Math.round(listExVatOf(v, num(slot.options))).toLocaleString("en-GB")} />
          </Field>
        )}
      </div>
      <p className="mt-3 text-[12.5px] leading-5 text-slate-500">
        {v.source}.{result.input.seats === 2 ? " The 2-Seat has the 5-seat's list price and CO₂." : ""}
        {v.payloadKg && result.input.seats === 5 ? ` Payload ${v.payloadKg.toLocaleString("en-GB")} kg.` : v.payloadUnderTonne ? " Payload under one tonne." : ""}
      </p>
    </div>
  );
}

function Answer({ c, rates, termMonths, customerName, onExport, exporting, exportError, onWorkings }: {
  c: Comparison; rates: TaxYearRates; termMonths: number; customerName: string;
  onExport: () => void; exporting: boolean; exportError: string | null; onWorkings: () => void;
}) {
  const first = c.vehicles[0];
  const b = c.best;
  const best = b != null ? c.vehicles[b] : null;
  const max = Math.max(...c.vehicles.map((v) => v.together.annual), 1);
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07),0_12px_32px_-12px_rgba(15,23,42,0.18)]">
      <div className="bg-slate-900 px-6 pb-6 pt-5 text-white">
        <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-slate-400">
          <span>Tax a year, {rates.label}</span>
          {customerName && <span className="truncate">{customerName}</span>}
        </div>
        {best && b != null ? (
          <>
            <p className="mt-5 text-[15px] font-medium leading-6 text-emerald-300">The {best.name} saves</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[44px] font-semibold leading-none tracking-tight tabular-nums">{pounds(c.savings[b])}</span>
              <span className="text-[15px] text-slate-300">a year</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">{pounds(c.savingsMonthly[b])}</span>
              <span className="text-[15px] text-slate-300">a month</span>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-slate-300">
              The driver pays <b className="font-semibold text-white tabular-nums">{lessOrMore(first.driver.monthly - best.driver.monthly, "a month")}</b> and
              the business <b className="font-semibold text-white tabular-nums">{lessOrMore(first.business.annual - best.business.annual, "a year")}</b> than
              with the {first.name}.
            </p>
            <p className="mt-1.5 text-[13px] text-slate-400">
              <b className="font-semibold text-slate-200 tabular-nums">{pounds((c.savings[b] * termMonths) / 12)}</b> over {termMonths} months at {rates.label} rates
            </p>
          </>
        ) : (
          <>
            <p className="mt-5 text-[20px] font-semibold leading-7">{c.headline}</p>
            <p className="mt-2 text-[14px] leading-6 text-slate-300">
              {pounds(first.together.annual)} a year, {pounds(first.together.monthly)} a month: the driver {pounds(first.driver.monthly)} a month, the business {pounds(first.business.annual)} a year.
            </p>
          </>
        )}
      </div>

      <div className="px-6 py-5">
        <div className="space-y-4">
          {c.vehicles.map((v, i) => (
            <div key={i}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2 text-[14px] font-medium leading-5 text-slate-900">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: v.taxClass === "car" ? CAR_FILL : VAN_FILL }} />
                  <span className="min-w-0">{i + 1}. {v.name}</span>
                </span>
                <span className="shrink-0 text-[14px] tabular-nums text-slate-500"><b className="font-semibold text-slate-900">{pounds(v.together.annual)}</b> a year</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(2, (v.together.annual / max) * 100)}%`, background: v.taxClass === "car" ? CAR_FILL : VAN_FILL }} />
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] tabular-nums text-slate-500">
                <span>{v.taxClass === "car" ? "Car" : "Van"} · {pounds(v.together.monthly)} a month</span>
                {i > 0 && (Math.abs(c.savings[i]) < 0.5
                  ? <span>The same</span>
                  : <span className={`font-semibold ${c.savings[i] > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      {c.savings[i] > 0 ? "Saves " : ""}{pounds(Math.abs(c.savings[i]))} a year, {pounds(Math.abs(c.savingsMonthly[i]))} a month{c.savings[i] > 0 ? "" : " more"}
                    </span>)}
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={onExport} disabled={exporting}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          {exporting ? "Preparing the PDF…" : "Export PDF"}
        </button>
        {exportError && <p className="mt-2 text-[13px] text-rose-700">{exportError}</p>}
        <div className="mt-3 text-center"><LinkButton onClick={onWorkings}>See the workings</LinkButton></div>
      </div>
    </div>
  );
}

/** Every figure, one column per Ranger: a table from tablet up, one card per Ranger on a phone. */
function FullPicture({ c, sections }: { c: Comparison; sections: BreakdownSection[] }) {
  return (
    <section className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
      <header className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">The full picture</h2>
        <p className="mt-0.5 text-[13px] text-slate-500">Every figure for each Ranger. The business&apos;s tax is net of the relief it gets on it.</p>
      </header>

      <div className="hidden px-6 pb-6 pt-4 md:block">
        <table className="w-full table-fixed text-[13px] tabular-nums">
          <thead>
            <tr className="align-bottom">
              <th className="w-[26%] pb-3 text-left" />
              {c.vehicles.map((v, i) => (
                <th key={i} className="pb-3 pl-3 text-right align-bottom font-normal">
                  <div className="text-[13px] font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">{i + 1}. {v.name}</div>
                  <div className="mt-1.5 flex justify-end"><ClassTag v={v} /></div>
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((sec) => (
            <tbody key={sec.title}>
              <tr><td colSpan={c.vehicles.length + 1} className="border-b border-slate-200 pb-1.5 pt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{sec.title}</td></tr>
              {sec.rows.map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className={`py-2 pr-3 ${r.strong ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                    {r.label}{r.hint && <span className="block text-[11.5px] font-normal text-slate-400">{r.hint}</span>}
                  </td>
                  {r.values.map((x, i) => (
                    <td key={i} className={`py-2 pl-3 text-right ${valueClass(x, r.strong)}`}>{x}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="space-y-4 px-5 pb-5 pt-4 md:hidden">
        {c.vehicles.map((v, i) => (
          <div key={i} className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[15px] font-semibold leading-5 text-slate-900">{i + 1}. {v.name}</div>
              <ClassTag v={v} />
            </div>
            {sections.map((sec) => (
              <div key={sec.title} className="mt-3">
                <div className="border-b border-slate-200 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{sec.title}</div>
                <dl className="text-[13px] tabular-nums">
                  {sec.rows.map((r) => (
                    <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
                      <dt className={r.strong ? "font-semibold text-slate-900" : "text-slate-600"}>{r.label}</dt>
                      <dd className={`text-right ${valueClass(r.values[i], r.strong)}`}>{r.values[i]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A saving reads emerald, a cost amber; totals are bold. */
function valueClass(text: string, strong?: boolean): string {
  const weight = strong ? "font-semibold" : "";
  if (text.startsWith("Saves")) return `${weight} text-emerald-700`;
  if (text.endsWith(" more")) return `${weight} text-amber-700`;
  return strong ? "font-semibold text-slate-900" : "text-slate-700";
}

