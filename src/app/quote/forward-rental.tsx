"use client";
import { useMemo, useState } from "react";
import { rentalFromPv } from "@/lib/annuity-due";

// Forward rental calculator — the mirror of /quote → Reverse commission.
// Takes a combined commission + options amount the broker wants spread
// over the rental, plus the contract shape, and works out the rental
// uplift per month using Excel's CUMIPMT(rate/12, term, pv, 1, term, 1)
// annuity-due semantics — same formula as the broker team's
// Options Calculator.xlsx so the two tools always agree.
//
// rental = (PMT_due × term) ÷ (upfront + term)
//
// where PMT_due is the annuity-due payment for `pv` amortised over
// `term` periods at the monthly rate (APR ÷ 12).

const UPFRONT_OPTIONS = [1, 3, 6, 9, 12];
const TERM_OPTIONS = [23, 35, 47, 59];

export interface ForwardInput {
  amountGbp: number;       // commission + options +VAT
  upfront: number;
  term: number;
  annualRatePct: number;
}

export interface ForwardOutput {
  totalPayments: number;          // upfront + term
  baseMonthlyExVat: number;       // amount / payments, no interest
  interestGbp: number;             // simple interest on amount across the contract
  totalToRecover: number;          // amount + interest
  monthlyExVat: number;            // total ÷ payments — what to add to the customer's rental
  monthlyVat: number;              // 20%
  monthlyInclVat: number;
  // Additional headline that some users find easier to read off:
  rentalUpliftExVat: number;       // = monthlyExVat (alias for clarity)
  interestPerMonth: number;        // monthlyExVat − baseMonthlyExVat
}

export function calculateForwardRental(input: ForwardInput): ForwardOutput {
  const totalPayments = input.upfront + input.term;
  const safePayments = totalPayments > 0 ? totalPayments : 1;
  const baseMonthlyExVat = input.amountGbp / safePayments;
  // Annuity-due interest model — matches Excel's CUMIPMT used by the
  // broker team's Options Calculator.xlsx. Negative principals (e.g.
  // refund scenarios) short-circuit to no interest, matching the
  // reverse-commission "negative gross" branch.
  let monthlyExVat: number;
  let interestGbp: number;
  let totalToRecover: number;
  if (input.amountGbp <= 0) {
    monthlyExVat = baseMonthlyExVat;
    interestGbp = 0;
    totalToRecover = input.amountGbp;
  } else {
    const r = rentalFromPv({
      pv: input.amountGbp,
      term: input.term,
      upfront: input.upfront,
      annualRatePct: input.annualRatePct,
    });
    monthlyExVat = r.rental;
    interestGbp = r.interest;
    totalToRecover = r.totalPaid;
  }
  const monthlyVat = monthlyExVat * 0.2;
  const monthlyInclVat = monthlyExVat + monthlyVat;
  return {
    totalPayments,
    baseMonthlyExVat,
    interestGbp,
    totalToRecover,
    monthlyExVat,
    monthlyVat,
    monthlyInclVat,
    rentalUpliftExVat: monthlyExVat,
    interestPerMonth: monthlyExVat - baseMonthlyExVat,
  };
}

function gbp(n: number, opts?: { signed?: boolean; max?: number }) {
  const formatted = n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: opts?.max ?? 2,
  });
  if (opts?.signed && n > 0) return `+${formatted}`;
  return formatted;
}

