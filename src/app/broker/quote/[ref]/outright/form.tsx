"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeOutright, formatGbp } from "@/lib/broker-quote-pricing";
import { saveOutrightQuoteAction } from "./actions";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums";

export interface StockTurnOption {
  id: string;
  label: string;
  bonusGbp: number;
  mustRegisterBy: string;
  notes: string | null;
}

export interface EvOption {
  id: string;
  label: string;
  cashAlternativeGbp: number;
  wallboxLabel: string;
}

export interface TradeInOption {
  id: string;
  label: string;
  amountGbp: number;
  termsText: string;
}

export interface TestDriveOption {
  id: string;
  label: string;
  amountGbp: number;
  termsText: string | null;
}

export interface BusinessDiscountOption {
  id: string;
  label: string;
  extraDiscountPct: number;
  aprUpliftPct: number;
  notes: string | null;
}

interface Props {
  ref: string;
  snapshotJson: string;
  defaultCashGbp: number | null;
  stockTurnRules: StockTurnOption[];
  evOffer: EvOption | null;
  tradeInOffers: TradeInOption[];
  testDriveOffers: TestDriveOption[];
  businessDiscount: BusinessDiscountOption | null;
}

export function OutrightQuoteForm({
  ref, snapshotJson, defaultCashGbp, stockTurnRules,
  evOffer, tradeInOffers, testDriveOffers, businessDiscount,
}: Props) {
  const router = useRouter();
  const [customerType, setCustomerType] = useState<"retail" | "business">("retail");
  const [vatBusiness, setVatBusiness] = useState(false);
  const [vehicleCash, setVehicleCash] = useState(defaultCashGbp === null ? "" : String(defaultCashGbp));
  const [commission, setCommission] = useState("");
  const [stockTurnId, setStockTurnId] = useState<string>("");
  const [evChoice, setEvChoice] = useState<"none" | "wallbox" | "cash">("none");
  const [tradeInId, setTradeInId] = useState<string>("");
  const [testDriveId, setTestDriveId] = useState<string>("");
  const [applyBusinessDiscount, setApplyBusinessDiscount] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const businessEligible = customerType === "business" && vatBusiness;
  const businessDiscountActive = !!businessDiscount && businessEligible && applyBusinessDiscount;

  const chosenStockTurn = useMemo(() => stockTurnRules.find((r) => r.id === stockTurnId) ?? null, [stockTurnRules, stockTurnId]);
  const chosenTradeIn = useMemo(() => tradeInOffers.find((r) => r.id === tradeInId) ?? null, [tradeInOffers, tradeInId]);
  const chosenTestDrive = useMemo(() => testDriveOffers.find((r) => r.id === testDriveId) ?? null, [testDriveOffers, testDriveId]);

  const totals = useMemo(() => computeOutright({
    vehicleCashGbp: parseFloat(vehicleCash) || 0,
    commissionExVatGbp: parseFloat(commission) || 0,
    stockTurnBonusGbp: chosenStockTurn?.bonusGbp ?? 0,
    evCashGbp: evChoice === "cash" ? (evOffer?.cashAlternativeGbp ?? 0) : 0,
    tradeInGbp: chosenTradeIn?.amountGbp ?? 0,
    testDriveGbp: chosenTestDrive?.amountGbp ?? 0,
    businessDiscountPct: businessDiscountActive ? (businessDiscount?.extraDiscountPct ?? 0) : 0,
  }), [vehicleCash, commission, chosenStockTurn, chosenTradeIn, chosenTestDrive, evChoice, evOffer, businessDiscountActive, businessDiscount]);

  const canSave = parseFloat(vehicleCash) > 0;

  function save() {
    if (!canSave) { setError("Enter a vehicle cash price first."); return; }
    setError(null);
    start(async () => {
      const res = await saveOutrightQuoteAction({
        ref,
        snapshotJson,
        customerType,
        customerIsVatBusiness: businessEligible,
        vehicleCashGbp: parseFloat(vehicleCash) || 0,
        commissionExVatGbp: parseFloat(commission) || 0,
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Pricing</h2>
        <p className="mt-1 text-xs text-slate-500">
          {defaultCashGbp !== null
            ? "Cash price pre-filled from TrustFord's vehicle table — override if you've agreed something different."
            : "TrustFord hasn't set a cash price for this exact vehicle yet — enter the price you've agreed."}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Vehicle cash price (£)
            <input type="number" inputMode="decimal" step="0.01" min={0} value={vehicleCash} onChange={(e) => setVehicleCash(e.target.value)} className={inp} required />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Your commission, ex VAT (£)
            <input type="number" inputMode="decimal" step="0.01" min={0} value={commission} onChange={(e) => setCommission(e.target.value)} className={inp} />
          </label>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
          <Row label="Vehicle cash" value={formatGbp(totals.vehicleCashGbp)} />
          {totals.businessDiscountGbp > 0 && (
            <Row label={`Business discount (${businessDiscount?.extraDiscountPct.toFixed(2)}%)`} value={<span className="text-emerald-700">− {formatGbp(totals.businessDiscountGbp)}</span>} />
          )}
          {totals.stockTurnBonusGbp > 0 && (
            <Row label="Stock turn bonus" value={<span className="text-emerald-700">− {formatGbp(totals.stockTurnBonusGbp)}</span>} />
          )}
          {totals.evCashGbp > 0 && (
            <Row label="EV cash alternative" value={<span className="text-emerald-700">− {formatGbp(totals.evCashGbp)}</span>} />
          )}
          {totals.tradeInGbp > 0 && (
            <Row label="Trade-in allowance" value={<span className="text-emerald-700">− {formatGbp(totals.tradeInGbp)}</span>} />
          )}
          {totals.testDriveGbp > 0 && (
            <Row label="Test-drive incentive" value={<span className="text-emerald-700">− {formatGbp(totals.testDriveGbp)}</span>} />
          )}
          <Row label="Your commission" value={formatGbp(totals.commissionExVatGbp)} />
          <Row label="VAT on commission (20%)" value={formatGbp(totals.commissionVatGbp)} />
          <div className="my-1 border-t border-slate-200" />
          <Row label={<strong>Customer pays</strong>} value={<strong className="text-slate-900">{formatGbp(totals.customerTotalGbp)}</strong>} />
        </div>
      </section>

      {businessDiscount && (
        <section className={`rounded-2xl border p-5 shadow-sm ${businessEligible ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"}`}>
          <h2 className={`text-sm font-semibold ${businessEligible ? "text-indigo-900" : "text-slate-700"}`}>Business buyer allowance</h2>
          <p className={`mt-1 text-xs ${businessEligible ? "text-indigo-900/80" : "text-slate-500"}`}>
            {businessEligible
              ? `${businessDiscount.label} — ${businessDiscount.extraDiscountPct.toFixed(2)}% extra discount off the cash price for VAT-registered business customers.`
              : "Available when the customer is a VAT-registered business — switch the customer type and tick the VAT box above to apply it."}
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
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-900">Stock turn bonus available</h2>
          <p className="mt-1 text-xs text-amber-900/80">
            This vehicle qualifies for the programme(s) below. Pick one to pass the bonus to the customer as a discount.
          </p>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm">
              <input type="radio" checked={stockTurnId === ""} onChange={() => setStockTurnId("")} className="mt-0.5 h-4 w-4" />
              <span className="flex-1">
                <span className="font-medium text-slate-900">Don&apos;t apply a bonus</span>
              </span>
            </label>
            {stockTurnRules.map((r) => {
              const deadline = new Date(r.mustRegisterBy).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
              return (
                <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm">
                  <input type="radio" checked={stockTurnId === r.id} onChange={() => setStockTurnId(r.id)} className="mt-0.5 h-4 w-4" />
                  <span className="flex-1">
                    <span className="font-medium text-slate-900">{r.label}</span>
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{formatGbp(r.bonusGbp)}</span>
                    <span className="block text-xs text-slate-500">Customer must register by <strong>{deadline}</strong>{r.notes ? ` · ${r.notes}` : ""}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {evOffer && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-emerald-900">{evOffer.label}</h2>
          <p className="mt-1 text-xs text-emerald-900/80">
            Electric vehicle — customer can choose the wallbox or the cash alternative instead.
          </p>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm">
              <input type="radio" checked={evChoice === "none"} onChange={() => setEvChoice("none")} className="mt-0.5 h-4 w-4" />
              <span className="flex-1 font-medium text-slate-900">Don&apos;t apply</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm">
              <input type="radio" checked={evChoice === "wallbox"} onChange={() => setEvChoice("wallbox")} className="mt-0.5 h-4 w-4" />
              <span className="flex-1 font-medium text-slate-900">{evOffer.wallboxLabel}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm">
              <input type="radio" checked={evChoice === "cash"} onChange={() => setEvChoice("cash")} className="mt-0.5 h-4 w-4" />
              <span className="flex-1 font-medium text-slate-900">Cash alternative
                <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">{formatGbp(evOffer.cashAlternativeGbp)} off</span>
              </span>
            </label>
          </div>
        </section>
      )}

      {tradeInOffers.length > 0 && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-violet-900">Trade-in allowance</h2>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm">
              <input type="radio" checked={tradeInId === ""} onChange={() => setTradeInId("")} className="mt-0.5 h-4 w-4" />
              <span className="flex-1 font-medium text-slate-900">No trade-in</span>
            </label>
            {tradeInOffers.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm">
                <input type="radio" checked={tradeInId === r.id} onChange={() => setTradeInId(r.id)} className="mt-0.5 h-4 w-4" />
                <span className="flex-1">
                  <span className="font-medium text-slate-900">{r.label}</span>
                  <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">{formatGbp(r.amountGbp)}</span>
                  <span className="block text-[11px] text-slate-600 mt-0.5"><strong>T&Cs:</strong> {r.termsText}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {testDriveOffers.length > 0 && (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-sky-900">Test-drive incentive</h2>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm">
              <input type="radio" checked={testDriveId === ""} onChange={() => setTestDriveId("")} className="mt-0.5 h-4 w-4" />
              <span className="flex-1 font-medium text-slate-900">No incentive</span>
            </label>
            {testDriveOffers.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm">
                <input type="radio" checked={testDriveId === r.id} onChange={() => setTestDriveId(r.id)} className="mt-0.5 h-4 w-4" />
                <span className="flex-1">
                  <span className="font-medium text-slate-900">{r.label}</span>
                  <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">{formatGbp(r.amountGbp)}</span>
                  {r.termsText && <span className="block text-[11px] text-slate-600 mt-0.5">{r.termsText}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Notes <span className="text-xs font-normal text-slate-400">(optional)</span></h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything we should know — colour preference, delivery deadline, customer context."
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
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
