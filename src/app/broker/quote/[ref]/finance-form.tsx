"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeFinance } from "@/lib/broker-finance-calc";
import { computeOutright, formatGbp } from "@/lib/broker-quote-pricing";
import { saveFinanceQuoteAction } from "./finance-actions";
import type {
  BusinessDiscountOption,
  EvOption,
  StockTurnOption,
  TestDriveOption,
  TradeInOption,
} from "./outright/form";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums";

export type FinanceRouteForm = "pcp" | "hp" | "hp_balloon";

export interface InterestRateOption {
  id: string;
  label: string;
  annualAprPct: number;
  depositAllowanceGbp: number | null;
  specificity: 3 | 2 | 1;
}

export interface OfpOption {
  id: number;
  vehicle: string;
  modelYear: string | null;
  balloonGbp: number;
  matchScore: number;
}

interface Props {
  ref: string;
  route: FinanceRouteForm;
  snapshotJson: string;
  defaultCashGbp: number | null;
  interestRate: InterestRateOption | null;
  ofpCandidates: OfpOption[];
  stockTurnRules: StockTurnOption[];
  evOffer: EvOption | null;
  tradeInOffers: TradeInOption[];
  testDriveOffers: TestDriveOption[];
  businessDiscount: BusinessDiscountOption | null;
  // Server keeps the four lookup attributes so the term/mileage
  // change-triggered re-lookup can pass them back without trusting
  // the client to remember.
  vehicleLookup: { vehicleClass: "car" | "van"; bucket: string; variant: string; derivative: string | null; modelYear: string | null; isEv: boolean; gateRelease: string | null };
  // Initial term + mileage to render with; the client will issue a
  // soft refresh against the same URL with new term/mileage in the
  // query string when the broker changes them, so the next render
  // hits the right OFP / interest cells. Phase 5 keeps the
  // term/mileage selectors fixed to a sensible set instead of a free
  // text input — the OFP grid only contains specific values anyway.
  initialTermMonths: number;
  initialAnnualMileage: number;
}

const TERM_OPTIONS = [24, 26, 36, 38, 48, 60];
const MILEAGE_OPTIONS_PV = [6000, 9000, 12000, 15000, 18000, 24000];
const MILEAGE_OPTIONS_CV = [9000, 12000, 18000, 24000, 30000, 36000];