export function ForwardRentalCalculator() {
  const [amount, setAmount] = useState<string>("1000");
  const [upfront, setUpfront] = useState<number>(6);
  const [term, setTerm] = useState<number>(35);
  const [rate, setRate] = useState<string>("7");

  const out = useMemo<ForwardOutput | null>(() => {
    const a = parseFloat(amount);
    const r = parseFloat(rate);
    if (!Number.isFinite(a) || !Number.isFinite(r)) return null;
    return calculateForwardRental({
      amountGbp: a,
      upfront,
      term,
      annualRatePct: r,
    });
  }, [amount, upfront, term, rate]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
      <div className="space-y-5 self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Rental uplift calculator</h2>
          <p className="mt-1 text-xs text-slate-600">
            Spread a combined commission + options amount across the rental, with simple interest
            layered on top to recover the time value of money.
          </p>
        </div>

        <Field label="Commission + options total (+VAT)">
          <Money value={amount} onChange={setAmount} placeholder="1000.00" />
        </Field>

        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <PillPicker label="Upfront (months)" value={upfront} options={UPFRONT_OPTIONS} onChange={setUpfront} />
          <PillPicker label="Term (remaining payments)" value={term} options={TERM_OPTIONS} onChange={setTerm} />
          <div className="rounded-md bg-white px-2.5 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
            Total payments: <strong className="text-slate-900">{upfront + term}</strong>
          </div>
        </div>

        <Field label="Background interest rate">
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums focus:border-slate-400 focus:outline-none"
            />
            <span className="text-sm text-slate-700">% APR</span>
          </div>
        </Field>
      </div>

      <div>
        {out === null ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center">
            <div className="text-sm font-medium text-slate-700">Enter the amount + contract on the left</div>
            <div className="text-xs text-slate-600">
              Try the worked example: £1,000 / 6 + 35 / 7% → £30.22 +VAT to add to the customer&apos;s rental.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Headline — the monthly to add to the customer's rental */}
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Monthly rental uplift</div>
              <div className="mt-1 text-4xl font-bold tabular-nums text-emerald-800 sm:text-5xl">
                {gbp(out.monthlyExVat)}
                <span className="ml-2 text-base font-medium text-emerald-700">+VAT</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-emerald-200">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Ex-VAT / month</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{gbp(out.monthlyExVat)}</div>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-emerald-200">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-600">VAT (20%)</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{gbp(out.monthlyVat)}</div>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-emerald-200">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Inc-VAT / month</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{gbp(out.monthlyInclVat)}</div>
                </div>
              </div>
            </div>

            {/* Working */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">How we got there</div>
              <ol className="mt-3 space-y-2 text-sm">
                <WorkingRow
                  step="1"
                  label="Total payments"
                  detail={`Upfront ${upfront} + term ${term}`}
                  value={`${out.totalPayments}`}
                />
                <WorkingRow
                  step="2"
                  label="Base monthly (no interest)"
                  detail={`${gbp(parseFloat(amount) || 0)} ÷ ${out.totalPayments}`}
                  value={gbp(out.baseMonthlyExVat)}
                />
                <WorkingRow
                  step="3"
                  label={`Interest @ ${rate || 0}% APR`}
                  detail={`Amortised over ${term} period${term === 1 ? "" : "s"} (annuity-due) at ${(parseFloat(rate) || 0).toFixed(1)}% APR`}
                  value={`+ ${gbp(out.interestGbp)}`}
                />
                <WorkingRow
                  step="4"
                  label="Total to recover"
                  detail={`${gbp(parseFloat(amount) || 0)} + ${gbp(out.interestGbp)}`}
                  value={gbp(out.totalToRecover)}
                />
                <WorkingRow
                  step="="
                  label="Monthly +VAT to add to rental"
                  detail={`${gbp(out.totalToRecover)} ÷ ${out.totalPayments}`}
                  value={gbp(out.monthlyExVat)}
                  bold
                />
              </ol>
              <p className="mt-3 text-[11px] text-slate-600">
                Interest per month = {gbp(out.interestPerMonth)}. Drop the rate to 0% to see the pure
                flat-split rental uplift without any time-value adjustment.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-700">
              <div className="font-medium text-slate-800">Use this for</div>
              <ul className="mt-1.5 space-y-0.5">
                <li>• Customer wants extras (mats / tow bar / paint protection) financed into the rental.</li>
                <li>• Spreading the broker commission across the contract instead of taking it upfront.</li>
                <li>• Quoting a combined upsell figure where you need a clean rental headline to share.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inputs (shared layout helpers — mirror the reverse calc) ──────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Money({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">£</span>
      <input
        type="number"
        step="0.01"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 pl-6 text-sm tabular-nums focus:border-slate-400 focus:outline-none"
      />
    </div>
  );
}

function PillPicker({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              value === opt
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkingRow({ step, label, detail, value, bold }: {
  step: string; label: string; detail: string; value: string; bold?: boolean;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-800">
        {step}
      </span>
      <div className="min-w-0">
        <div className={`${bold ? "font-semibold text-slate-900" : "text-slate-800"}`}>{label}</div>
        <div className="text-[11px] text-slate-600">{detail}</div>
      </div>
      <div className={`shrink-0 tabular-nums text-right ${bold ? "text-base font-bold text-slate-900" : "text-sm text-slate-800"}`}>
        {value}
      </div>
    </li>
  );
}
