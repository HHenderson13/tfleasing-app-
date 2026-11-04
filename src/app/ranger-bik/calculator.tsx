"use client";

import { useEffect, useRef, useState } from "react";
import {
  OPTION_GROUPS, TRIMS, assess, breakdown, compareRangers, freeColour, listExVatOf, optionById, optionsFor, pounds, rangerById, ratesFor, rulesFor,
  sourcesFor, versionsOfTrim, workings,
  type BreakdownSection, type Comparison, type OptionLine, type RangerTrim, type RangerVersion, type Seats, type Settings, type TaxYearRates,
  type VehicleInput, type VehicleResult,
} from "@/lib/ranger-tax";
import { Chip, Field, LinkButton, Note, Segmented, Select, Step, Tag, TextInput, UnitInput } from "../fuel-calculator/ui";
import type { RangerPdfInput } from "./ranger-pdf";
import { saveRangerExportAction } from "./actions";
import type { RangerPrefill } from "@/lib/customer-profiles";
import { ProfileBanner } from "../profiles/banner";

// The Ranger BIK Calculator. Everything recalculates as it's typed; the maths
// is lib/ranger-tax.ts, the same code the PDF prints its rows and workings from.
// Amber is taxed as a car, emerald taxed as a van and any saving.

export const CAR_FILL = "#d97706";
export const VAN_FILL = "#059669";

/** One Ranger in the comparison. Empty until the user picks it (user, 2026-11-04). */
interface Slot {
  key: number;
  trim: RangerTrim | "";
  id: string;
  seats: Seats;
  /** The chosen colour's option id; empty is the colour that costs nothing. */
  paint: string;
  options: string[];
  /** Anything not on the list, £ incl. VAT. */
  other: string;
  rental: string;
  price: string;
}

const emptySlot = (key: number): Slot => ({ key, trim: "", id: "", seats: 5, paint: "", options: [], other: "", rental: "", price: "" });
const MAX_SLOTS = 4;
const TERMS = [24, 36, 48, 60];
const TAX_CHIPS = [20, 40, 45];
const BIZ_CHIPS = [19, 25];

