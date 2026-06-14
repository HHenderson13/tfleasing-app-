"use client";
import { useMemo, useState } from "react";

// Reverse-commission calculator — work out the broker commission +VAT from
// the rentals on either side, then subtract simple interest at the chosen
// rate so the broker is paid the present-value equivalent of the upsold
// margin rather than the headline gross.
//
// Worked example (per the spec):
//   Broker rental £400, TF rental £350, upfront 6, term 35 (= 41 payments)
//   Difference per month = £50
//   Upsold = £50 × 41 = £2,050
//   Interest @ 7% APR over 41/12 yrs = £2,050 × 0.07 × 41/12 = £490.45
//   Commission +VAT = £2,050 − £490.45 = £1,559.55

const UPFRONT_OPTIONS = [1, 3, 6, 9, 12];
const TERM_OPTIONS = [23, 35, 47, 59];

export interface ReverseInput {
  brokerRentalGbp: number;          // +VAT
  tfRentalGbp: number;              // +VAT
  upfront: number;                  // months paid upfront
  term: number;                     // remaining monthly rentals after upfront
  annualRatePct: number;            // background interest rate (%)
}

export interface ReverseOutput {
  totalPayments: number;            // upfront + term
  diffPerMonth: number;             // broker − TF (can be negative)
  upsoldTotal: number;              // diff × totalPayments
  interestGbp: number;              // simple interest on upsoldTotal
  commissionInclVat: number;        // upsold − interest
  commissionExVat: number;          // commission / 1.2
  vat: number;                      // commission − commissionExVat
}

