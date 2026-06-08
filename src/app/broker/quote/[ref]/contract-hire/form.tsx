"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatGbp } from "@/lib/broker-quote-pricing";
import { saveContractHireQuoteAction } from "./actions";
import type {
  BusinessDiscountOption,
  EvOption,
  StockTurnOption,
  TestDriveOption,
  TradeInOption,
} from "../outright/form";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums";

interface ChOption {
  funderId: string;
  funderName: string;
  initialRentalMultiplier: number;
  monthlyRentalGbp: number;
  monthlyMaintenanceGbp: number;
  excessMileagePence: number | null;
}

interface Availability {
  irms: number[];
  terms: number[];
  mileages: number[];
}

interface Props {
  ref: string;
  snapshotJson: string;
  capCode: string;
  availability: Availability;
  options: ChOption[];                                              // already filtered to current term/mileage/business/maintained
  initialIsBusiness: boolean;
  initialIsMaintained: boolean;
  initialTerm: number;
  initialMileage: number;
  initialIrm: number;
  stockTurnRules: StockTurnOption[];
  evOffer: EvOption | null;
  tradeInOffers: TradeInOption[];
  testDriveOffers: TestDriveOption[];
  businessDiscount: BusinessDiscountOption | null;
}

export function ContractHireForm({
  ref, snapshotJson, capCode, availability, options,
  initialIsBusiness, initialIsMaintained, initialTerm, initialMileage, initialIrm,
  stockTurnRules, evOffer, tradeInOffers, testDriveOffers, businessDiscount,
}: Props) {
  const router = useRouter();
  const [isBusiness, setIsBusiness] = useState(initialIsBusiness);
  const [isMaintained, setIsMaintained] = useState(initialIsMaintained);
  const [term, setTerm] = useState(initialTerm);
  const [mileage, setMileage] = useState(initialMileage);
  const [irm, setIrm] = useState(initialIrm);
  const [funderId, setFunderId] = useState<string>("");
  const [vatBusiness, setVatBusiness] = useState(false);
  const [commission, setCommission] = useState("");
  const [stockTurnId, setStockTurnId] = useState<string>("");
  const [evChoice, setEvChoice] = useState<"none" | "wallbox" | "cash">("none");
  const [tradeInId, setTradeInId] = useState<string>("");
  const [testDriveId, setTestDriveId] = useState<string>("");
  const [applyBusinessDiscount, setApplyBusinessDiscount] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Default funder = first option for the chosen IRM (cheapest by sort order).
  const optionsForIrm = useMemo(
    () => options.filter((o) => o.initialRentalMultiplier === irm),
    [options, irm],
  );
  const chosenFunderId = funderId || optionsForIrm[0]?.funderId || "";
  const chosen = useMemo(() => optionsForIrm.find((o) => o.funderId === chosenFunderId) ?? null, [optionsForIrm, chosenFunderId]);

  // The cash deductions stack still applies on CH (stock turn → reg
  // discount, EV / trade-in / test-drive / business discount). Customer
  // type is business when the broker's flagged a VAT-registered firm AND
  // ticked the business toggle. CH uses business=true mapping to BCH
  // pricing in the ratebook regardless of VAT registration (Ford's
  // commercial rates), which is why isBusiness and customerIsVatBusiness
  // are separate toggles below.
  const businessEligible = isBusiness && vatBusiness;
  const businessDiscountActive = !!businessDiscount && businessEligible && applyBusinessDiscount;

  const monthlyRental = chosen?.monthlyRentalGbp ?? 0;
  const monthlyMaintenance = isMaintained ? (chosen?.monthlyMaintenanceGbp ?? 0) : 0;
  const monthlyAll = monthlyRental + monthlyMaintenance;
  const initialRental = monthlyRental * irm;
  const totalOverTerm = initialRental + monthlyRental * (term - irm) + monthlyMaintenance * term;

  // The Phase 4 incentives are quoted as cash discounts. On CH we apply
  // them as a one-off rebate against the initial rental — the cleanest
  // way to express "Ford gave us £500 we can hand to the customer" for
  // a product that has no purchase price the discount could reduce.
  const chosenStockTurn = useMemo(() => stockTurnRules.find((r) => r.id === stockTurnId) ?? null, [stockTurnRules, stockTurnId]);
  const chosenTradeIn = useMemo(() => tradeInOffers.find((r) => r.id === tradeInId) ?? null, [tradeInOffers, tradeInId]);
  const chosenTestDrive = useMemo(() => testDriveOffers.find((r) => r.id === testDriveId) ?? null, [testDriveOffers, testDriveId]);
  const cashRebate =
    (chosenStockTurn?.bonusGbp ?? 0) +
    (evChoice === "cash" ? (evOffer?.cashAlternativeGbp ?? 0) : 0) +
    (chosenTradeIn?.amountGbp ?? 0) +
    (chosenTestDrive?.amountGbp ?? 0) +
    (businessDiscountActive ? Math.round(monthlyRental * term * (businessDiscount?.extraDiscountPct ?? 0) / 100 * 100) / 100 : 0);

  const customerInitialRentalNet = Math.max(0, initialRental - cashRebate);
  const customerTotalOverTerm = customerInitialRentalNet + monthlyRental * (term - irm) + monthlyMaintenance * term;

  const commissionEx = parseFloat(commission) || 0;
  const commissionVat = Math.round(commissionEx * 0.2 * 100) / 100;

  function refresh(next: Partial<{ term: number; mileage: number; isBusiness: boolean; isMaintained: boolean }>) {
    const qs = new URLSearchParams({
      term: String(next.term ?? term),
      mileage: String(next.mileage ?? mileage),
      irm: String(irm),
      business: (next.isBusiness ?? isBusiness) ? "1" : "0",
      maintained: (next.isMaintained ?? isMaintained) ? "1" : "0",
    });
    startRefresh(() => router.replace(`/broker/quote/${ref}/contract-hire?${qs.toString()}`, { scroll: false }));
  }

  const canSave = !!chosen;

  function save() {
    if (!canSave) { setError("Pick a funder with available rentals for this term + mileage + IRM."); return; }
    setError(null);
    start(async () => {
      const res = await saveContractHireQuoteAction({
        ref,
        snapshotJson,
        capCode,
        funderId: chosen!.funderId,
        funderName: chosen!.funderName,
        isBusiness,
        isMaintained,
        customerType: isBusiness ? "business" : "retail",
        customerIsVatBusiness: vatBusiness,
        termMonths: term,
        annualMileage: mileage,
        initialRentalMultiplier: irm,
        monthlyRentalGbp: monthlyRental,
        monthlyMaintenanceGbp: monthlyMaintenance,
        commissionExVatGbp: commissionEx,
        stockTurnRuleId: chosenStockTurn?.id ?? null,
        evOfferId: evChoice !== "none" ? evOffer?.id ?? null : null,
        evChoice: evChoice === "none" ? null : evChoice,
        tradeInOfferId: chosenTradeIn?.id ?? null,
        testDriveOfferId: chosenTestDrive?.id ?? null,
        businessDiscountOfferId: businessDiscountActive ? businessDiscount?.id ?? null : null,
        notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      router.push(`/broker/quotes/${res.quoteId}`);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Spec toggles */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Rental spec</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={!isBusiness} onChange={() => { setIsBusiness(false); refresh({ isBusiness: false }); }} className="h-4 w-4" />
            <span>Personal Contract Hire (PCH)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={isBusiness} onChange={() => { setIsBusiness(true); refresh({ isBusiness: true }); }} className="h-4 w-4" />
            <span>Business Contract Hire (BCH)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={!isMaintained} onChange={() => { setIsMaintained(false); refresh({ isMaintained: false }); }} className="h-4 w-4" />
            <span>Customer maintained</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={isMaintained} onChange={() => { setIsMaintained(true); refresh({ isMaintained: true }); }} className="h-4 w-4" />
            <span>Maintained (includes servicing)</span>
          </label>
        </div>
        {isBusiness && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={vatBusiness} onChange={(e) => setVatBusiness(e.target.checked)} className="h-4 w-4" />
            Customer is VAT registered <span className="text-xs text-slate-400">— unlocks the business discount + APR-equivalent uplift below</span>
          </label>
        )}
      </section>

      {/* Term + mileage + IRM + funder */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Term, mileage, upfront</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700">
            Term (months)
            <select value={term} onChange={(e) => { const v = parseInt(e.target.value, 10); setTerm(v); refresh({ term: v }); }} className={inp}>
              {availability.terms.map((t) => <option key={t} value={t}>{t} months</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Annual mileage
            <select value={mileage} onChange={(e) => { const v = parseInt(e.target.value, 10); setMileage(v); refresh({ mileage: v }); }} className={inp}>
              {availability.mileages.map((m) => <option key={m} value={m}>{m.toLocaleString()} miles</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Initial rentals
            <select value={irm} onChange={(e) => setIrm(parseInt(e.target.value, 10))} className={inp}>
              {availability.irms.map((i) => <option key={i} value={i}>{i} × monthly</option>)}
            </select>
            <span className="mt-1 block text-[10px] text-slate-400">Upfront = {irm} × monthly rental</span>
          </label>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-medium text-slate-700">Available rentals from the ratebook</h3>
          {refreshing && <span className="ml-2 text-xs text-slate-400">refreshing…</span>}
          {optionsForIrm.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">No funder has a rental for {irm}+ {term}m {mileage.toLocaleString()}mi on this spec.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {optionsForIrm.map((o) => (
                <label key={o.funderId} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <input type="radio" checked={chosenFunderId === o.funderId} onChange={() => setFunderId(o.funderId)} className="mt-0.5 h-4 w-4" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{o.funderName}</span>
                    <span className="block text-[11px] text-slate-500">
                      Initial {formatGbp(o.monthlyRentalGbp * o.initialRentalMultiplier)}, then {formatGbp(o.monthlyRentalGbp)}/mo
                      {isMaintained && o.monthlyMaintenanceGbp > 0 && <> + {formatGbp(o.monthlyMaintenanceGbp)}/mo maint</>}
                      {o.excessMileagePence !== null && <> · excess {o.excessMileagePence}p/mi</>}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">Monthly</span>
                    <span className="text-sm font-semibold tabular-nums text-slate-900">{formatGbp(o.monthlyRentalGbp + (isMaintained ? o.monthlyMaintenanceGbp : 0))}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Totals card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Quote</h2>
        {chosen ? (
          <dl className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <Row label={`${irm} × monthly initial rental`} value={formatGbp(initialRental)} />
            {cashRebate > 0 && (
              <Row label="Incentive rebate" value={<span className="text-emerald-700">− {formatGbp(cashRebate)}</span>} />
            )}
            <Row label={<strong>Customer initial rental</strong>} value={<strong>{formatGbp(customerInitialRentalNet)}</strong>} />
            <div className="my-1 border-t border-slate-200" />
            <Row label="Monthly rental" value={formatGbp(monthlyRental)} />
            {isMaintained && monthlyMaintenance > 0 && <Row label="Monthly maintenance" value={formatGbp(monthlyMaintenance)} />}
            <Row label={<strong>Total monthly</strong>} value={<strong className="text-slate-900">{formatGbp(monthlyAll)}</strong>} />
            <Row label={`Total over ${term} months`} value={formatGbp(totalOverTerm)} />
            <Row label="After incentives (gross)" value={formatGbp(customerTotalOverTerm)} />
            {commissionEx > 0 && (
              <>
                <div className="my-1 border-t border-slate-200" />
                <Row label="Your commission" value={formatGbp(commissionEx)} />
                <Row label="VAT on commission (20%)" value={formatGbp(commissionVat)} />
              </>
            )}
            <div className="my-1 border-t border-slate-200" />
            <Row label="Funder" value={chosen.funderName} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Pick a funder above to see the quote.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Your commission</h2>
        <label className="mt-3 block text-xs font-medium text-slate-700 sm:max-w-xs">
          Commission ex VAT (£)
          <input type="number" step="0.01" min={0} value={commission} onChange={(e) => setCommission(e.target.value)} className={inp} />
        </label>
      </section>

      {/* Business discount banner mirrors the outright/finance forms */}
      {businessDiscount && (
        <section className={`rounded-2xl border p-5 shadow-sm ${businessEligible ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"}`}>
          <h2 className={`text-sm font-semibold ${businessEligible ? "text-indigo-900" : "text-slate-700"}`}>Business buyer allowance</h2>
          <p className={`mt-1 text-xs ${businessEligible ? "text-indigo-900/80" : "text-slate-500"}`}>
            {businessEligible
              ? `${businessDiscount.label} — ${businessDiscount.extraDiscountPct.toFixed(2)}% extra discount applied as a rebate against the initial rental.`
              : "Available when the customer is a VAT-registered business — switch to BCH above and tick the VAT box."}
          </p>
          {businessEligible && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-indigo-900">
              <input type="checkbox" checked={applyBusinessDiscount} onChange={(e) => setApplyBusinessDiscount(e.target.checked)} className="h-4 w-4" />
              Apply the discount
            </label>
          )}
        </section>
      )}

      {stockTurnRules.length > 0 && (
        <IncentiveSection title="Stock turn bonus available" tone="amber">
          <RadioOption name="stockTurn" checked={stockTurnId === ""} onChange={() => setStockTurnId("")} label="Don't apply" />
          {stockTurnRules.map((r) => {
            const deadline = new Date(r.mustRegisterBy).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
            return (
              <RadioOption
                key={r.id} name="stockTurn"
                checked={stockTurnId === r.id}
                onChange={() => setStockTurnId(r.id)}
                label={
                  <>
                    <span className="font-medium text-slate-900">{r.label}</span>
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{formatGbp(r.bonusGbp)}</span>
                    <span className="block text-xs text-slate-500">Register by <strong>{deadline}</strong>{r.notes ? ` · ${r.notes}` : ""}</span>
                  </>
                }
              />
            );
          })}
        </IncentiveSection>
      )}

      {evOffer && (
        <IncentiveSection title={evOffer.label} tone="emerald">
          <RadioOption name="ev" checked={evChoice === "none"} onChange={() => setEvChoice("none")} label="Don't apply" />
          <RadioOption name="ev" checked={evChoice === "wallbox"} onChange={() => setEvChoice("wallbox")} label={evOffer.wallboxLabel} />
          <RadioOption
            name="ev"
            checked={evChoice === "cash"}
            onChange={() => setEvChoice("cash")}
            label={<>Cash alternative <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">{formatGbp(evOffer.cashAlternativeGbp)} rebate</span></>}
          />
        </IncentiveSection>
      )}

      {tradeInOffers.length > 0 && (
        <IncentiveSection title="Trade-in allowance" tone="violet">
          <RadioOption name="tradeIn" checked={tradeInId === ""} onChange={() => setTradeInId("")} label="No trade-in" />
          {tradeInOffers.map((r) => (
            <RadioOption
              key={r.id} name="tradeIn"
              checked={tradeInId === r.id}
              onChange={() => setTradeInId(r.id)}
              label={
                <>
                  <span className="font-medium text-slate-900">{r.label}</span>
                  <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">{formatGbp(r.amountGbp)}</span>
                  <span className="block text-[11px] text-slate-600 mt-0.5"><strong>T&Cs:</strong> {r.termsText}</span>
                </>
              }
            />
          ))}
        </IncentiveSection>
      )}

      {testDriveOffers.length > 0 && (
        <IncentiveSection title="Test-drive incentive" tone="sky">
          <RadioOption name="testDrive" checked={testDriveId === ""} onChange={() => setTestDriveId("")} label="No incentive" />
          {testDriveOffers.map((r) => (
            <RadioOption
              key={r.id} name="testDrive"
              checked={testDriveId === r.id}
              onChange={() => setTestDriveId(r.id)}
              label={
                <>
                  <span className="font-medium text-slate-900">{r.label}</span>
                  <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">{formatGbp(r.amountGbp)}</span>
                  {r.termsText && <span className="block text-[11px] text-slate-600 mt-0.5">{r.termsText}</span>}
                </>
              }
            />
          ))}
        </IncentiveSection>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Notes <span className="text-xs font-normal text-slate-400">(optional)</span></h2>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      </section>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{error}</div>}

      <div className="flex justify-end gap-2">
        <button onClick={save} disabled={pending || !canSave} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Saving…" : "Save quote"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function RadioOption({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4" />
      <span className="flex-1">{label}</span>
    </label>
  );
}

function IncentiveSection({ title, tone, children }: { title: string; tone: "amber" | "emerald" | "violet" | "sky"; children: React.ReactNode }) {
  const tones = {
    amber:   { border: "border-amber-200",   bg: "bg-amber-50",   text: "text-amber-900" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-900" },
    violet:  { border: "border-violet-200",  bg: "bg-violet-50",  text: "text-violet-900" },
    sky:     { border: "border-sky-200",     bg: "bg-sky-50",     text: "text-sky-900" },
  }[tone];
  return (
    <section className={`rounded-2xl border ${tones.border} ${tones.bg} p-5 shadow-sm`}>
      <h2 className={`text-sm font-semibold ${tones.text}`}>{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}
