"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computePricing,
  hasFullPricing,
  FINANCE_PROGRAMME_LABELS,
  type MaybePricingComponents,
} from "@/lib/broker-pricing";
import { createCashValueAction, deleteCashValueAction, updateCashValueAction } from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums";
const numInp = `${inp} w-full`;

interface StockCombo {
  bucket: string;
  variant: string;
  derivative: string | null;
  modelYear: string | null;
  count: number;
}

export interface PricingRow {
  id: string;
  bucket: string;
  variant: string;
  derivative: string | null;
  modelYear: string | null;
  cashGbp: number;
  marginGbp: number | null;
  marginPct: number | null;
  capCode: string | null;
  capId: string | null;
  notes: string | null;
  retailPriceGbp: number | null;
  deliveryGbp: number | null;
  pdiPlatesGbp: number | null;
  firstRegFeeGbp: number | null;
  rflGbp: number | null;
  tradingMarginPct: number | null;
  standardsPct: number | null;
  vetsPct: number | null;
  oneFDiscountPct: number | null;
  dealerProfitGbp: number | null;
}

function gbp(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

function comboLabel(c: { bucket: string; variant: string; derivative: string | null; modelYear: string | null }) {
  return [c.bucket, c.variant, c.derivative, c.modelYear].filter(Boolean).join(" · ");
}

function parseOptional(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Add new ────────────────────────────────────────────────────────────────

export function AddPricingForm({ stockCombos }: { stockCombos: StockCombo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosenIndex, setChosenIndex] = useState<string>("");
  const [manualBucket, setManualBucket] = useState("");
  const [manualVariant, setManualVariant] = useState("");
  const [manualDerivative, setManualDerivative] = useState("");
  const [manualYear, setManualYear] = useState("");
  // Pricing components — admin enters these and the cash field is auto-
  // computed in real time. Cash is the override / legacy field.
  const [retail, setRetail] = useState("");
  const [delivery, setDelivery] = useState("");
  const [pdi, setPdi] = useState("");
  const [firstReg, setFirstReg] = useState("");
  const [rfl, setRfl] = useState("");
  const [tradingMarginPct, setTradingMarginPct] = useState("");
  const [standardsPct, setStandardsPct] = useState("");
  const [vetsPct, setVetsPct] = useState("");
  const [oneFDiscountPct, setOneFDiscountPct] = useState("");
  const [dealerProfit, setDealerProfit] = useState("");
  const [cashOverride, setCashOverride] = useState("");
  const [capCode, setCapCode] = useState("");
  const [capId, setCapId] = useState("");
  const [notes, setNotes] = useState("");

  const chosen = chosenIndex === "" ? null : stockCombos[parseInt(chosenIndex, 10)];
  const bucket = chosen?.bucket ?? manualBucket;
  const variant = chosen?.variant ?? manualVariant;
  const derivative = chosen ? (chosen.derivative ?? null) : (manualDerivative.trim() || null);
  const modelYear = chosen ? (chosen.modelYear ?? null) : (manualYear.trim() || null);

  // Live preview: compute 1N / 1F OTRs from the components as the admin
  // types so they can sanity-check before saving.
  const components: MaybePricingComponents = useMemo(() => ({
    retailPriceGbp: parseOptional(retail),
    deliveryGbp: parseOptional(delivery),
    pdiPlatesGbp: parseOptional(pdi),
    firstRegFeeGbp: parseOptional(firstReg),
    rflGbp: parseOptional(rfl),
    tradingMarginPct: parseOptional(tradingMarginPct),
    standardsPct: parseOptional(standardsPct),
    vetsPct: parseOptional(vetsPct),
    oneFDiscountPct: parseOptional(oneFDiscountPct),
    dealerProfitGbp: parseOptional(dealerProfit),
  }), [retail, delivery, pdi, firstReg, rfl, tradingMarginPct, standardsPct, vetsPct, oneFDiscountPct, dealerProfit]);
  const preview = hasFullPricing(components)
    ? { oneN: computePricing(components, "1n"), oneF: computePricing(components, "1f") }
    : null;

  // If components are fully populated, the cash field follows the 1N OTR
  // (legacy fallback — equivalent to "what the customer would pay on 1N").
  // Admin can override by typing into the cash field directly.
  const computedCash = preview?.oneN.otrGbp ?? null;
  const cashGbp = cashOverride.trim() !== ""
    ? (parseFloat(cashOverride) || 0)
    : (computedCash ?? 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createCashValueAction({
        bucket: bucket.trim(),
        variant: variant.trim(),
        derivative,
        modelYear,
        cashGbp,
        marginGbp: null,
        marginPct: null,
        capCode: capCode.trim() || null,
        capId: capId.trim() || null,
        notes: notes.trim() || null,
        retailPriceGbp: components.retailPriceGbp,
        deliveryGbp: components.deliveryGbp,
        pdiPlatesGbp: components.pdiPlatesGbp,
        firstRegFeeGbp: components.firstRegFeeGbp,
        rflGbp: components.rflGbp,
        tradingMarginPct: components.tradingMarginPct,
        standardsPct: components.standardsPct,
        vetsPct: components.vetsPct,
        oneFDiscountPct: components.oneFDiscountPct,
        dealerProfitGbp: components.dealerProfitGbp,
      });
      if (!res.ok) { setError(res.error); return; }
      setRetail(""); setDelivery(""); setPdi(""); setFirstReg(""); setRfl("");
      setTradingMarginPct(""); setStandardsPct(""); setVetsPct(""); setOneFDiscountPct(""); setDealerProfit("");
      setCashOverride(""); setCapCode(""); setCapId(""); setNotes("");
      setManualBucket(""); setManualVariant(""); setManualDerivative(""); setManualYear("");
      setChosenIndex("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
          Pick from current stock
          <select value={chosenIndex} onChange={(e) => setChosenIndex(e.target.value)} className={`${inp} mt-1 w-full`}>
            <option value="">— or enter manually below —</option>
            {stockCombos.map((c, i) => (
              <option key={`${c.bucket}|${c.variant}|${c.derivative ?? ""}|${c.modelYear ?? ""}`} value={String(i)}>
                {comboLabel(c)} ({c.count})
              </option>
            ))}
          </select>
        </label>
        {chosen === null && (
          <>
            <label className="block text-xs font-medium text-slate-700">
              Bucket
              <input value={manualBucket} onChange={(e) => setManualBucket(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Focus" required />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Variant
              <input value={manualVariant} onChange={(e) => setManualVariant(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Style" required />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Derivative <span className="text-slate-400">(optional)</span>
              <input value={manualDerivative} onChange={(e) => setManualDerivative(e.target.value)} className={`${inp} mt-1 w-full`} />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Model year <span className="text-slate-400">(optional)</span>
              <input value={manualYear} onChange={(e) => setManualYear(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="2026.0" />
            </label>
          </>
        )}
      </div>

      <fieldset className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Ford pricing components</legend>
        <p className="mb-3 text-[11px] text-slate-500">
          Retail price + delivery costs + discount % stack. Customer OTR is computed automatically for both finance programmes.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumLabel label="Retail price (£)" value={retail} onChange={setRetail} placeholder="39350" />
          <NumLabel label="Delivery (£)" value={delivery} onChange={setDelivery} placeholder="828" />
          <NumLabel label="PDI + plates (£)" value={pdi} onChange={setPdi} placeholder="135" />
          <NumLabel label="1st reg fee (£)" value={firstReg} onChange={setFirstReg} placeholder="55" />
          <NumLabel label="RFL (£)" value={rfl} onChange={setRfl} placeholder="335" />
          <NumLabel label="Trading margin (%)" value={tradingMarginPct} onChange={setTradingMarginPct} placeholder="8.75" />
          <NumLabel label="Standards (%)" value={standardsPct} onChange={setStandardsPct} placeholder="2" />
          <NumLabel label="VETS (%)" value={vetsPct} onChange={setVetsPct} placeholder="0.8" />
          <NumLabel label="1F extra discount (%)" value={oneFDiscountPct} onChange={setOneFDiscountPct} placeholder="2" />
          <NumLabel label="Dealer profit floor (£)" value={dealerProfit} onChange={setDealerProfit} placeholder="500" />
        </div>
        {preview && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(["1n", "1f"] as const).map((p) => {
              const b = preview[p === "1n" ? "oneN" : "oneF"];
              return (
                <div key={p} className={`rounded-lg border p-3 text-xs ${p === "1n" ? "border-sky-200 bg-sky-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{FINANCE_PROGRAMME_LABELS[p]}</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-slate-700">Customer OTR</span>
                    <span className="text-base font-semibold tabular-nums text-slate-900">{gbp(b.otrGbp)}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-[10.5px] text-slate-600 tabular-nums">
                    <div className="flex justify-between"><span>Margin pool ({b.marginPoolPct.toFixed(2)}%)</span><span>{gbp(b.marginPoolGbp)}</span></div>
                    <div className="flex justify-between"><span>− Dealer profit</span><span>− {gbp(b.dealerProfitGbp)}</span></div>
                    <div className="flex justify-between"><span>= Customer discount</span><span>− {gbp(b.customerDiscountGbp)}</span></div>
                    <div className="flex justify-between"><span>+ Delivery costs</span><span>+ {gbp(b.deliveryCostsGbp)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <fieldset className="mt-4 rounded-xl border border-slate-200 p-4">
        <legend className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Override / legacy</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-700">
            Cash override (£) <span className="text-slate-400">{computedCash !== null ? "blank = use computed" : "required"}</span>
            <input type="number" step="0.01" min={0} value={cashOverride} onChange={(e) => setCashOverride(e.target.value)} className={`${numInp} mt-1`} placeholder={computedCash !== null ? String(Math.round(computedCash)) : "Required"} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Cap code <span className="text-slate-400">(optional)</span>
            <input value={capCode} onChange={(e) => setCapCode(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Cap ID <span className="text-slate-400">(optional)</span>
            <input value={capId} onChange={(e) => setCapId(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-medium text-slate-700 sm:col-span-3">
            Notes <span className="text-slate-400">(optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} />
          </label>
        </div>
      </fieldset>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !bucket.trim() || !variant.trim() || cashGbp <= 0}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add pricing row"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
        {cashGbp > 0 && computedCash === null && <span className="text-[11px] text-slate-500">Will save with cash override only — no per-programme split available without all components.</span>}
      </div>
    </form>
  );
}

function NumLabel({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${numInp} mt-1`}
        placeholder={placeholder}
      />
    </label>
  );
}

// ─── Existing rows table ────────────────────────────────────────────────────

export function PricingTable({ rows }: { rows: PricingRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) =>
      `${r.bucket} ${r.variant} ${r.derivative ?? ""} ${r.modelYear ?? ""} ${r.capCode ?? ""}`
        .toLowerCase()
        .includes(f),
    );
  }, [rows, filter]);

  function commit(id: string, patch: Partial<PricingRow>) {
    start(async () => {
      const cleaned: Record<string, number | string | null | undefined> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (typeof v === "number" && !Number.isFinite(v)) continue;
        cleaned[k] = v;
      }
      await updateCashValueAction(id, cleaned);
      router.refresh();
    });
  }

  function del(id: string) {
    if (!confirm("Delete this pricing row? The vehicle will no longer pre-fill on the broker quote form.")) return;
    start(async () => {
      await deleteCashValueAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by bucket / variant / cap code…"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
      />
      <div className="space-y-2">
        {filtered.map((r) => <PricingRowEditable key={r.id} row={r} pending={pending} onCommit={commit} onDelete={del} />)}
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No rows match — clear the filter or add a row above.
          </p>
        )}
      </div>
    </div>
  );
}

function PricingRowEditable({
  row,
  pending,
  onCommit,
  onDelete,
}: {
  row: PricingRow;
  pending: boolean;
  onCommit: (id: string, patch: Partial<PricingRow>) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const components: MaybePricingComponents = {
    retailPriceGbp: row.retailPriceGbp,
    deliveryGbp: row.deliveryGbp,
    pdiPlatesGbp: row.pdiPlatesGbp,
    firstRegFeeGbp: row.firstRegFeeGbp,
    rflGbp: row.rflGbp,
    tradingMarginPct: row.tradingMarginPct,
    standardsPct: row.standardsPct,
    vetsPct: row.vetsPct,
    oneFDiscountPct: row.oneFDiscountPct,
    dealerProfitGbp: row.dealerProfitGbp,
  };
  const computed = hasFullPricing(components)
    ? { oneN: computePricing(components, "1n"), oneF: computePricing(components, "1f") }
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
      >
        <span className="flex flex-col">
          <span className="font-medium text-slate-900">{comboLabel(row)}</span>
          <span className="text-[11px] text-slate-500">
            {computed
              ? <>1N {gbp(computed.oneN.otrGbp)} · 1F {gbp(computed.oneF.otrGbp)}{row.capCode ? ` · cap ${row.capCode}` : ""}</>
              : <>Cash {gbp(row.cashGbp)}{row.capCode ? ` · cap ${row.capCode}` : ""} <span className="ml-1 text-amber-600">· components not set</span></>}
          </span>
        </span>
        <span className="text-xs text-slate-400">{open ? "Close" : "Edit"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <NumEdit label="Retail (£)" value={row.retailPriceGbp} onCommit={(v) => onCommit(row.id, { retailPriceGbp: v })} />
            <NumEdit label="Delivery (£)" value={row.deliveryGbp} onCommit={(v) => onCommit(row.id, { deliveryGbp: v })} />
            <NumEdit label="PDI + plates (£)" value={row.pdiPlatesGbp} onCommit={(v) => onCommit(row.id, { pdiPlatesGbp: v })} />
            <NumEdit label="1st reg (£)" value={row.firstRegFeeGbp} onCommit={(v) => onCommit(row.id, { firstRegFeeGbp: v })} />
            <NumEdit label="RFL (£)" value={row.rflGbp} onCommit={(v) => onCommit(row.id, { rflGbp: v })} />
            <NumEdit label="Trading margin (%)" value={row.tradingMarginPct} onCommit={(v) => onCommit(row.id, { tradingMarginPct: v })} />
            <NumEdit label="Standards (%)" value={row.standardsPct} onCommit={(v) => onCommit(row.id, { standardsPct: v })} />
            <NumEdit label="VETS (%)" value={row.vetsPct} onCommit={(v) => onCommit(row.id, { vetsPct: v })} />
            <NumEdit label="1F extra (%)" value={row.oneFDiscountPct} onCommit={(v) => onCommit(row.id, { oneFDiscountPct: v })} />
            <NumEdit label="Dealer profit (£)" value={row.dealerProfitGbp} onCommit={(v) => onCommit(row.id, { dealerProfitGbp: v })} />
            <NumEdit label="Cash override (£)" value={row.cashGbp} onCommit={(v) => onCommit(row.id, { cashGbp: v ?? 0 })} />
            <TextEdit label="Cap code" value={row.capCode ?? ""} onCommit={(v) => onCommit(row.id, { capCode: v })} />
            <TextEdit label="Cap ID" value={row.capId ?? ""} onCommit={(v) => onCommit(row.id, { capId: v })} />
            <TextEdit label="Notes" value={row.notes ?? ""} onCommit={(v) => onCommit(row.id, { notes: v })} colSpan="sm:col-span-3" />
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={() => onDelete(row.id)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumEdit({ label, value, onCommit }: { label: string; value: number | null; onCommit: (v: number | null) => void }) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      <BlurNumber initial={value} nullable onCommit={onCommit} className={`${numInp} mt-1 text-right`} />
    </label>
  );
}

function TextEdit({ label, value, onCommit, colSpan }: { label: string; value: string; onCommit: (v: string | null) => void; colSpan?: string }) {
  return (
    <label className={`block text-xs font-medium text-slate-700 ${colSpan ?? ""}`}>
      {label}
      <BlurText initial={value} onCommit={onCommit} />
    </label>
  );
}

// Small uncontrolled inputs that commit on blur — keeps the row from
// firing a server action on every keystroke while still feeling instant.
function BlurNumber({
  initial,
  nullable,
  onCommit,
  className,
}: {
  initial: number | null;
  nullable?: boolean;
  onCommit: (v: number | null) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const t = value.trim();
        if (t === "" && nullable) { onCommit(null); return; }
        const n = parseFloat(t);
        if (Number.isFinite(n)) onCommit(n);
      }}
      className={className ?? inp}
    />
  );
}

function BlurText({ initial, onCommit }: { initial: string; onCommit: (v: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim() === "" ? null : value.trim())}
      className={`${inp} mt-1 w-full`}
    />
  );
}

// ─── Unmapped stock combinations ────────────────────────────────────────────

export function UnmappedVehiclesPanel({ rows }: { rows: StockCombo[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Bucket</th>
            <th className="px-3 py-2 text-left font-medium">Variant</th>
            <th className="px-3 py-2 text-left font-medium">Derivative</th>
            <th className="px-3 py-2 text-left font-medium">Model year</th>
            <th className="px-3 py-2 text-right font-medium">In stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-slate-900">{r.bucket}</td>
              <td className="px-3 py-2 text-slate-700">{r.variant}</td>
              <td className="px-3 py-2 text-slate-500">{r.derivative ?? "—"}</td>
              <td className="px-3 py-2 text-slate-500">{r.modelYear ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Back-compat alias for the page (older imports)
export const AddCashValueForm = AddPricingForm;
export const CashValuesTable = PricingTable;