export function FinanceQuoteForm({
  ref, route, snapshotJson, defaultCashGbp,
  interestRate, ofpCandidates, stockTurnRules, evOffer, tradeInOffers, testDriveOffers, businessDiscount,
  vehicleLookup, initialTermMonths, initialAnnualMileage,
}: Props) {
  const router = useRouter();
  const needsBalloon = route !== "hp";
  const mileageOptions = vehicleLookup.vehicleClass === "van" ? MILEAGE_OPTIONS_CV : MILEAGE_OPTIONS_PV;
  const [customerType, setCustomerType] = useState<"retail" | "business">("retail");
  const [vatBusiness, setVatBusiness] = useState(false);
  const [vehicleCash, setVehicleCash] = useState(defaultCashGbp === null ? "" : String(defaultCashGbp));
  const [commission, setCommission] = useState("");
  const [deposit, setDeposit] = useState("");
  const [term, setTerm] = useState(initialTermMonths);
  const [mileage, setMileage] = useState(initialAnnualMileage);
  const [chosenOfpId, setChosenOfpId] = useState<number | "">(ofpCandidates[0]?.id ?? "");
  const [stockTurnId, setStockTurnId] = useState<string>("");
  const [evChoice, setEvChoice] = useState<"none" | "wallbox" | "cash">("none");
  const [tradeInId, setTradeInId] = useState<string>("");
  const [testDriveId, setTestDriveId] = useState<string>("");
  const [applyBusinessDiscount, setApplyBusinessDiscount] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const businessEligible = customerType === "business" && vatBusiness;
  const businessDiscountActive = !!businessDiscount && businessEligible && applyBusinessDiscount;

  const chosenStockTurn = useMemo(() => stockTurnRules.find((r) => r.id === stockTurnId) ?? null, [stockTurnRules, stockTurnId]);
  const chosenTradeIn = useMemo(() => tradeInOffers.find((r) => r.id === tradeInId) ?? null, [tradeInOffers, tradeInId]);
  const chosenTestDrive = useMemo(() => testDriveOffers.find((r) => r.id === testDriveId) ?? null, [testDriveOffers, testDriveId]);
  const chosenOfp = useMemo(() => ofpCandidates.find((r) => r.id === chosenOfpId) ?? null, [ofpCandidates, chosenOfpId]);

  // The deductions stack ahead of the financing decision so the
  // financed principal reflects the price the customer is actually
  // paying for, not the sticker price.
  const outright = useMemo(() => computeOutright({
    vehicleCashGbp: parseFloat(vehicleCash) || 0,
    commissionExVatGbp: 0,        // commission added back AFTER finance, on top of the monthlies
    stockTurnBonusGbp: chosenStockTurn?.bonusGbp ?? 0,
    evCashGbp: evChoice === "cash" ? (evOffer?.cashAlternativeGbp ?? 0) : 0,
    tradeInGbp: chosenTradeIn?.amountGbp ?? 0,
    testDriveGbp: chosenTestDrive?.amountGbp ?? 0,
    businessDiscountPct: businessDiscountActive ? (businessDiscount?.extraDiscountPct ?? 0) : 0,
  }), [vehicleCash, chosenStockTurn, evChoice, evOffer, chosenTradeIn, chosenTestDrive, businessDiscountActive, businessDiscount]);

  // Apply the business APR uplift on top of the matched grid rate.
  const baseApr = interestRate?.annualAprPct ?? 0;
  const aprUplift = businessDiscountActive ? (businessDiscount?.aprUpliftPct ?? 0) : 0;
  const effectiveApr = baseApr + aprUplift;

  const finance = useMemo(() => computeFinance({
    effectiveCashGbp: outright.effectiveCashGbp,
    depositGbp: parseFloat(deposit) || 0,
    depositAllowanceGbp: interestRate?.depositAllowanceGbp ?? 0,
    termMonths: term,
    annualAprPct: effectiveApr,
    balloonGbp: needsBalloon ? (chosenOfp?.balloonGbp ?? 0) : 0,
  }), [outright.effectiveCashGbp, deposit, interestRate, term, effectiveApr, needsBalloon, chosenOfp]);

  const commissionEx = parseFloat(commission) || 0;
  const commissionVat = Math.round(commissionEx * 0.2 * 100) / 100;

  const canSave = parseFloat(vehicleCash) > 0 && interestRate !== null && (needsBalloon ? chosenOfp !== null : true);

  // When term or mileage changes we need to re-load the OFP / interest
  // candidates. Easiest is to push a fresh URL with the new params and
  // let the server-rendered page hand back updated lists.
  function reloadWithParams(nextTerm: number, nextMileage: number) {
    startRefresh(() => {
      router.replace(`/broker/quote/${ref}/${routePath(route)}?term=${nextTerm}&mileage=${nextMileage}`, { scroll: false });
    });
  }

  function save() {
    if (!canSave) {
      setError(interestRate === null ? "No interest rate matches that term + customer type yet." : needsBalloon && !chosenOfp ? "Pick an OFP balloon row above." : "Enter a cash price first.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveFinanceQuoteAction({
        ref,
        snapshotJson,
        route,
        customerType,
        customerIsVatBusiness: businessEligible,
        vehicleCashGbp: parseFloat(vehicleCash) || 0,
        commissionExVatGbp: commissionEx,
        depositGbp: parseFloat(deposit) || 0,
        termMonths: term,
        annualMileage: mileage,
        stockTurnRuleId: chosenStockTurn?.id ?? null,
        evOfferId: evChoice !== "none" ? evOffer?.id ?? null : null,
        evChoice: evChoice === "none" ? null : evChoice,
        tradeInOfferId: chosenTradeIn?.id ?? null,
        testDriveOfferId: chosenTestDrive?.id ?? null,
        businessDiscountOfferId: businessDiscountActive ? businessDiscount?.id ?? null : null,
        interestRateRuleId: interestRate?.id ?? null,
        ofpRowId: needsBalloon ? chosenOfp?.id ?? null : null,
        notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      router.push(`/broker/quotes/${res.quoteId}`);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Customer */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={customerType === "retail"} onChange={() => setCustomerType("retail")} className="h-4 w-4" />
            <span>Retail / personal</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" checked={customerType === "business"} onChange={() => setCustomerType("business")} className="h-4 w-4" />
            <span>Business</span>
          </label>
        </div>
        {customerType === "business" && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={vatBusiness} onChange={(e) => setVatBusiness(e.target.checked)} className="h-4 w-4" />
            Customer is VAT registered
          </label>
        )}
      </section>

      {/* Pricing inputs */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Vehicle &amp; commission</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Vehicle cash price (£)
            <input type="number" step="0.01" min={0} value={vehicleCash} onChange={(e) => setVehicleCash(e.target.value)} className={inp} required />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Your commission, ex VAT (£)
            <input type="number" step="0.01" min={0} value={commission} onChange={(e) => setCommission(e.target.value)} className={inp} />
          </label>
        </div>
      </section>

      {/* Finance inputs */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Finance terms</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700">
            Cash deposit (£)
            <input type="number" step="0.01" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inp} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Term (months)
            <select
              value={term}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setTerm(v); reloadWithParams(v, mileage); }}
              className={inp}
            >
              {TERM_OPTIONS.map((t) => <option key={t} value={t}>{t} months</option>)}
            </select>
          </label>
          <label className={`block text-xs font-medium text-slate-700 ${needsBalloon ? "" : "opacity-60"}`}>
            Annual mileage
            <select
              value={mileage}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setMileage(v); reloadWithParams(term, v); }}
              className={inp}
              disabled={!needsBalloon}
            >
              {mileageOptions.map((m) => <option key={m} value={m}>{m.toLocaleString()} miles</option>)}
            </select>
            {!needsBalloon && <p className="mt-1 text-[10px] text-slate-400">HP doesn&apos;t use mileage — no balloon involved.</p>}
          </label>
        </div>

        {/* Interest rate readout */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          {interestRate ? (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-slate-900">{interestRate.label}</span>
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{baseApr.toFixed(2)}% APR</span>
                {interestRate.depositAllowanceGbp !== null && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Deposit allowance {formatGbp(interestRate.depositAllowanceGbp)}</span>
                )}
                {businessDiscountActive && aprUplift > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">+ {aprUplift.toFixed(2)}% business APR uplift</span>
                )}
              </div>
            </>
          ) : (
            <span className="text-amber-700">No interest rate row matches this term + customer type yet. Ask admin to add one in <strong>Broker data → Interest grids</strong>.</span>
          )}
          {refreshing && <span className="ml-2 text-slate-400">Refreshing for new term / mileage…</span>}
        </div>

        {/* OFP picker — only PCP / HP-Balloon */}
        {needsBalloon && (
          <div className="mt-4">
            <h3 className="text-xs font-medium text-slate-700">OFP balloon</h3>
            {ofpCandidates.length === 0 ? (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                No OFP row matches this vehicle + term + mileage yet. Ask admin to upload Q&apos;s OFP file under Broker data → OFP.
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {ofpCandidates.slice(0, 4).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <input type="radio" checked={chosenOfpId === c.id} onChange={() => setChosenOfpId(c.id)} className="mt-0.5 h-4 w-4" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900 break-words">{c.vehicle}</span>
                      <span className="block text-[11px] text-slate-500">
                        {c.modelYear ? `MY ${c.modelYear}` : "Model year ?"} · score {c.matchScore}
                      </span>
                    </span>
                    <span className="tabular-nums font-semibold text-slate-900">{formatGbp(c.balloonGbp)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Totals card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Quote</h2>
        <dl className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
          <Row label="Vehicle cash" value={formatGbp(outright.vehicleCashGbp)} />
          {outright.businessDiscountGbp > 0 && (
            <Row label={`Business discount (${businessDiscount?.extraDiscountPct.toFixed(2)}%)`} value={<span className="text-emerald-700">− {formatGbp(outright.businessDiscountGbp)}</span>} />
          )}
          {outright.stockTurnBonusGbp > 0 && (
            <Row label="Stock turn bonus" value={<span className="text-emerald-700">− {formatGbp(outright.stockTurnBonusGbp)}</span>} />
          )}
          {outright.evCashGbp > 0 && (
            <Row label="EV cash alternative" value={<span className="text-emerald-700">− {formatGbp(outright.evCashGbp)}</span>} />
          )}
          {outright.tradeInGbp > 0 && (
            <Row label="Trade-in allowance" value={<span className="text-emerald-700">− {formatGbp(outright.tradeInGbp)}</span>} />
          )}
          {outright.testDriveGbp > 0 && (
            <Row label="Test-drive incentive" value={<span className="text-emerald-700">− {formatGbp(outright.testDriveGbp)}</span>} />
          )}
          <Row label="Effective cash price" value={<strong>{formatGbp(outright.effectiveCashGbp)}</strong>} />
          <div className="my-1 border-t border-slate-200" />
          <Row label="Cash deposit" value={<span className="text-slate-700">− {formatGbp(finance.depositGbp)}</span>} />
          {finance.depositAllowanceGbp > 0 && (
            <Row label="Deposit allowance" value={<span className="text-emerald-700">− {formatGbp(finance.depositAllowanceGbp)}</span>} />
          )}
          {needsBalloon && (
            <Row label="Optional Final Payment (balloon)" value={formatGbp(finance.balloonGbp)} />
          )}
          <Row label="Amount of credit" value={<strong>{formatGbp(finance.amountOfCreditGbp)}</strong>} />
          <Row label={`Monthly × ${finance.termMonths}`} value={<strong className="text-slate-900">{formatGbp(finance.monthlyGbp)}</strong>} />
          <Row label="Total payable" value={formatGbp(finance.totalPayableGbp)} />
          <Row label="Total charge for credit" value={formatGbp(finance.totalChargeForCreditGbp)} />
          <Row label="APR (representative)" value={`${finance.annualAprPct.toFixed(2)}%`} />
          {commissionEx > 0 && (
            <>
              <div className="my-1 border-t border-slate-200" />
              <Row label="Your commission" value={formatGbp(commissionEx)} />
              <Row label="VAT on commission" value={formatGbp(commissionVat)} />
            </>
          )}
        </dl>
      </section>

      {/* Business buyer + the four optional incentive sections, identical
          to outright. We share the same UI patterns so the broker has a
          consistent mental model across routes. */}
      {businessDiscount && (
        <section className={`rounded-2xl border p-5 shadow-sm ${businessEligible ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"}`}>
          <h2 className={`text-sm font-semibold ${businessEligible ? "text-indigo-900" : "text-slate-700"}`}>Business buyer allowance</h2>
          <p className={`mt-1 text-xs ${businessEligible ? "text-indigo-900/80" : "text-slate-500"}`}>
            {businessEligible
              ? `${businessDiscount.label} — ${businessDiscount.extraDiscountPct.toFixed(2)}% extra discount${businessDiscount.aprUpliftPct > 0 ? `, paired with a ${businessDiscount.aprUpliftPct.toFixed(2)}% APR uplift on this route` : ""}.`
              : "Available when the customer is a VAT-registered business — switch the customer type and tick the VAT box above to apply it."}
          </p>
          {businessEligible && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-indigo-900">
              <input type="checkbox" checked={applyBusinessDiscount} onChange={(e) => setApplyBusinessDiscount(e.target.checked)} className="h-4 w-4" />
              Apply the discount and APR uplift
            </label>
          )}
        </section>
      )}

      {stockTurnRules.length > 0 && (
        <IncentiveSection title="Stock turn bonus available" tone="amber">
          {[<RadioOption key="none" name="stockTurn" checked={stockTurnId === ""} onChange={() => setStockTurnId("")} label="Don't apply a bonus" />,
            ...stockTurnRules.map((r) => {
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
                      <span className="block text-xs text-slate-500">Customer must register by <strong>{deadline}</strong>{r.notes ? ` · ${r.notes}` : ""}</span>
                    </>
                  }
                />
              );
            }),
          ]}
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
            label={<>Cash alternative <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">{formatGbp(evOffer.cashAlternativeGbp)} off</span></>}
          />
        </IncentiveSection>
      )}

      {tradeInOffers.length > 0 && (
        <IncentiveSection title="Trade-in allowance" tone="violet">
          {[<RadioOption key="none" name="tradeIn" checked={tradeInId === ""} onChange={() => setTradeInId("")} label="No trade-in" />,
            ...tradeInOffers.map((r) => (
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
            )),
          ]}
        </IncentiveSection>
      )}

      {testDriveOffers.length > 0 && (
        <IncentiveSection title="Test-drive incentive" tone="sky">
          {[<RadioOption key="none" name="testDrive" checked={testDriveId === ""} onChange={() => setTestDriveId("")} label="No incentive" />,
            ...testDriveOffers.map((r) => (
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
            )),
          ]}
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

function routePath(route: FinanceRouteForm): "pcp" | "hp" | "hp-balloon" {
  if (route === "pcp") return "pcp";
  if (route === "hp") return "hp";
  return "hp-balloon";
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