export function calculateReverseCommission(input: ReverseInput): ReverseOutput {
  const totalPayments = input.upfront + input.term;
  const diffPerMonth = input.brokerRentalGbp - input.tfRentalGbp;
  const upsoldTotal = diffPerMonth * totalPayments;
  // Simple interest over the contract length. Matches the wording in the
  // brief ("work out the interest incurred at 7% on 6+35 and take that off
  // the £2,050") rather than discounting the stream as an annuity, which
  // would give a different number that's harder to defend in a deal sheet.
  const yearFraction = totalPayments / 12;
  const interestGbp = Math.max(0, upsoldTotal) * (input.annualRatePct / 100) * yearFraction;
  const commissionInclVat = upsoldTotal - interestGbp;
  // VAT split for the deal sheet — broker invoices commission +VAT, so
  // show the ex-VAT figure they'll actually receive as commission.
  const commissionExVat = commissionInclVat / 1.2;
  const vat = commissionInclVat - commissionExVat;
  return { totalPayments, diffPerMonth, upsoldTotal, interestGbp, commissionInclVat, commissionExVat, vat };
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

export function ReverseCommissionCalculator() {
  const [brokerRental, setBrokerRental] = useState<string>("400");
  const [tfRental, setTfRental] = useState<string>("350");
  const [upfront, setUpfront] = useState<number>(6);
  const [term, setTerm] = useState<number>(35);
  const [rate, setRate] = useState<string>("7");

  const out = useMemo<ReverseOutput | null>(() => {
    const br = parseFloat(brokerRental);
    const tf = parseFloat(tfRental);
    const r = parseFloat(rate);
    if (!Number.isFinite(br) || !Number.isFinite(tf) || !Number.isFinite(r)) return null;
    return calculateReverseCommission({
      brokerRentalGbp: br,
      tfRentalGbp: tf,
      upfront,
      term,
      annualRatePct: r,
    });
  }, [brokerRental, tfRental, upfront, term, rate]);

  const positiveUpsell = out !== null && out.diffPerMonth > 0;
  const negativeUpsell = out !== null && out.diffPerMonth < 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
      {/* Inputs */}
      <div className="space-y-5 self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Reverse commission calculator</h2>
          <p className="mt-1 text-xs text-slate-500">
            Work out the broker commission +VAT from the rentals on either side.
            Difference per month × number of payments, then subtract interest at the
            background rate to get the present-value commission.
          </p>
        </div>

        <div className="space-y-3">
          <Field label="Broker rental (+VAT) per month">
            <Money value={brokerRental} onChange={setBrokerRental} placeholder="400.00" />
          </Field>
          <Field label="TrustFord rental (+VAT) per month">
            <Money value={tfRental} onChange={setTfRental} placeholder="350.00" />
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <PillPicker label="Upfront (months)" value={upfront} options={UPFRONT_OPTIONS} onChange={setUpfront} />
          <PillPicker label="Term (remaining payments)" value={term} options={TERM_OPTIONS} onChange={setTerm} />
          <div className="rounded-md bg-white px-2.5 py-1.5 text-[11px] text-slate-500 ring-1 ring-slate-200">
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
            <span className="text-sm text-slate-500">% APR</span>
          </div>
        </Field>
      </div>

      {/* Results */}
      <div>
        {out === null ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center">
            <div className="text-sm font-medium text-slate-500">Enter rentals on the left</div>
            <div className="text-xs text-slate-400">All four numbers feed the commission calc — try the worked example: £400 / £350 / 6 / 35 / 7%.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Headline */}
            <div className={`rounded-2xl border-2 p-5 shadow-sm ${
              negativeUpsell
                ? "border-rose-300 bg-rose-50"
                : positiveUpsell
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-slate-200 bg-white"
            }`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Broker commission +VAT</div>
              <div className={`mt-1 text-4xl font-bold tabular-nums sm:text-5xl ${
                negativeUpsell ? "text-rose-700" : positiveUpsell ? "text-emerald-700" : "text-slate-700"
              }`}>
                {gbp(out.commissionInclVat)}
              </div>
              {negativeUpsell && (
                <div className="mt-1 text-xs font-medium text-rose-700">
                  Negative — TF rental is higher than the broker rental, no commission to pay.
                </div>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-slate-200">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Ex-VAT (broker invoices)</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{gbp(out.commissionExVat)}</div>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-slate-200">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">VAT (20%)</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{gbp(out.vat)}</div>
                </div>
              </div>
            </div>

            {/* Working */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">How we got there</div>
              <ol className="mt-3 space-y-2 text-sm">
                <WorkingRow
                  step="1"
                  label="Difference per month"
                  detail={`£${parseFloat(brokerRental || "0").toFixed(2)} − £${parseFloat(tfRental || "0").toFixed(2)}`}
                  value={gbp(out.diffPerMonth, { signed: true })}
                  tone={out.diffPerMonth >= 0 ? "ok" : "warn"}
                />
                <WorkingRow
                  step="2"
                  label="Total payments"
                  detail={`Upfront ${upfront} + term ${term}`}
                  value={`${out.totalPayments}`}
                  tone="ok"
                />
                <WorkingRow
                  step="3"
                  label="Total upsold"
                  detail={`${gbp(out.diffPerMonth)} × ${out.totalPayments}`}
                  value={gbp(out.upsoldTotal)}
                  tone={out.upsoldTotal >= 0 ? "ok" : "warn"}
                />
                <WorkingRow
                  step="4"
                  label={`Interest @ ${rate || 0}% APR`}
                  detail={`${gbp(out.upsoldTotal)} × ${rate || 0}% × ${(out.totalPayments / 12).toFixed(2)}yr`}
                  value={`− ${gbp(out.interestGbp)}`}
                  tone="warn"
                />
                <WorkingRow
                  step="="
                  label="Broker commission +VAT"
                  detail={`Upsold − interest`}
                  value={gbp(out.commissionInclVat)}
                  tone={out.commissionInclVat >= 0 ? "ok" : "warn"}
                  bold
                />
              </ol>
            </div>

            {/* Quick swap helpers — common scenarios */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600">
              <div className="font-medium text-slate-700">Tips</div>
              <ul className="mt-1.5 space-y-0.5">
                <li>• A higher upfront or longer term scales the total upsold linearly.</li>
                <li>• Drop the rate to 0% to see the gross upsold without time-value adjustment.</li>
                <li>• Negative commission means TF&apos;s rental is higher than the broker&apos;s — no upsell to settle.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small UI helpers — kept in this file so the reverse calc stays self-
// contained and the existing quote-form components don't have to re-render
// every time a user toggles the tab. ───────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Money({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
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
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
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

function WorkingRow({ step, label, detail, value, tone, bold }: {
  step: string; label: string; detail: string; value: string;
  tone: "ok" | "warn"; bold?: boolean;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3">
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        tone === "warn" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
      }`}>{step}</span>
      <div className="min-w-0">
        <div className={`${bold ? "font-semibold text-slate-900" : "text-slate-700"}`}>{label}</div>
        <div className="text-[11px] text-slate-500">{detail}</div>
      </div>
      <div className={`shrink-0 tabular-nums text-right ${bold ? "text-base font-bold text-slate-900" : "text-sm text-slate-700"}`}>
        {value}
      </div>
    </li>
  );
}
