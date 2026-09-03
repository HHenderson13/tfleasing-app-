"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteModelDealerRuleAction, saveModelDealerRuleAction } from "./actions";

export interface ModelDealerRuleRow {
  id: string;
  modelRaw: string;
  dealerCodes: string;
  displayName: string;
  tfNote: string;
  brokerNote: string;
  enabled: boolean;
  matchedCount: number;
}

const field = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm";

function Rule({ rule, isNew }: { rule: ModelDealerRuleRow; isNew?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(rule);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(rule);

  function save(next = v) {
    setError(null);
    start(async () => {
      const res = await saveModelDealerRuleAction({
        id: next.id,
        modelRaw: next.modelRaw,
        dealerCodes: next.dealerCodes,
        displayName: next.displayName,
        tfNote: next.tfNote,
        brokerNote: next.brokerNote,
        enabled: next.enabled,
      });
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      await deleteModelDealerRuleAction(rule.id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Feed model
          <input value={v.modelRaw} onChange={(e) => setV({ ...v, modelRaw: e.target.value })} placeholder="EXPLORER" className={`mt-1 w-36 font-mono ${field}`} />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Show instead as
          <input value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} placeholder="Explorer Van" className={`mt-1 w-40 ${field}`} />
        </label>
        <label className="flex min-w-[16rem] flex-1 flex-col text-xs font-medium text-slate-700">
          Dealer codes
          <input value={v.dealerCodes} onChange={(e) => setV({ ...v, dealerCodes: e.target.value })} placeholder="97706, 97709, 97714, 97726" className={`mt-1 font-mono ${field}`} />
        </label>
        <button
          onClick={() => { const n = { ...v, enabled: !v.enabled }; setV(n); if (!isNew) save(n); }}
          disabled={pending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            v.enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
          }`}
        >
          {v.enabled ? "On" : "Off"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className="flex min-w-[18rem] flex-1 flex-col text-xs font-medium text-slate-700">
          Warning on the TF stock list
          <input value={v.tfNote} onChange={(e) => setV({ ...v, tfNote: e.target.value })} placeholder="Check with Fleet before offering" className={`mt-1 ${field}`} />
        </label>
        <label className="flex min-w-[18rem] flex-1 flex-col text-xs font-medium text-slate-700">
          Warning brokers see
          <input value={v.brokerNote} onChange={(e) => setV({ ...v, brokerNote: e.target.value })} placeholder="Check with Dealer before offering" className={`mt-1 ${field}`} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {(dirty || isNew) && (
          <button onClick={() => save()} disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {pending ? "Saving…" : isNew ? "Add rule" : "Save changes"}
          </button>
        )}
        {!isNew && (
          confirming ? (
            <span className="space-x-3 text-xs">
              <span className="text-red-700">Delete this rule?</span>
              <button onClick={remove} disabled={pending} className="font-semibold text-red-700 hover:text-red-900">Yes, delete</button>
              <button onClick={() => setConfirming(false)} className="text-slate-600 hover:text-slate-900">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
          )
        )}
        {!isNew && (
          <span className="text-xs text-slate-500">
            {rule.matchedCount.toLocaleString()} vehicle{rule.matchedCount === 1 ? "" : "s"} in the current upload match
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ModelDealerRules({ rules }: { rules: ModelDealerRuleRow[] }) {
  // The blank row's id is minted on click, not during render — Date.now()
  // in the render path is impure and would change on every re-render.
  const [adding, setAdding] = useState<string | null>(null);
  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium text-slate-700">Model overrides by dealer</h2>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">
        Some vehicles are a different model from what Ford&rsquo;s feed calls them, and only the dealer says so — an
        Explorer on a van site is an Explorer Van. A matching vehicle is renamed everywhere, including in the Model
        filter, and carries a warning on both stock lists.
      </p>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">
        The two warnings are deliberately separate: TF staff are told to check with Fleet, brokers to check with the
        dealer. A broker never sees the TF wording.
      </p>
      <div className="mt-3 space-y-2">
        {rules.map((r) => <Rule key={r.id} rule={r} />)}
        {adding && (
          <Rule
            isNew
            rule={{ id: adding, modelRaw: "", dealerCodes: "", displayName: "", tfNote: "", brokerNote: "", enabled: true, matchedCount: 0 }}
          />
        )}
      </div>
      {!adding && (
        <button onClick={() => setAdding(`rule-${Date.now()}`)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Add a rule
        </button>
      )}
    </section>
  );
}
