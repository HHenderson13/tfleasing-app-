"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteStockAvailabilityRuleAction, saveStockAvailabilityRuleAction } from "./actions";

export interface RuleRow {
  id: number;
  hCode: string;
  /** Blank = any column E value. */
  eValue: string;
  enabled: boolean;
  // Split by what happens to a match. A single "N match" figure disagreed
  // with the stock list's own filter and read as lost stock.
  pulledIn: number;     // on the list because of this rule; what the filter shows
  outOfRange: number;   // a model we don't sell or an excluded branch — no rule overrides those
  notSellable: number;  // no VIN and no ETA, which the list has always required
}

const input = "mt-1 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm uppercase";

function Rule({ rule }: { rule: RuleRow }) {
  const router = useRouter();
  const [hCode, setHCode] = useState(rule.hCode);
  const [eValue, setEValue] = useState(rule.eValue);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = hCode !== rule.hCode || eValue !== rule.eValue || enabled !== rule.enabled;

  function save(nextEnabled = enabled) {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await saveStockAvailabilityRuleAction({ id: rule.id, hCode, eValue, enabled: nextEnabled });
      if (!res.ok) { setError(res.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete the rule for column H "${rule.hCode}"? Vehicles it makes available will leave the stock list.`)) return;
    start(async () => {
      const res = await deleteStockAvailabilityRuleAction(rule.id);
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Column H is
          <input value={hCode} onChange={(e) => setHCode(e.target.value)} placeholder="e.g. CO" className={`${input} w-28`} />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          and column E is
          <input value={eValue} onChange={(e) => setEValue(e.target.value)} placeholder="any" className={`${input} w-28`} />
        </label>
        <button
          onClick={() => { const n = !enabled; setEnabled(n); save(n); }}
          disabled={pending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
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
            {pending ? "Saving…" : "Save"}
          </button>
        )}
        <button onClick={remove} disabled={pending} className="ml-auto text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">
          Delete
        </button>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <dt className="inline text-slate-500">On the stock list because of this rule: </dt>
          <dd className="inline font-semibold tabular-nums text-slate-900">{rule.pulledIn.toLocaleString()}</dd>
          <span className="ml-1 text-slate-400">
            (filter the stock list by <span className="font-medium">Included by → Availability rule</span> to see these)
          </span>
        </div>
        {rule.outOfRange > 0 && (
          <div>
            <dt className="inline text-slate-500">Matched but out of range: </dt>
            <dd className="inline font-semibold tabular-nums text-slate-700">{rule.outOfRange.toLocaleString()}</dd>
            <span className="ml-1 text-slate-400">(a model we don&apos;t sell, or an excluded branch)</span>
          </div>
        )}
        {rule.notSellable > 0 && (
          <div>
            <dt className="inline text-slate-500">Matched but skipped: </dt>
            <dd className="inline font-semibold tabular-nums text-amber-700">{rule.notSellable.toLocaleString()}</dd>
            <span className="ml-1 text-slate-400">(no VIN and no ETA)</span>
          </div>
        )}
      </dl>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && !error && !dirty && <p className="mt-2 text-xs text-emerald-700">Saved. Stock list updated.</p>}
    </div>
  );
}

function AddRule() {
  const router = useRouter();
  const [hCode, setHCode] = useState("");
  const [eValue, setEValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    start(async () => {
      const res = await saveStockAvailabilityRuleAction({ id: null, hCode, eValue, enabled: true });
      if (!res.ok) { setError(res.error); return; }
      setHCode("");
      setEValue("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Column H is
          <input value={hCode} onChange={(e) => setHCode(e.target.value)} placeholder="code" className={`${input} w-28`} />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          and column E is
          <input value={eValue} onChange={(e) => setEValue(e.target.value)} placeholder="any" className={`${input} w-28`} />
        </label>
        <button
          onClick={add}
          disabled={pending || !hCode.trim()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add rule"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function AvailabilityRules({ rules, hidden }: { rules: RuleRow[]; hidden: { code: string; count: number }[] }) {
  const on = rules.filter((r) => r.enabled);
  const total = on.reduce((a, r) => a + r.pulledIn, 0);
  const hiddenTotal = hidden.reduce((a, h) => a + h.count, 0);
  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium text-slate-700">Availability rules</h2>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">
        Column H decides whether a vehicle is ours to sell. <span className="font-medium">Blank</span> is available (unless the
        report names a customer or fleet). <span className="font-medium">Any code</span> in it is not, unless a rule below names
        that code, with the column E value it needs if it needs one. Models we don&apos;t sell, excluded branches, and vehicles
        with neither a VIN nor an ETA stay off the list whatever column H says. This applies to the TF stock list and the broker
        portal.
      </p>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">
        A rule decides whether a vehicle <span className="font-medium">appears</span>. It does not change its status: a
        vehicle still reads as in stock or as an ETA according to its location column. Vehicles a rule makes available carry a
        <span className="mx-1 rounded bg-amber-100 px-1 font-medium text-amber-800">Rule</span> tag on the TF stock list.
        Brokers never see the tag.
      </p>
      <div className="mt-3 space-y-2">
        {rules.map((r) => <Rule key={`${r.id}-${r.hCode}-${r.eValue}-${r.enabled}`} rule={r} />)}
        <AddRule />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {on.length === 0
          ? "All rules are off — only vehicles with an empty column H appear."
          : `${total.toLocaleString()} vehicle${total === 1 ? "" : "s"} on the stock list because of ${on.length === 1 ? "this rule" : "these rules"}.`}
      </p>
      {hiddenTotal > 0 && (
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Kept off by a column H code no rule names: <span className="font-semibold text-slate-700">{hiddenTotal.toLocaleString()}</span>{" "}
          <span className="text-slate-400">
            ({hidden.slice(0, 12).map((h) => `${h.code} ${h.count.toLocaleString()}`).join(" · ")}{hidden.length > 12 ? " · …" : ""})
          </span>
        </p>
      )}
    </section>
  );
}