const num = (s: string) => { const n = Number(String(s).replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : 0; };
const isVan = (s: Slot, v: RangerVersion) => s.seats === 2 && v.twoSeat;

/** The options a slot adds to the P11D value. A van's tax is flat, so none. */
function optionLines(s: Slot, v: RangerVersion): OptionLine[] {
  if (isVan(s, v)) return [];
  const offered = new Set(optionsFor(v).map((o) => o.id));
  const picked = [s.paint, ...s.options].filter((id) => id && offered.has(id)).map((id) => optionById(id)!);
  const lines = picked.map((o) => ({ name: o.name, incVat: o.incVat }));
  return num(s.other) > 0 ? [...lines, { name: "Other options", incVat: num(s.other) }] : lines;
}

/** Opened from a Customer Profile: their Ranger and tax details as far as we know them. */
export interface RangerProfileLink { id: string; name: string; prefill: RangerPrefill }

export function RangerCalculator({ preparedBy, today, profile }: { preparedBy: string; today: string; profile?: RangerProfileLink | null }) {
  const pre = profile?.prefill;
  const { rates } = ratesFor(today);

  const [customerName, setCustomerName] = useState(pre?.customerName ?? "");
  const [taxRate, setTaxRate] = useState(pre?.taxRate ?? "40");
  const [fuelCard, setFuelCard] = useState<"no" | "yes">(pre?.fuelCard ?? "no");
  const [privateUse, setPrivateUse] = useState<"full" | "commuting">("full");
  const [funding, setFunding] = useState<"hire" | "buy">("hire");
  const [bizRate, setBizRate] = useState("25");
  const [vatReg, setVatReg] = useState<"yes" | "no">("yes");
  const [termMonths, setTermMonths] = useState(pre?.termMonths ?? 48);
  const [slots, setSlots] = useState<Slot[]>(() => [
    pre?.trim ? { ...emptySlot(1), trim: pre.trim, id: pre.versionId ?? "", seats: pre.seats, rental: pre.rental ? String(pre.rental) : "" } : emptySlot(1),
    emptySlot(2),
  ]);
  const nextKey = useRef(3);

  // Their choice has to be picked first: everything else is measured against it.
  const picked = slots[0].id
    ? slots.map((s, i) => ({ s, n: i + 1, v: s.id ? rangerById(s.id) : undefined })).filter((x): x is { s: Slot; n: number; v: RangerVersion } => !!x.v)
    : [];
  const numbers = picked.map((x) => x.n);
  // VAT only comes into it with a Raptor: every other Ranger's VAT is reclaimable, and the same whichever is chosen.
  const hasRaptor = picked.some((x) => x.v.payloadUnderTonne);
  const settings: Settings = {
    incomeTaxPct: Math.min(60, num(taxRate)), fuelCard: fuelCard === "yes", privateUse, funding,
    businessTaxPct: Math.min(50, num(bizRate)), vatRegistered: hasRaptor ? vatReg === "yes" : true, termMonths,
  };
  const inputOf = (s: Slot, v: RangerVersion): VehicleInput => ({
    version: v, seats: s.seats, options: optionLines(s, v),
    monthlyRental: num(s.rental) > 0 ? num(s.rental) : null,
    pricePaidExVat: num(s.price) > 0 ? num(s.price) : null,
  });
  const inputs = picked.map(({ s, v }) => inputOf(s, v));
  const c = inputs.length ? compareRangers(inputs, settings, rates) : null;
  const sections = c ? breakdown(c, settings, rates) : [];
  const rules = c ? rulesFor(c, rates) : [];
  const steps = c ? workings(c, settings, rates, numbers) : [];
  const sources = c ? sourcesFor(c, settings, rates) : rates.sources;
  const rentalsIn = picked.filter((x) => num(x.s.rental) > 0).length;
  // Each slot's own figures (class, BIK rate, P11D with options), whether or not their choice is picked yet.
  const resultFor = (s: Slot) => { const v = s.id ? rangerById(s.id) : undefined; return v ? assess(inputOf(s, v), settings, rates, false) : null; };

  const missing = [
    !slots[0].id && "Choose their Ranger in step 3",
    picked.length < 2 && "Choose a Ranger to compare it with",
  ].filter((m): m is string => !!m);

  const update = (key: number, patch: Partial<Slot>) => setSlots((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const remove = (key: number) => setSlots((ss) => ss.filter((s) => s.key !== key));
  const add = () => setSlots((ss) => (ss.length >= MAX_SLOTS ? ss : [...ss, emptySlot(nextKey.current++)]));

  const [showWorkings, setShowWorkings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [profileSave, setProfileSave] = useState<"saving" | "saved" | "failed" | null>(null);

  const settingsLine = [
    `Driver pays ${settings.incomeTaxPct}% income tax`,
    settings.fuelCard ? "fuel card for private fuel" : "no private fuel",
    settings.privateUse === "commuting" ? "private use limited to commuting" : "full private use",
    settings.funding === "hire" ? "contract hire" : "bought or HP",
    `${settings.businessTaxPct}% business tax`,
    ...(hasRaptor ? [settings.vatRegistered ? "VAT registered" : "not VAT registered"] : []),
  ].join(" · ");

  async function exportPdf() {
    if (!c || c.vehicles.length < 2) return;
    setExporting(true);
    setExportError(null);
    try {
      const date = new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });
      const data: RangerPdfInput = {
        customerName: customerName.trim(), preparedBy, date, ratesLabel: rates.label, termMonths, settingsLine,
        comparison: c, numbers, sections, rules, workings: steps, sources,
      };
      const [{ pdf }, { RangerComparisonPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./ranger-pdf")]);
      const blob = await pdf(<RangerComparisonPdf {...data} />).toBlob();
      const filename = `Ranger tax comparison${data.customerName ? ` - ${data.customerName.replace(/[\\/:*?"<>|]/g, "")}` : ""} - ${date}.pdf`;
      // Keep a copy for Saved comparisons; the download never waits on it.
      if (profile) setProfileSave("saving");
      blobToBase64(blob).then((pdfBase64) => saveRangerExportAction({
        filename, customerName: data.customerName, vehicles: c.vehicles.map((v) => v.name).join(", "),
        bestName: c.best != null ? c.vehicles[c.best].name : null, savingAnnual: c.best != null ? c.savings[c.best] : null,
        savingMonthly: c.best != null ? c.savingsMonthly[c.best] : null, pdfBase64, profileId: profile?.id ?? null,
      })).then((res) => { if (profile) setProfileSave(res.ok ? "saved" : "failed"); })
        .catch((e) => { console.error("Saving the export failed", e); if (profile) setProfileSave("failed"); });
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

  const ready = !!c && c.vehicles.length > 1;
  const b = ready && c.best != null ? c.best : null;

  return (
    <div className="pb-28 lg:pb-12">
      {profile && <ProfileBanner id={profile.id} name={profile.name} save={profileSave} />}
      {/* The steps and the answer share a grid of their own, so the sticky answer stops where the steps end
          and never slides over the full picture below. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
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

          <Step n={3} title="The Rangers" hint="Pick their choice first, then up to three to measure against it.">
            <div className="space-y-4">
              {slots.map((s, i) => (
                <RangerSlot key={s.key} slot={s} index={i} result={resultFor(s)} funding={funding} canRemove={slots.length > 2}
                  onChange={(p) => update(s.key, p)} onRemove={() => remove(s.key)} />
              ))}
            </div>
            <div className="mt-4">
              {slots.length < MAX_SLOTS ? (
                <button type="button" onClick={add}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
                  Add a Ranger
                </button>
              ) : <span className="text-[13px] text-slate-600">Four is the most a comparison takes.</span>}
            </div>
            {funding === "hire" && picked.length > 0 && (
              <div className="mt-4">
                {rentalsIn === 0
                  ? <Note>{`Add each Ranger's monthly rental to count the lease restriction on a car${hasRaptor ? " and the Raptor's VAT that can't be reclaimed" : ""}.`}</Note>
                  : rentalsIn < picked.length
                    ? <Note tone="amber">{`Add a rental for every Ranger to count the lease restriction${hasRaptor ? " and VAT" : ""}. Until then it's left out for all of them, so they're compared like for like.`}</Note>
                    : null}
              </div>
            )}
          </Step>
        </div>

        <aside ref={answerRef} id="answer" className="min-w-0 scroll-mt-6 lg:sticky lg:top-6 lg:self-start">
          <Answer c={c} numbers={numbers} missing={missing} rates={rates} termMonths={termMonths} customerName={customerName.trim()}
            onExport={exportPdf} exporting={exporting} exportError={exportError} onWorkings={openWorkings} />
        </aside>
      </div>

      {/* ── The full picture, why, and the workings ── */}
      {c && (
        <div className="mt-5 space-y-5 lg:mt-6">
          <FullPicture c={c} numbers={numbers} sections={sections} />
          <section className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
            <header className="px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Why each is taxed this way</h2>
              <p className="mt-0.5 text-[13px] text-slate-600">HMRC&apos;s rules for pick-ups, {rates.label}.</p>
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
                <p className="mt-0.5 text-[13px] text-slate-600">Every step from the price list to the answer, so it can be checked by hand.</p>
              </div>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-5 w-5 shrink-0 text-slate-500 transition ${showWorkings ? "rotate-180" : ""}`}>
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
                        {s.lines.map((l, j) => <div key={j} className={l.startsWith("  ") ? "pl-4 text-slate-600" : ""}>{l.trim()}</div>)}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-6 text-[12.5px] leading-5 text-slate-600">
                  Rates: {sources.map((x) => `${x.label}, ${x.detail}`).join(". ")}.
                </p>
              </div>
            )}
          </section>
          <p className="px-1 text-[12px] leading-5 text-slate-600">
            {/* One string: the React Compiler drops a space after {value} in JSX text holding an &apos; entity. */}
            {`For comparison only, and not tax advice. Figures use HMRC's ${rates.label} rates and Ford's list prices, worked at the rates entered. The driver's and the business's own circumstances decide what they actually pay, and rates change each April. Over the term is at ${rates.label} rates.`}
          </p>
        </div>
      )}

      {/* ── On a phone: the answer, always in reach ── */}
      {ready && !answerInView && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-900/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 text-white shadow-[0_-8px_24px_rgba(15,23,42,0.18)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <button type="button" onClick={() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="min-w-0 text-left">
              {b != null ? (
                <>
                  <div className="truncate text-[12px] font-medium text-emerald-300">The {c!.vehicles[b].name} saves</div>
                  <div className="text-[13px] leading-5 text-slate-300 tabular-nums">
                    Driver <b className="text-[16px] font-semibold text-white">{pounds(c!.split[b].driver.monthly)}</b> a month
                    <span className="mx-1.5 text-slate-400">·</span>
                    Business <b className="text-[16px] font-semibold text-white">{pounds(c!.split[b].business.annual)}</b> a year
                  </div>
                </>
              ) : (
                <div className="text-[14px] font-medium leading-5">The {c!.vehicles[0].name} pays the least tax</div>
              )}
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

/** Keep only what the new version offers, when the trim or engine changes. */
function keepOffered(s: Slot, next: RangerVersion): Partial<Slot> {
  const offered = new Set(optionsFor(next).map((o) => o.id));
  return { paint: offered.has(s.paint) ? s.paint : "", options: s.options.filter((id) => offered.has(id)) };
}

function RangerSlot({ slot, index, result, funding, canRemove, onChange, onRemove }: {
  slot: Slot; index: number; result: VehicleResult | null; funding: "hire" | "buy"; canRemove: boolean; onChange: (p: Partial<Slot>) => void; onRemove: () => void;
}) {
  const v = slot.id ? rangerById(slot.id) : undefined;
  const versions = slot.trim ? versionsOfTrim(slot.trim) : [];
  const chooseTrim = (t: string) => {
    if (!t) return onChange({ trim: "", id: "", options: [], paint: "" });
    const list = versionsOfTrim(t as RangerTrim);
    // One engine: nothing to choose. Two: the user picks.
    const next = list.length === 1 ? list[0] : undefined;
    onChange({ trim: t as RangerTrim, id: next?.id ?? "", seats: next?.twoSeat ? slot.seats : 5, ...(next ? keepOffered(slot, next) : { options: [], paint: "" }) });
  };
  const chooseEngine = (id: string) => {
    const next = id ? rangerById(id) : undefined;
    onChange({ id, seats: next?.twoSeat ? slot.seats : 5, ...(next ? keepOffered(slot, next) : { options: [], paint: "" }) });
  };
  const van = !!v && isVan(slot, v);
  const optionsTotal = result?.optionsIncVat ?? 0;

  return (
    <div className={`rounded-xl p-4 ring-1 ring-inset sm:p-5 ${v ? "bg-slate-50 ring-slate-200/70" : "bg-white ring-slate-200"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold tabular-nums text-white">{index + 1}</span>
          <span className="text-[13px] font-medium text-slate-700">{index === 0 ? "Their choice" : "Compare with"}</span>
        </div>
        {canRemove && <LinkButton onClick={onRemove}>Remove</LinkButton>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Field label="Model">
          <Select label={`Ranger ${index + 1} model`} value={slot.trim} onChange={chooseTrim} placeholder="Choose model" options={TRIMS.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Engine">
          <Select label={`Ranger ${index + 1} engine`} value={slot.id} onChange={chooseEngine} disabled={!slot.trim}
            placeholder={slot.trim ? "Choose engine" : "Model first"} options={versions.map((x) => ({ value: x.id, label: x.engineShort }))} />
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Seats">
            {v?.twoSeat ? (
              <Segmented label={`Ranger ${index + 1} seats`} value={String(slot.seats) as "5" | "2"} onChange={(s) => onChange({ seats: Number(s) as Seats })}
                options={[["5", "5 seats"], ["2", "2-Seat"]]} />
            ) : (
              <div className="flex h-11 items-center rounded-xl bg-slate-100 px-3.5 text-[13px] text-slate-600">
                {v ? `5 seats, no 2-Seat ${v.trim}` : "5 seats"}
              </div>
            )}
          </Field>
        </div>
      </div>

      {v && result && (
        <>
          <div className="mt-4 flex items-start justify-between gap-4 border-t border-slate-200/70 pt-4">
            <div className="min-w-0">
              <div className="text-[16px] font-semibold leading-6 text-slate-900">Ranger {result.name}</div>
              <div className="mt-0.5 text-[13px] leading-5 text-slate-600">Double Cab, {van ? "2 seats" : "5 seats"}, {v.engine}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <ClassTag v={result} />
                {van ? <Tag>Flat van charge</Tag> : <><Tag>{v.co2} g/km CO₂</Tag><Tag>{result.pct}% BIK</Tag></>}
                {v.payloadUnderTonne ? <Tag tone="amber">Car for VAT</Tag> : null}
              </div>
            </div>
            {!van && (
              <div className="shrink-0 text-right">
                <div className="text-[24px] font-semibold leading-8 tracking-tight tabular-nums text-slate-900">{pounds(result.p11d)}</div>
                <div className="text-[12px] font-medium text-slate-600">P11D value</div>
                {optionsTotal > 0 && <div className="mt-0.5 text-[12px] text-slate-600 tabular-nums">incl. {pounds(optionsTotal)} options</div>}
              </div>
            )}
          </div>

          {van
            ? <p className="mt-4 rounded-xl bg-white px-3.5 py-2.5 text-[13px] leading-5 text-slate-600 ring-1 ring-inset ring-slate-200/70">A van&apos;s tax is flat, so its price and options don&apos;t change it.</p>
            : <OptionsPicker slot={slot} v={v} total={optionsTotal} onChange={onChange} />}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {funding === "hire" ? (
              <Field label="Monthly rental" hint="Leave out any maintenance charge shown separately.">
                <UnitInput value={slot.rental} onChange={(o) => onChange({ rental: o.slice(0, 7) })} unit="£ ex VAT" label={`Ranger ${index + 1} monthly rental, pounds ex VAT`} placeholder="Optional" />
              </Field>
            ) : (
              <Field label="Price paid" hint={`List ${pounds(listExVatOf(v, optionsTotal))} ex VAT. Enter the price after any discount.`}>
                <UnitInput value={slot.price} onChange={(o) => onChange({ price: o.slice(0, 9) })} unit="£ ex VAT" label={`Ranger ${index + 1} price paid, pounds ex VAT`}
                  placeholder={Math.round(listExVatOf(v, optionsTotal)).toLocaleString("en-GB")} />
              </Field>
            )}
          </div>
          <p className="mt-3 text-[12.5px] leading-5 text-slate-600">
            {v.source}.
            {van ? " The 2-Seat conversion is £0 on Ford's list." : v.payloadKg ? ` Payload ${v.payloadKg.toLocaleString("en-GB")} kg.` : v.payloadUnderTonne ? " Payload under one tonne." : ""}
          </p>
        </>
      )}
    </div>
  );
}

/** Ford's chargeable options for this Ranger, ticked to build the P11D value. */
function OptionsPicker({ slot, v, total, onChange }: { slot: Slot; v: RangerVersion; total: number; onChange: (p: Partial<Slot>) => void }) {
  const [open, setOpen] = useState(false);
  const offered = optionsFor(v);
  const paints = offered.filter((o) => o.group === "paint");
  const count = (slot.paint ? 1 : 0) + slot.options.length + (num(slot.other) > 0 ? 1 : 0);
  const toggle = (id: string) => {
    const o = optionById(id)!;
    const one = OPTION_GROUPS.find((g) => g.key === o.group)!.one;
    const on = slot.options.includes(id);
    // In a choose-one group, ticking one unticks the others.
    const rest = slot.options.filter((x) => x !== id && !(one && optionById(x)?.group === o.group));
    onChange({ options: on ? rest : [...rest, id] });
  };
  return (
    <div className="mt-4 overflow-hidden rounded-xl bg-white ring-1 ring-inset ring-slate-200/70">
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-slate-900">Factory options</div>
          <div className="text-[12.5px] text-slate-600">
            {count ? `${count} chosen, ${pounds(total)} at list price, added to the P11D value` : "Colour, wheels, canopies and packs. Each adds its list price to the P11D value."}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-indigo-600">
          {open ? "Done" : count ? "Change" : "Add options"}
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 px-3.5 pb-4 pt-3.5">
          {paints.length > 0 && (
            <Field label="Colour">
              <Select label="Colour" value={slot.paint} onChange={(p) => onChange({ paint: p })}
                options={[{ value: "", label: `${freeColour(v)}, no charge` }, ...paints.map((p) => ({ value: p.id, label: `${p.name}, ${pounds(p.incVat)}` }))]} />
            </Field>
          )}
          {OPTION_GROUPS.filter((g) => g.key !== "paint").map((g) => {
            const list = offered.filter((o) => o.group === g.key);
            if (!list.length) return null;
            return (
              <div key={g.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-slate-700">{g.label}</span>
                  {g.one && list.length > 1 && <span className="text-[12px] text-slate-600">Choose one</span>}
                </div>
                <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-inset ring-slate-200/70">
                  {list.map((o) => (
                    <li key={o.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition hover:bg-slate-50">
                        <input type="checkbox" checked={slot.options.includes(o.id)} onChange={() => toggle(o.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] leading-5 text-slate-900">{o.name}</span>
                          <span className="block text-[12px] leading-4 text-slate-600">{o.code}{o.note ? `. ${o.note}` : ""}</span>
                        </span>
                        <span className="shrink-0 text-[14px] font-medium tabular-nums text-slate-700">{pounds(o.incVat)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <Field label="Anything else" hint="Dealer-fit accessories fitted before delivery count too, at list price with fitting.">
            <UnitInput value={slot.other} onChange={(o) => onChange({ other: o.slice(0, 7) })} unit="£ list price" label="Other options, pounds at list price" placeholder="0" />
          </Field>
          <p className="text-[12px] leading-5 text-slate-600">Ford&apos;s list prices including VAT, which is what the P11D value takes.</p>
        </div>
      )}
    </div>
  );
}

/** "£900 a month", "£12 a month more", "the same". */
const saveText = (n: number, per: string) => (Math.abs(n) < 0.5 ? "The same" : `${pounds(Math.abs(n))} ${per}${n < 0 ? " more" : ""}`);

function WhoSaves({ who, annual, monthly }: { who: string; annual: number; monthly: number }) {
  const more = annual < -0.5;
  return (
    <div className="rounded-xl bg-white/[0.06] px-4 py-3.5 ring-1 ring-inset ring-white/10">
      <div className={`text-[12px] font-semibold uppercase tracking-wide ${more ? "text-amber-300" : "text-emerald-300"}`}>{more ? `${who} pays more` : `${who} saves`}</div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">{pounds(Math.abs(annual))}</div>
      <div className="mt-1 text-[13px] text-slate-300">a year</div>
      <div className="mt-2 border-t border-white/10 pt-2 text-[14px] tabular-nums text-slate-200">
        <b className="font-semibold text-white">{pounds(Math.abs(monthly))}</b> a month
      </div>
    </div>
  );
}

function Answer({ c, numbers, missing, rates, termMonths, customerName, onExport, exporting, exportError, onWorkings }: {
  c: Comparison | null; numbers: number[]; missing: string[]; rates: TaxYearRates; termMonths: number; customerName: string;
  onExport: () => void; exporting: boolean; exportError: string | null; onWorkings: () => void;
}) {
  const ready = !!c && c.vehicles.length > 1;
  const b = ready ? c.best : null;
  const first = c?.vehicles[0];
  const best = b != null ? c!.vehicles[b] : null;
  const max = c ? Math.max(...c.vehicles.map((v) => v.together.annual), 1) : 1;
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07),0_12px_32px_-12px_rgba(15,23,42,0.18)]">
      <div className="bg-slate-900 px-6 pb-6 pt-5 text-white">
        <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-slate-400">
          <span>Tax saved, {rates.label}</span>
          {customerName && <span className="truncate">{customerName}</span>}
        </div>
        {best && b != null && first ? (
          <>
            <p className="mt-4 text-[15px] font-medium leading-6 text-white">The {best.name} saves</p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <WhoSaves who="The driver" annual={c!.split[b].driver.annual} monthly={c!.split[b].driver.monthly} />
              <WhoSaves who="The business" annual={c!.split[b].business.annual} monthly={c!.split[b].business.monthly} />
            </div>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[13px] text-slate-400">Together</span>
              <span className="text-[15px] tabular-nums text-slate-200">
                <b className="text-[20px] font-semibold text-white">{pounds(c!.savings[b])}</b> a year, <b className="font-semibold text-white">{pounds(c!.savingsMonthly[b])}</b> a month
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-slate-400">
              Against the {first.name}. <b className="font-semibold text-slate-200 tabular-nums">{pounds((c!.savings[b] * termMonths) / 12)}</b> over {termMonths} months at {rates.label} rates.
            </p>
          </>
        ) : ready && first ? (
          <>
            <p className="mt-5 text-[20px] font-semibold leading-7">{c!.headline}</p>
            <p className="mt-2 text-[14px] leading-6 text-slate-300">
              {`The driver pays ${pounds(first.driver.monthly)} a month and the business ${pounds(first.business.annual)} a year.`}
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
        {c ? (
          <div className="space-y-4">
            {c.vehicles.map((v, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-2 text-[14px] font-medium leading-5 text-slate-900">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: v.taxClass === "car" ? CAR_FILL : VAN_FILL }} />
                    <span className="min-w-0">{numbers[i]}. {v.name}</span>
                  </span>
                  <span className="shrink-0 text-[14px] tabular-nums text-slate-600"><b className="font-semibold text-slate-900">{pounds(v.together.annual)}</b> a year</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(2, (v.together.annual / max) * 100)}%`, background: v.taxClass === "car" ? CAR_FILL : VAN_FILL }} />
                </div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] tabular-nums text-slate-600">
                  <span>Driver {pounds(v.driver.monthly)} · business {pounds(v.business.monthly)} a month</span>
                  {i > 0 && (Math.abs(c.savings[i]) < 0.5
                    ? <span>The same</span>
                    : <span className={`font-semibold ${c.savings[i] > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                        {c.savings[i] > 0 ? "Saves " : ""}{saveText(c.savingsMonthly[i], "a month")}
                      </span>)}
                </div>
              </div>
            ))}
            {!ready && <p className="text-[13px] text-slate-600">Choose a Ranger to compare it with.</p>}
          </div>
        ) : (
          <p className="text-[13px] leading-5 text-slate-600">Each Ranger&apos;s tax, the driver&apos;s and the business&apos;s, shows here as you pick them.</p>
        )}

        <button type="button" onClick={onExport} disabled={!ready || exporting}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          {exporting ? "Preparing the PDF…" : "Export PDF"}
        </button>
        {exportError && <p className="mt-2 text-[13px] text-rose-700">{exportError}</p>}
        {ready && <div className="mt-3 text-center"><LinkButton onClick={onWorkings}>See the workings</LinkButton></div>}
      </div>
    </div>
  );
}

/** Every figure, one column per Ranger: a table from tablet up, one card per Ranger on a phone. */
function FullPicture({ c, numbers, sections }: { c: Comparison; numbers: number[]; sections: BreakdownSection[] }) {
  return (
    <section className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
      <header className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">The full picture</h2>
        <p className="mt-0.5 text-[13px] text-slate-600">Every figure for each Ranger, and who saves what. The business&apos;s tax is net of the relief it gets on it.</p>
      </header>

      <div className="hidden px-6 pb-6 pt-4 md:block">
        <table className="w-full table-fixed text-[13px] tabular-nums">
          <thead>
            <tr className="align-bottom">
              <th className="w-[26%] pb-3 text-left" />
              {c.vehicles.map((v, i) => (
                <th key={i} className="pb-3 pl-3 text-right align-bottom font-normal">
                  <div className="text-[13px] font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">{numbers[i]}. {v.name}</div>
                  <div className="mt-1.5 flex justify-end"><ClassTag v={v} /></div>
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((sec) => (
            <tbody key={sec.title}>
              <tr><td colSpan={c.vehicles.length + 1} className={`border-b border-slate-200 pb-1.5 pt-4 text-[12px] font-semibold uppercase tracking-wide ${savingSection(sec) ? "text-emerald-700" : "text-slate-600"}`}>{sec.title}</td></tr>
              {sec.rows.map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className={`py-2 pr-3 ${r.strong ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                    {r.label}{r.hint && <span className="block text-[11.5px] font-normal text-slate-600">{r.hint}</span>}
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
              <div className="min-w-0 text-[15px] font-semibold leading-5 text-slate-900">{numbers[i]}. {v.name}</div>
              <ClassTag v={v} />
            </div>
            {sections.map((sec) => (
              <div key={sec.title} className="mt-3">
                <div className={`border-b border-slate-200 pb-1 text-[11.5px] font-semibold uppercase tracking-wide ${savingSection(sec) ? "text-emerald-700" : "text-slate-600"}`}>{sec.title}</div>
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

const savingSection = (sec: BreakdownSection) => sec.title.startsWith("Saving");

/** A saving reads emerald, a cost amber; totals are bold. */
function valueClass(text: string, strong?: boolean): string {
  const weight = strong ? "font-semibold" : "";
  if (text.startsWith("Saves")) return `${weight} text-emerald-700`;
  if (text.endsWith(" more")) return `${weight} text-amber-700`;
  return strong ? "font-semibold text-slate-900" : "text-slate-700";
}

