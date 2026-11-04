"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FORD_MODELS, kindFor } from "@/lib/customer-profiles";
import { createProfileAction } from "./actions";
import { Icon, Modal } from "./ui";

const QUICK = ["Puma", "Kuga", "Explorer", "Ranger", "Transit Custom", "Transit"];

/**
 * Three things to start: who, personal or business, and the model. Whether a
 * business gets the car or the van questions follows the model (a Ranger is a
 * van here), so nobody decides that on a live call (user, 2026-11-04).
 */
export function NewProfile({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [who, setWho] = useState<"personal" | "business" | "">("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setModelSuggest = setModel;
  const kind = who ? kindFor(who, model) : "";
  const ready = name.trim() !== "" && kind !== "";

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await createProfileAction({ customerName: name, kind, model });
    if (res.ok && res.id) router.push(`/profiles/${res.id}`);
    else { setError(res.error ?? "Couldn't create the profile."); setBusy(false); }
  }

  return (
    <Modal title="New customer" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Customer name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Jones, or Smith Plumbing Ltd"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[15px]" />
        </label>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Personal or business?</span>
          <div className="grid grid-cols-2 gap-2.5">
            {([["personal", "Personal", "Personal contract hire", "person"], ["business", "Business", "Business contract hire", "building"]] as const).map(([k, title, sub, icon]) => (
              <button key={k} type="button" onClick={() => setWho(k)} aria-pressed={who === k}
                className={`rounded-xl px-4 py-3.5 text-left ring-1 ring-inset transition ${who === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-900 ring-slate-300 hover:ring-slate-400"}`}>
                <Icon name={icon} className={`h-5 w-5 ${who === k ? "text-white" : "text-slate-400"}`} />
                <div className="mt-2 text-[15px] font-semibold">{title}</div>
                <div className={`text-[12.5px] ${who === k ? "text-slate-300" : "text-slate-500"}`}>{sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="np-model" className="mb-1.5 block text-[13px] font-medium text-slate-700">Model they&apos;re interested in</label>
          <input id="np-model" value={model} onChange={(e) => setModelSuggest(e.target.value)} list="ford-models" placeholder="e.g. Kuga"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[15px]" />
          <datalist id="ford-models">{FORD_MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK.map((m) => (
              <button key={m} type="button" onClick={() => setModelSuggest(m)} aria-pressed={model === m}
                className={`h-7 rounded-full px-2.5 text-[12.5px] font-medium transition ${model === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-[13px] text-rose-700">{error}</p>}
        <button type="submit" disabled={!ready || busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {busy ? "Starting" : "Start profile"}{!busy && <Icon name="chevron" />}
        </button>
      </form>
    </Modal>
  );
}
