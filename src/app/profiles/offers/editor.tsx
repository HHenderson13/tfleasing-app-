"use client";

// Adding and changing the bespoke offers. Pick the models, say what makes it
// special in one sentence the customer reads, and optionally the last day.
// Each day's line is written already; change any of them, with [Model],
// [Offer] and [Valid until] filled in, and see how it reads as you type.

import { useState } from "react";
import { BTN, CARD, INPUT, LABEL } from "@/components/ui";
import { MSG_MODELS, isLiveOffer, msgModel, offerLine, offerProblems, standardOfferLine, type Day, type MessageConfig, type MessageOffer } from "@/lib/message-templates";
import { deleteOfferAction, saveOfferAction } from "../messages/actions";

type Draft = Omit<MessageOffer, "id" | "updatedAt" | "updatedBy">;
const BLANK: Draft = { title: "", models: [], who: "both", offer: "", details: "", validUntil: null, day1: "", day2: "", day3: "", active: true };
const ukDate = (iso: string) => iso.split("-").reverse().join("/");

export function OffersEditor({ initial, today, config }: { initial: MessageOffer[]; today: string; config: MessageConfig }) {
  const [offers, setOffers] = useState(initial);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const status = (o: MessageOffer) => (!o.active ? "Paused" : o.validUntil && o.validUntil < today ? "Ended" : "Live");
  const sorted = [...offers].sort((a, b) => Number(isLiveOffer(b, today)) - Number(isLiveOffer(a, today)) || b.updatedAt - a.updatedAt);

  async function toggle(o: MessageOffer) {
    const r = await saveOfferAction(o.id, { ...o, active: !o.active });
    if (r.ok) setOffers(r.offers);
  }
  async function remove(id: string) {
    const r = await deleteOfferAction(id);
    if (r.ok) setOffers(r.offers);
    setConfirm(null);
  }

  if (editing) {
    return <OfferForm id={editing.id} start={editing.draft} config={config} onCancel={() => setEditing(null)} onSaved={(list) => { setOffers(list); setEditing(null); }} />;
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setEditing({ id: null, draft: BLANK })} className={BTN.primary}>New offer</button>
      </div>
      {sorted.length === 0 ? (
        <div className={`${CARD} px-6 py-12 text-center`}>
          <h2 className="text-[17px] font-semibold text-slate-900">No offers yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-6 text-slate-600">Add one and it shows on the messages for its models, with a line for each day, until its last day.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((o) => {
            const st = status(o);
            const first = msgModel(o.models[0], config);
            return (
              <li key={o.id} className={`${CARD} p-4 sm:p-5`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-semibold text-slate-900">{o.title}</h2>
                      <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ring-1 ring-inset ${st === "Live" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-50 text-slate-700 ring-slate-200"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st === "Live" ? "bg-emerald-500" : "bg-slate-400"}`} />{st}
                      </span>
                    </div>
                    <div className="mt-1 text-[13px] text-slate-600">
                      {[o.models.map((k) => msgModel(k, config)?.label ?? k).join(", "), o.who === "both" ? "Personal and business" : o.who === "personal" ? "Personal only" : "Business only",
                        o.validUntil ? `Last day ${ukDate(o.validUntil)}` : "No end date"].join(" · ")}
                    </div>
                    {first && <p className="mt-2 text-[13.5px] leading-5 text-slate-800">{offerLine(o, 1, first.label, config)}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setEditing({ id: o.id, draft: { ...o } })} className={BTN.small}>Edit</button>
                    <button type="button" onClick={() => void toggle(o)} className={BTN.small}>{o.active ? "Pause" : "Resume"}</button>
                    {confirm === o.id ? (
                      <button type="button" onClick={() => void remove(o.id)} className={BTN.danger}>Delete for good</button>
                    ) : (
                      <button type="button" onClick={() => setConfirm(o.id)} className={BTN.danger}>Delete</button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OfferForm({ id, start, config, onCancel, onSaved }: { id: string | null; start: Draft; config: MessageConfig; onCancel: () => void; onSaved: (offers: MessageOffer[]) => void }) {
  const [d, setD] = useState<Draft>(start);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const sample = msgModel(d.models[0], config)?.label ?? "Transit Custom";
  const preview = (day: Day) => offerLine({ ...d, id: "", updatedAt: 0, updatedBy: "" }, day, sample, config);

  async function save() {
    const local = offerProblems(d);
    if (local.length) { setErrors(local); return; }
    setBusy(true);
    const r = await saveOfferAction(id, d).catch(() => ({ ok: false as const, errors: ["Couldn't save the offer. Please try again."] }));
    setBusy(false);
    if (r.ok) onSaved(r.offers);
    else setErrors(r.errors);
  }

  const pill = (on: boolean) => `h-8 rounded-full px-3 text-[13px] font-medium transition ${on ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:ring-slate-400"}`;
  const area = "w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base leading-[22px] text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14.5px]";

  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <h2 className="text-[19px] font-semibold tracking-tight text-slate-900">{id ? "Change the offer" : "New offer"}</h2>
      <div className="mt-5 space-y-6">
        <label className="block">
          <span className={LABEL}>Name, for the team</span>
          <input value={d.title} onChange={(e) => up({ title: e.target.value })} placeholder="e.g. Transit Custom Trail, £299 + VAT" className={INPUT} />
        </label>

        <div>
          <span className={LABEL}>On which models?</span>
          <div className="flex flex-wrap gap-1.5">
            {MSG_MODELS.map((base) => {
              const m = msgModel(base.key, config)!;
              const on = d.models.includes(m.key);
              return <button key={m.key} type="button" aria-pressed={on} className={pill(on)} onClick={() => up({ models: on ? d.models.filter((k) => k !== m.key) : [...d.models, m.key] })}>{m.label}</button>;
            })}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className={LABEL}>For</span>
            <div className="flex flex-wrap gap-1.5">
              {(["both", "personal", "business"] as const).map((w) => (
                <button key={w} type="button" aria-pressed={d.who === w} className={pill(d.who === w)} onClick={() => up({ who: w })}>
                  {w === "both" ? "Personal and business" : w === "personal" ? "Personal only" : "Business only"}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={LABEL}>Last day (optional)</span>
            <input type="date" value={d.validUntil ?? ""} onChange={(e) => up({ validUntil: e.target.value || null })} className={INPUT} />
            <span className="mt-1 block text-[12.5px] text-slate-600">It stops showing after this day. Only set one that&apos;s confirmed.</span>
          </label>
        </div>

        <label className="block">
          <span className={LABEL}>What makes it special, as the customer reads it</span>
          <textarea value={d.offer} onChange={(e) => up({ offer: e.target.value })} rows={2} className={area}
            placeholder="e.g. It's £299 + VAT a month, with metallic paint and ply lining included." />
          <span className="mt-1 block text-[12.5px] text-slate-600">Only what applies to the actual derivative and stock. This is [Offer] in the lines below.</span>
        </label>

        <label className="block">
          <span className={LABEL}>For the team only (optional)</span>
          <textarea value={d.details} onChange={(e) => up({ details: e.target.value })} rows={3} className={area}
            placeholder={"Derivative, initial rental, term, mileage, stock and delivery. Shown to the exec when they choose it, never in a message."} />
        </label>

        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">Each day&apos;s line</h3>
          <p className="mt-0.5 text-[13px] leading-5 text-slate-600">Day 1 introduces it, Day 2 explains the value, Day 3 is a light reminder. Leave one blank for the standard line. [Model], [Offer] and [Valid until] are filled in.</p>
          <div className="mt-3 space-y-4">
            {([1, 2, 3] as Day[]).map((day) => {
              const key = `day${day}` as "day1" | "day2" | "day3";
              return (
                <div key={day}>
                  <span className={LABEL}>{`Day ${day}`}</span>
                  <textarea value={d[key]} onChange={(e) => up({ [key]: e.target.value })} rows={2} className={area}
                    placeholder={standardOfferLine(day, !!d.validUntil, config)} />
                  <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[13px] leading-5 text-slate-800"><span className="font-medium text-slate-600">{`Reads, for the ${sample}: `}</span>{preview(day)}</p>
                </div>
              );
            })}
          </div>
        </div>

        {errors.length > 0 && (
          <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[13.5px] leading-5 text-rose-900 ring-1 ring-inset ring-rose-200">
            <ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={BTN.secondary}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy} className={BTN.primary}>{busy ? "Saving" : id ? "Save changes" : "Add the offer"}</button>
        </div>
      </div>
    </div>
  );
}
