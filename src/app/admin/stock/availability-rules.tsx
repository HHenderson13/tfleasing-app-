"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStockAvailabilityRuleAction } from "./actions";

export interface RuleRow {
  columnLetter: string;
  matchValue: string;
  enabled: boolean;
  matchedCount: number;
}

function Rule({ rule }: { rule: RuleRow }) {
  const router = useRouter();
  const [value, setValue] = useState(rule.matchValue);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = value !== rule.matchValue || enabled !== rule.enabled;

  function save(nextEnabled = enabled, nextValue = value) {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await saveStockAvailabilityRuleAction({
        columnLetter: rule.columnLetter,
        matchValue: nextValue,
        enabled: nextEnabled,
      });
      if (!res.ok) { setError(res.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Column
          <input
            value={rule.columnLetter}
            readOnly
            className="mt-1 w-16 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center font-mono text-sm text-slate-500"
          />
        </label>
        <span className="pb-2 text-sm text-slate-400">is</span>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Value
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. CO"
            className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm"
          />
        </label>
        <button
          onClick={() => { const n = !enabled; setEnabled(n); save(n, value); }}
          disabled={pending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            enabled
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
        {dirty && (
          <button
            onClick={() => save()}
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save value"}
          </button>
        )}
        <span className="pb-2 text-xs text-slate-500">
          {rule.matchedCount.toLocaleString()} vehicle{rule.matchedCount === 1 ? "" : "s"} in the current upload match
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && !error && !dirty && <p className="mt-2 text-xs text-emerald-700">Saved. Stock list updated.</p>}
    </div>
  );
}

export function AvailabilityRules({ rules }: { rules: RuleRow[] }) {
  const on = rules.filter((r) => r.enabled);
  const total = on.reduce((a, r) => a + r.matchedCount, 0);
  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium text-slate-700">Availability rules</h2>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">
        Column H is normally the customer / fleet-assigned marker, so <span className="font-medium">any</span> value in it
        hides a vehicle from the stock list. These rules name the values that mean the vehicle is ours to sell anyway, and
        pull those rows back in — on both the TF stock list and the broker portal.
      </p>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">
        A rule decides whether a vehicle <span className="font-medium">appears</span>. It does not change its status: a
        vehicle still reads as in stock or as an ETA according to its location column. Vehicles pulled in this way carry a
        <span className="mx-1 rounded bg-amber-100 px-1 font-medium text-amber-800">Rule</span> tag on the TF stock list so
        you can see what a rule caught. Brokers never see the tag.
      </p>
      <div className="mt-3 space-y-2">
        {rules.map((r) => <Rule key={r.columnLetter} rule={r} />)}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {on.length === 0
          ? "All rules are off — only vehicles with an empty column H appear."
          : `${total.toLocaleString()} vehicle${total === 1 ? "" : "s"} currently pulled in by ${on.length === 1 ? "this rule" : "these rules"}.`}
      </p>
    </section>
  );
}
