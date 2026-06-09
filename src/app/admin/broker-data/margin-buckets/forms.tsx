"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMarginBucketAction,
  createMarginRuleAction,
  deleteMarginBucketAction,
  deleteMarginRuleAction,
  updateMarginBucketAction,
  updateMarginRuleAction,
} from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";

export interface MarginRule {
  id: string;
  label: string;
  pct: number;
}

export interface MarginBucket {
  id: string;
  name: string;
  notes: string | null;
  rules: MarginRule[];
  vehicleCount: number;
}

export function AddBucketForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createMarginBucketAction({ name: name.trim(), notes: notes.trim() || null });
      if (!res.ok) { setError(res.error); return; }
      setName(""); setNotes("");
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700">
          Bucket name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="Ranger" required />
        </label>
        <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
          Notes <span className="text-slate-400">(optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} mt-1 w-full`} placeholder="What's in this bucket, eligibility caveats…" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={pending || !name.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add bucket"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

export function BucketsList({ buckets }: { buckets: MarginBucket[] }) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No margin buckets yet — add one above. A bucket groups vehicles that share the same set of % margins
        (e.g. trading margin, franchise bonus, standards…).
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {buckets.map((b) => <BucketCard key={b.id} bucket={b} />)}
    </div>
  );
}

function BucketCard({ bucket }: { bucket: MarginBucket }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(bucket.name);
  const [editNotes, setEditNotes] = useState(bucket.notes ?? "");

  const totalPct = bucket.rules.reduce((s, r) => s + r.pct, 0);

  function commit() {
    start(async () => {
      await updateMarginBucketAction(bucket.id, { name: editName, notes: editNotes });
      router.refresh();
    });
  }
  function del() {
    if (!confirm(`Delete "${bucket.name}"? Its rules will be deleted and any vehicles assigned will be detached.`)) return;
    start(async () => { await deleteMarginBucketAction(bucket.id); router.refresh(); });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <div>
          <div className="text-sm font-semibold text-slate-900">{bucket.name}</div>
          <div className="text-[11px] text-slate-500">
            {bucket.rules.length} rule{bucket.rules.length === 1 ? "" : "s"} · total {totalPct.toFixed(2)}% · {bucket.vehicleCount} vehicle{bucket.vehicleCount === 1 ? "" : "s"}
            {bucket.notes && <> · {bucket.notes}</>}
          </div>
        </div>
        <span className="text-xs text-slate-400">{open ? "Close" : "Edit"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-slate-700">
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={commit} className={`${inp} mt-1 w-full`} />
            </label>
            <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
              Notes
              <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} onBlur={commit} className={`${inp} mt-1 w-full`} />
            </label>
          </div>

          <RulesEditor bucketId={bucket.id} rules={bucket.rules} />

          <div className="flex justify-end">
            <button onClick={del} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete bucket</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RulesEditor({ bucketId, rules }: { bucketId: string; rules: MarginRule[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createMarginRuleAction({
        bucketId,
        label: label.trim(),
        pct: parseFloat(pct) || 0,
      });
      if (!res.ok) { setError(res.error); return; }
      setLabel(""); setPct("");
      router.refresh();
    });
  }
  function commit(id: string, patch: { label?: string; pct?: number }) {
    start(async () => { await updateMarginRuleAction(id, patch); router.refresh(); });
  }
  function del(id: string) {
    start(async () => { await deleteMarginRuleAction(id); router.refresh(); });
  }

  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-600">Margin rules</h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Label</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <BlurText initial={r.label} onCommit={(v) => v && commit(r.id, { label: v })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <BlurNumber initial={r.pct} step="0.01" onCommit={(v) => v !== null && commit(r.id, { pct: v })} className="w-20 text-right" />
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => del(r.id)} disabled={pending} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-500">No rules yet — add one below.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-4">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Base Trading Margin" className={`${inp} sm:col-span-2`} required />
        <input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="%" className={`${inp} tabular-nums`} required />
        <button type="submit" disabled={pending || !label.trim() || !pct} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          Add rule
        </button>
        {error && <span className="sm:col-span-4 text-xs text-red-600">{error}</span>}
      </form>
    </div>
  );
}

function BlurNumber({
  initial, step, onCommit, className,
}: {
  initial: number; step?: string; onCommit: (v: number | null) => void; className?: string;
}) {
  const [value, setValue] = useState(String(initial));
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = parseFloat(value);
        if (Number.isFinite(n)) onCommit(n);
      }}
      className={`${inp} tabular-nums ${className ?? ""}`}
    />
  );
}

function BlurText({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { const t = value.trim(); if (t) onCommit(t); }}
      className={`${inp} w-full`}
    />
  );
}
