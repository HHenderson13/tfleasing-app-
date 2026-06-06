"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

interface CashRow {
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
}

function comboLabel(c: { bucket: string; variant: string; derivative: string | null; modelYear: string | null }) {
  return [c.bucket, c.variant, c.derivative, c.modelYear].filter(Boolean).join(" · ");
}

// ─── Add new ────────────────────────────────────────────────────────────────

export function AddCashValueForm({ stockCombos }: { stockCombos: StockCombo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosenIndex, setChosenIndex] = useState<string>("");
  const [manualBucket, setManualBucket] = useState("");
  const [manualVariant, setManualVariant] = useState("");
  const [manualDerivative, setManualDerivative] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [cash, setCash] = useState("");
  const [marginGbp, setMarginGbp] = useState("");
  const [marginPct, setMarginPct] = useState("");
  const [capCode, setCapCode] = useState("");
  const [capId, setCapId] = useState("");
  const [notes, setNotes] = useState("");

  const chosen = chosenIndex === "" ? null : stockCombos[parseInt(chosenIndex, 10)];
  const bucket = chosen?.bucket ?? manualBucket;
  const variant = chosen?.variant ?? manualVariant;
  const derivative = chosen ? (chosen.derivative ?? null) : (manualDerivative.trim() || null);
  const modelYear = chosen ? (chosen.modelYear ?? null) : (manualYear.trim() || null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createCashValueAction({
        bucket: bucket.trim(),
        variant: variant.trim(),
        derivative,
        modelYear,
        cashGbp: parseFloat(cash) || 0,
        marginGbp: marginGbp.trim() === "" ? null : parseFloat(marginGbp),
        marginPct: marginPct.trim() === "" ? null : parseFloat(marginPct),
        capCode: capCode.trim() || null,
        capId: capId.trim() || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setCash(""); setMarginGbp(""); setMarginPct(""); setCapCode(""); setCapId(""); setNotes("");
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
        <label className="block text-xs font-medium text-slate-700">
          Cash price (£)
          <input type="number" step="0.01" min={0} value={cash} onChange={(e) => setCash(e.target.value)} className={`${numInp} mt-1`} required />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Margin (£) <span className="text-slate-400">or set %</span>
          <input type="number" step="0.01" value={marginGbp} onChange={(e) => setMarginGbp(e.target.value)} className={`${numInp} mt-1`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Margin (%) <span className="text-slate-400">or set £</span>
          <input type="number" step="0.01" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} className={`${numInp} mt-1`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Cap code <span className="text-slate-400">(optional)</span>
          <input value={capCode} onChange={(e) => setCapCode(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Cap ID <span className="text-slate-400">(optional)</span>
          <input value={capId} onChange={(e) => setCapId(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
          Notes <span className="text-slate-400">(optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending || !bucket.trim() || !variant.trim() || !cash} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add cash value"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

// ─── Existing rows table ────────────────────────────────────────────────────

export function CashValuesTable({ rows }: { rows: CashRow[] }) {
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

  function commit(id: string, patch: Partial<CashRow>) {
    start(async () => {
      await updateCashValueAction(id, {
        cashGbp: typeof patch.cashGbp === "number" ? patch.cashGbp : undefined,
        marginGbp: patch.marginGbp === undefined ? undefined : patch.marginGbp,
        marginPct: patch.marginPct === undefined ? undefined : patch.marginPct,
        capCode: patch.capCode === undefined ? undefined : patch.capCode,
        capId: patch.capId === undefined ? undefined : patch.capId,
        notes: patch.notes === undefined ? undefined : patch.notes,
      });
      router.refresh();
    });
  }

  function del(id: string) {
    if (!confirm("Delete this cash value? The vehicle will no longer pre-fill on the broker quote form.")) return;
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
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Vehicle</th>
              <th className="px-3 py-2 text-right font-medium">Cash £</th>
              <th className="px-3 py-2 text-right font-medium">Margin £</th>
              <th className="px-3 py-2 text-right font-medium">Margin %</th>
              <th className="px-3 py-2 text-left font-medium">Cap code</th>
              <th className="px-3 py-2 text-left font-medium">Cap ID</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <CashRowEditable key={r.id} row={r} pending={pending} onCommit={commit} onDelete={del} />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">No rows match — clear the filter or add a row above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashRowEditable({
  row,
  pending,
  onCommit,
  onDelete,
}: {
  row: CashRow;
  pending: boolean;
  onCommit: (id: string, patch: Partial<CashRow>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr>
      <td className="px-3 py-2 text-slate-900">{comboLabel(row)}</td>
      <td className="px-3 py-2 text-right">
        <BlurNumber initial={row.cashGbp} step="0.01" min={0} onCommit={(v) => onCommit(row.id, { cashGbp: v ?? undefined })} />
      </td>
      <td className="px-3 py-2 text-right">
        <BlurNumber initial={row.marginGbp} step="0.01" nullable onCommit={(v) => onCommit(row.id, { marginGbp: v })} />
      </td>
      <td className="px-3 py-2 text-right">
        <BlurNumber initial={row.marginPct} step="0.01" nullable onCommit={(v) => onCommit(row.id, { marginPct: v })} />
      </td>
      <td className="px-3 py-2">
        <BlurText initial={row.capCode ?? ""} onCommit={(v) => onCommit(row.id, { capCode: v })} />
      </td>
      <td className="px-3 py-2">
        <BlurText initial={row.capId ?? ""} onCommit={(v) => onCommit(row.id, { capId: v })} />
      </td>
      <td className="px-3 py-2">
        <BlurText initial={row.notes ?? ""} onCommit={(v) => onCommit(row.id, { notes: v })} />
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => onDelete(row.id)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
      </td>
    </tr>
  );
}

// Small uncontrolled inputs that commit on blur — keeps the row from
// firing a server action on every keystroke while still feeling instant.
function BlurNumber({
  initial,
  step,
  min,
  nullable,
  onCommit,
}: {
  initial: number | null;
  step?: string;
  min?: number;
  nullable?: boolean;
  onCommit: (v: number | null) => void;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  return (
    <input
      type="number"
      step={step}
      min={min}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const t = value.trim();
        if (t === "" && nullable) { onCommit(null); return; }
        const n = parseFloat(t);
        if (Number.isFinite(n)) onCommit(n);
      }}
      className={`${inp} w-24 text-right`}
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
      className={`${inp} w-32`}
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
