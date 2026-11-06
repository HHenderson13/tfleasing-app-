"use client";

// Changing what the message builder says: the emails, the WhatsApp and text
// styles, every discovery question, which questions each model gets, and the
// extras. Edits stay here until Save; a section that's been changed can be
// put back to the standard wording on its own. Placeholders go in with a tap
// on the chips, so nobody has to type [Offer and extras] exactly.

import Link from "next/link";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BTN, CARD, PageTitle, StatusPill, Tabs } from "@/components/ui";
import {
  ANGLES, ANGLE_LABEL, COMMON_TOKENS, DAYS, DEFAULT_CONFIG, EMAIL_TOKENS, FITS_LABEL, MODEL_BASE, OFFER_TOKENS, QSETS, WA_TOKENS, configProblems,
  type Choice, type ConfigTab, type Day, type Fits, type MessageConfig, type Problem, type QItem, type QSetKey, type WaStyleCfg, type Who,
} from "@/lib/message-config";
import { EMPTY_INPUT, MSG_MODELS, buildMessage, msgModel, questionsFor, type Channel, type Sender } from "@/lib/message-templates";
import type { ConfigState } from "@/lib/message-store";
import { saveMessageConfigAction } from "../messages/actions";

const TABS: { key: ConfigTab; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp and text" },
  { key: "questions", label: "Questions" },
  { key: "models", label: "Models" },
  { key: "extras", label: "Day names and extras" },
];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T,>(v: T): T => structuredClone(v);
const when = (sec: number) => new Date(sec * 1000).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ─── Putting a placeholder in where the cursor is ────────────────────────

type Target = { el: HTMLTextAreaElement | HTMLInputElement; set: (v: string) => void } | null;
const InsertCtx = createContext<{ focus: (t: Target) => void; insert: (token: string) => boolean }>({ focus: () => {}, insert: () => false });

function useInsert() {
  const target = useRef<Target>(null);
  return useMemo(() => ({
    focus: (t: Target) => { target.current = t; },
    insert: (token: string) => {
      const t = target.current;
      if (!t || !document.contains(t.el)) return false;
      const { el } = t;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      t.set(el.value.slice(0, start) + token + el.value.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
      return true;
    },
  }), []);
}

/** A text box that grows with what's in it. */
/** The latest change handler, so a placeholder tapped in later never writes through an old one. */
function useLatest<T>(v: T) {
  const r = useRef(v);
  useLayoutEffect(() => { r.current = v; });
  return r;
}

function Area({ value, onChange, rows = 2, placeholder, label, mono }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; label: string; mono?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { focus } = useContext(InsertCtx);
  const latest = useLatest(onChange);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, rows * 22 + 22)}px`;
  }, [value, rows]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => focus({ el: e.currentTarget, set: (v) => latest.current(v) })} rows={rows}
      aria-label={label} placeholder={placeholder}
      className={`w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base leading-[22px] text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14px] ${mono ? "font-mono text-[13px] sm:text-[13px]" : ""}`} />
  );
}

function Line({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const { focus } = useContext(InsertCtx);
  const latest = useLatest(onChange);
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => focus({ el: e.currentTarget, set: (v) => latest.current(v) })} aria-label={label} placeholder={placeholder}
      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14px]" />
  );
}

/** The placeholders a box can use. Tap one to put it where the cursor is. */
function Tokens({ names }: { names: string[] }) {
  const { insert } = useContext(InsertCtx);
  const [miss, setMiss] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] text-slate-600">{miss ? "Click into a box first, then tap:" : "Tap to add:"}</span>
      {names.map((n) => (
        <button key={n} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setMiss(!insert(`[${n}]`))}
          className="h-6 rounded-md bg-slate-100 px-1.5 font-mono text-[11.5px] text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-200">
          [{n}]
        </button>
      ))}
    </div>
  );
}

// ─── Lists: add, move, remove ────────────────────────────────────────────

function ListEditor<T>({ items, onChange, render, make, add, min = 1, numbered = true }: {
  items: T[]; onChange: (items: T[]) => void; render: (item: T, set: (v: T) => void, i: number) => ReactNode; make: () => T; add: string; min?: number; numbered?: boolean;
}) {
  const move = (i: number, d: number) => { const n = [...items]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  const btn = "grid h-7 w-7 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          {numbered && <span className="mt-2.5 w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-500">{i + 1}</span>}
          <div className="min-w-0 flex-1">{render(it, (v) => { const n = [...items]; n[i] = v; onChange(n); }, i)}</div>
          <div className="flex shrink-0 flex-col items-center">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className={btn}><Arrow up /></button>
            <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className={btn}><Arrow /></button>
            <button type="button" aria-label="Remove" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))} className={`${btn} hover:!bg-rose-50 hover:!text-rose-700`}><Cross /></button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, make()])} className="ml-7 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50">
        <span className="text-[15px] leading-none">+</span>{add}
      </button>
    </div>
  );
}

const Arrow = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-4 w-4 ${up ? "rotate-180" : ""}`}><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
);
const Cross = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
);

function Card({ title, hint, aside, children }: { title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-semibold text-slate-900">{title}</h3>
          {hint && <p className="mt-0.5 text-[13px] leading-5 text-slate-600">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Puts one section back to the standard wording. Only shows once it's been changed. */
function Reset({ changed, onReset, what }: { changed: boolean; onReset: () => void; what: string }) {
  if (!changed) return <span className="shrink-0 text-[12.5px] text-slate-600">Standard wording</span>;
  return (
    <button type="button" onClick={onReset} title={`Put ${what} back to the standard wording`}
      className="shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-amber-900 ring-1 ring-inset ring-amber-300 transition hover:bg-amber-50">
      Changed · put back to standard
    </button>
  );
}

function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}
      className="h-10 rounded-xl border border-slate-300 bg-white pl-3 pr-8 text-[14px] text-slate-900 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10">
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

export function TemplatesEditor({ initial, sender: me, today }: { initial: ConfigState; sender: Sender; today: string }) {
  const [saved, setSaved] = useState(initial.config);
  const [draft, setDraft] = useState(initial.config);
  const [meta, setMeta] = useState({ at: initial.updatedAt, by: initial.updatedBy });
  const [tab, setTab] = useState<ConfigTab>("email");
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const ins = useInsert();
  const dirty = !same(draft, saved);
  const edit = (fn: (d: MessageConfig) => void) => setDraft((prev) => { const n = clone(prev); fn(n); return n; });
  // The preview is signed with the admin's own details, or a made-up pair until they've saved theirs.
  const sender: Sender = { ...me, landline: me.landline || "0113 496 0000", mobile: me.mobile || "07700 900123" };

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  async function save() {
    const local = configProblems(draft);
    if (local.length) { setProblems(local); return; }
    setBusy(true);
    const r = await saveMessageConfigAction(draft).catch(() => ({ ok: false as const, problems: [{ tab: "email" as ConfigTab, where: "Templates", text: "Couldn't save the changes. Please try again." }] }));
    setBusy(false);
    if (!r.ok) { setProblems(r.problems); return; }
    setSaved(r.config);
    setDraft(r.config);
    setMeta({ at: r.updatedAt, by: r.updatedBy });
    setProblems(null);
    setToast("Saved. Every exec gets the new wording the next time they open a message.");
  }

  const changedTabs = new Set<ConfigTab>([
    ...(DAYS.some((d) => !same(draft.email[d], DEFAULT_CONFIG.email[d])) ? ["email" as const] : []),
    ...(DAYS.some((d) => !same(draft.whatsapp[d], DEFAULT_CONFIG.whatsapp[d])) ? ["whatsapp" as const] : []),
    ...(!same(draft.questions, DEFAULT_CONFIG.questions) ? ["questions" as const] : []),
    ...(!same(draft.models, DEFAULT_CONFIG.models) ? ["models" as const] : []),
    ...(!same(draft.days, DEFAULT_CONFIG.days) || !same(draft.fleet, DEFAULT_CONFIG.fleet) || !same(draft.offers, DEFAULT_CONFIG.offers) ? ["extras" as const] : []),
  ]);

  return (
    <InsertCtx.Provider value={ins}>
      <PageTitle title="Message templates"
        pill={<StatusPill tone={meta.at ? "amber" : "emerald"}>{meta.at ? `Last changed by ${meta.by ?? "a manager"}, ${when(meta.at)}` : "All standard wording"}</StatusPill>}>
        Everything the message builder writes. Change any of it, check the preview, and save: every exec gets it the next time they open a message. Anything you haven&apos;t changed keeps the standard wording.
      </PageTitle>

      <Tabs items={TABS.map((t) => ({ key: t.key, label: <span className="flex items-center gap-1.5">{t.label}{changedTabs.has(t.key) && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Changed from the standard" />}</span> }))}
        value={tab} onChange={setTab} label="Which part" />

      <div className="mt-6 pb-28">
        {tab === "email" && <EmailTab draft={draft} edit={edit} sender={sender} today={today} />}
        {tab === "whatsapp" && <WhatsAppTab draft={draft} edit={edit} sender={sender} today={today} />}
        {tab === "questions" && <QuestionsTab draft={draft} edit={edit} />}
        {tab === "models" && <ModelsTab draft={draft} edit={edit} />}
        {tab === "extras" && <ExtrasTab draft={draft} edit={edit} />}
      </div>

      {(dirty || problems) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            {problems && problems.length > 0 && (
              <div role="alert" className="mb-3 max-h-40 overflow-y-auto rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] leading-5 text-rose-900 ring-1 ring-inset ring-rose-200">
                <div className="font-semibold">{`Not saved. ${problems.length === 1 ? "One thing needs" : `${problems.length} things need`} fixing first:`}</div>
                <ul className="mt-1 space-y-0.5">
                  {problems.map((p, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => setTab(p.tab)} className="text-left underline decoration-rose-300 underline-offset-2 hover:decoration-rose-700">
                        <span className="font-medium">{`${TABS.find((t) => t.key === p.tab)?.label}, ${p.where}:`}</span> {p.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="flex-1 text-[13.5px] font-medium text-slate-700">{dirty ? "You have changes that aren't saved yet" : "Nothing to save"}</span>
              <button type="button" onClick={() => { setDraft(saved); setProblems(null); }} disabled={!dirty} className={BTN.small}>Discard</button>
              <button type="button" onClick={() => void save()} disabled={!dirty || busy} className={BTN.smallPrimary}>{busy ? "Saving" : "Save changes"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div className="rounded-xl bg-slate-900 px-4 py-3 text-[14px] text-white shadow-xl">{toast}</div>
        </div>
      )}
    </InsertCtx.Provider>
  );
}

type TabProps = { draft: MessageConfig; edit: (fn: (d: MessageConfig) => void) => void };

function DayBar({ day, setDay, aside }: { day: Day; setDay: (d: Day) => void; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Tabs size="sm" items={DAYS.map((d) => ({ key: String(d) as "1" | "2" | "3", label: `Day ${d}` }))} value={String(day) as "1" | "2" | "3"} onChange={(k) => setDay(Number(k) as Day)} label="Which day" />
      <div className="ml-auto">{aside}</div>
    </div>
  );
}

// ─── Email ───────────────────────────────────────────────────────────────

function EmailTab({ draft, edit, sender, today }: TabProps & { sender: Sender; today: string }) {
  const [day, setDay] = useState<Day>(2);
  const e = draft.email[day];
  const set = (fn: (x: MessageConfig["email"][Day]) => void) => edit((d) => fn(d.email[day]));
  const [pick, setPick] = useState({ opening: 0, ending: 0 });
  return (
    <div>
      <DayBar day={day} setDay={setDay}
        aside={<Reset changed={!same(e, DEFAULT_CONFIG.email[day])} what={`the Day ${day} email`} onReset={() => edit((d) => { d.email[day] = clone(DEFAULT_CONFIG.email[day]); })} />} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          <Card title="Subject">
            <Line value={e.subject} onChange={(v) => set((x) => { x.subject = v; })} label="Subject" />
            <Tokens names={COMMON_TOKENS} />
          </Card>
          <Card title="Layout" hint={<>How the email is put together. [Opening] and [Ending] are the ones the exec picks; [Offer and extras] is the offer, their Day 1 answer and anything they add. Take out [Question] and it won&apos;t ask one. Their signature and the WhatsApp button always follow.</>}>
            <Area value={e.template} onChange={(v) => set((x) => { x.template = v; })} rows={8} label="Email layout" mono />
            <Tokens names={EMAIL_TOKENS} />
          </Card>
          <Card title="Openings" hint="The exec picks one. A blank line starts a new paragraph. The note shows as a warning beside it in the dropdown.">
            <ListEditor<Choice> items={e.openings} onChange={(v) => set((x) => { x.openings = v; })} make={() => ({ text: "" })} add="Add an opening"
              render={(o, put, i) => (
                <div className="space-y-1.5">
                  <Area value={o.text} onChange={(v) => put({ ...o, text: v })} label={`Opening ${i + 1}`} />
                  <Line value={o.note ?? ""} onChange={(v) => put(v ? { ...o, note: v } : { text: o.text })} label={`Opening ${i + 1} note`} placeholder="Note for the exec (optional), e.g. only if you've reviewed it" />
                </div>
              )} />
            <Tokens names={COMMON_TOKENS} />
          </Card>
          <Card title="Endings" hint="The exec picks one. Include the &quot;Feel free to reply&quot; line in each ending that should have it.">
            <ListEditor<Choice> items={e.endings} onChange={(v) => set((x) => { x.endings = v; })} make={() => ({ text: "" })} add="Add an ending"
              render={(o, put, i) => <Area value={o.text} onChange={(v) => put({ ...o, text: v })} label={`Ending ${i + 1}`} />} />
            <Tokens names={COMMON_TOKENS} />
          </Card>
        </div>
        <Preview draft={draft} day={day} channel="email" sender={sender} today={today}
          controls={(
            <>
              <NumberPick label="Opening" n={e.openings.length} value={pick.opening} onChange={(v) => setPick((p) => ({ ...p, opening: v }))} />
              <NumberPick label="Ending" n={e.endings.length} value={pick.ending} onChange={(v) => setPick((p) => ({ ...p, ending: v }))} />
            </>
          )}
          input={{ emailOpening: pick.opening, emailEnding: pick.ending }} />
      </div>
    </div>
  );
}

function NumberPick({ label, n, value, onChange }: { label: string; n: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[12.5px] text-slate-700">
      {label}
      <select value={Math.min(value, Math.max(0, n - 1))} onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-lg border border-slate-300 bg-white pl-2 pr-7 text-[13px] focus:border-slate-900 focus:outline-none">
        {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
      </select>
    </label>
  );
}

/** How it reads, with the draft wording: James, the model and customer chosen here, the suggested question, no offer. */
function Preview({ draft, day, channel, sender, today, controls, input, fit }: {
  draft: MessageConfig; day: Day; channel: Channel; sender: Sender; today: string; controls?: ReactNode;
  input: Partial<typeof EMPTY_INPUT>; fit?: Fits;
}) {
  const [who, setWho] = useState<Who>("personal");
  const [modelKey, setModelKey] = useState("puma");
  // A style shown only to some customers previews as one of them.
  const sampleWho: Who = fit === "personal" ? "personal" : fit === "business-car" || fit === "van" ? "business" : who;
  const sampleKey = fit === "business-car" && msgModel(modelKey)?.van ? "kuga" : fit === "van" && !msgModel(modelKey)?.van ? "transit-custom" : modelKey;
  const m = msgModel(sampleKey, draft)!;
  const q = questionsFor(day, sampleWho, m, draft).find((x) => x.suggested)?.text ?? null;
  const built = buildMessage({ ...EMPTY_INPUT, day, channel, first: "James", who: sampleWho, modelKey: sampleKey, question: q, asked: "no", offerId: "none", ...input }, sender, [], today, draft);
  return (
    <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
      <div className={`${CARD} overflow-hidden`}>
        <div className="space-y-2.5 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14.5px] font-semibold text-slate-900">Preview</h3>
            <div className="flex flex-wrap items-center justify-end gap-2.5">{controls}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs size="sm" items={[{ key: "personal", label: "Personal" }, { key: "business", label: "Business" }]} value={sampleWho} onChange={(w) => setWho(w as Who)} label="Customer" />
            <Select value={sampleKey} onChange={setModelKey} label="Model" options={MSG_MODELS.map((x) => ({ key: x.key, label: msgModel(x.key, draft)!.label }))} />
          </div>
          {fit && fit !== "all" && <p className="text-[12.5px] text-slate-600">{`This style only shows for ${FITS_LABEL[fit].replace(" only", "").toLowerCase()}.`}</p>}
        </div>
        <div className={`max-h-[70vh] overflow-y-auto px-4 py-4 ${channel === "email" ? "" : "bg-[#ECE5DD]"}`}>
          {built.subject && <div className="mb-3 text-[13px] text-slate-600">Subject: <span className="font-semibold text-slate-900">{built.subject}</span></div>}
          <div className={channel === "email" ? "space-y-3 text-[14px] leading-6 text-slate-900" : "ml-auto max-w-[95%] space-y-[18px] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-[#DCF8C6] px-3.5 py-2.5 text-[14px] leading-[20px] text-slate-900 shadow-sm"}>
            {built.paras.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
            {built.signature && <p className="whitespace-pre-line text-slate-700">{built.signature.join("\n")}</p>}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── WhatsApp and text ───────────────────────────────────────────────────

function WhatsAppTab({ draft, edit, sender, today }: TabProps & { sender: Sender; today: string }) {
  const [day, setDay] = useState<Day>(2);
  const [shown, setShown] = useState(0);
  const styles = draft.whatsapp[day];
  const at = Math.min(shown, styles.length - 1);
  const style = styles[at];
  return (
    <div>
      <DayBar day={day} setDay={(d) => { setDay(d); setShown(0); }}
        aside={<Reset changed={!same(styles, DEFAULT_CONFIG.whatsapp[day])} what={`the Day ${day} WhatsApp styles`} onReset={() => edit((d) => { d.whatsapp[day] = clone(DEFAULT_CONFIG.whatsapp[day]); })} />} />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-5 text-slate-600">
        The exec picks a style. A text is the same message without the emoji. A style without [Question] asks its own, so the exec isn&apos;t asked to pick one for it.
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0">
          <ListEditor<WaStyleCfg> items={styles} numbered={false} onChange={(v) => edit((d) => { d.whatsapp[day] = v; })} add="Add a style"
            make={() => ({ id: `s-${Date.now().toString(36)}`, label: "", hint: "", fits: "all", text: "Hi [First name] 👋\n\n[Question]\n\n[Your name]", endings: [] })}
            render={(s, put, i) => (
              <div className={`${CARD} p-4 ${i === at ? "ring-2 ring-slate-900" : ""}`} onFocusCapture={() => setShown(i)}>
                <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_200px]">
                  <Line value={s.label} onChange={(v) => put({ ...s, label: v })} label="Style name" placeholder="Name the exec sees, e.g. Shorter" />
                  <Select value={s.fits} onChange={(v) => put({ ...s, fits: v })} label="Shown for" options={(Object.keys(FITS_LABEL) as Fits[]).map((k) => ({ key: k, label: `Shown for: ${FITS_LABEL[k]}` }))} />
                </div>
                <div className="mt-2.5"><Line value={s.hint} onChange={(v) => put({ ...s, hint: v })} label="When to use it" placeholder="When to use it (optional), e.g. for someone who hasn't replied to anything" /></div>
                <div className="mt-2.5">
                  <Area value={s.text} onChange={(v) => put({ ...s, text: v })} rows={6} label={`${s.label || "Style"} message`} />
                  <Tokens names={WA_TOKENS} />
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 text-[13px] font-medium text-slate-700">{`Endings for [Ending]${s.endings.length ? "" : " (none: this style doesn't use one)"}`}</div>
                  <ListEditor<string> items={s.endings} min={0} onChange={(v) => put({ ...s, endings: v })} make={() => ""} add="Add an ending"
                    render={(x, putE, j) => <Line value={x} onChange={putE} label={`Ending ${j + 1}`} />} />
                </div>
                <button type="button" onClick={() => setShown(i)} className="mt-3 text-[12.5px] font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">Show in the preview</button>
              </div>
            )} />
        </div>
        {style && (
          <Preview draft={draft} day={day} channel="whatsapp" sender={sender} today={today} fit={style.fits}
            controls={<span className="text-[12.5px] font-medium text-slate-700">{style.label || "New style"}</span>}
            input={{ waStyle: style.id, waEnding: 0 }} />
        )}
      </div>
    </div>
  );
}

// ─── Questions ───────────────────────────────────────────────────────────

function QuestionsTab({ draft, edit }: TabProps) {
  const [key, setKey] = useState<QSetKey>("puma");
  const [stage, setStage] = useState<"early" | "late">("early");
  const s = draft.questions[key];
  const bank = s[stage];
  const users = MODEL_BASE.filter((m) => draft.models[m.key].set === key).map((m) => draft.models[m.key].label);
  const days: Day[] = stage === "early" ? [1, 2] : [3];
  const set = (fn: (x: MessageConfig["questions"][QSetKey]) => void) => edit((d) => fn(d.questions[key]));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={key} onChange={setKey} label="Which questions" options={QSETS.map((q) => ({ key: q.key, label: q.label }))} />
        <Tabs size="sm" items={[{ key: "early", label: "Day 1 and 2" }, { key: "late", label: "Day 3" }]} value={stage} onChange={(v) => setStage(v as "early" | "late")} label="Which days" />
        <div className="ml-auto">
          <Reset changed={!same(s, DEFAULT_CONFIG.questions[key])} what={`the ${QSETS.find((q) => q.key === key)?.label} questions`} onReset={() => edit((d) => { d.questions[key] = clone(DEFAULT_CONFIG.questions[key]); })} />
        </div>
      </div>
      <p className="mb-4 max-w-3xl text-[13.5px] leading-5 text-slate-600">
        {key === "bizcar"
          ? "Every business car gets these, whatever the model."
          : users.length ? `Used for ${users.join(", ")}${key === "puma" || key === "kuga" || key === "explorer" || key === "capri" ? " when it's personal; a business car gets the Business cars questions" : ""}. Change which model gets which on the Models tab.` : "No model uses these at the moment. Choose them for a model on the Models tab."}
        {" "}[Model] is filled in with the model&apos;s name.
      </p>
      <div className="space-y-4">
        <Card title="Suggested" hint="Marked Suggested for the exec. If it starts the same as a question below, it takes that question's place.">
          <div className="space-y-3">
            {days.map((d) => (
              <div key={d} className="grid gap-2 sm:grid-cols-[80px_120px_minmax(0,1fr)] sm:items-start">
                <span className="pt-2 text-[13px] font-medium text-slate-700">{`Day ${d}`}</span>
                <Select value={s.suggested[d].angle} onChange={(v) => set((x) => { x.suggested[d].angle = v; })} label={`Day ${d} suggested kind`} options={ANGLES.map((a) => ({ key: a, label: ANGLE_LABEL[a] }))} />
                <Area value={s.suggested[d].text} onChange={(v) => set((x) => { x.suggested[d].text = v; })} rows={1} label={`Day ${d} suggested question`} />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid gap-4 xl:grid-cols-3">
          {ANGLES.map((a) => (
            <Card key={a} title={ANGLE_LABEL[a]}>
              <ListEditor<QItem> items={bank[a]} min={0} onChange={(v) => set((x) => { x[stage][a] = v; })} make={() => ({ text: "" })} add="Add a question"
                render={(q, put, i) => (
                  <div>
                    <Area value={q.text} onChange={(v) => put({ ...q, text: v })} rows={1} label={`${ANGLE_LABEL[a]} question ${i + 1}`} />
                    <label className="mt-1 flex items-center gap-1.5 text-[12.5px] text-slate-600">
                      <input type="checkbox" checked={!!q.electricOnly} onChange={(e) => put(e.target.checked ? { ...q, electricOnly: true } : { text: q.text })} className="h-3.5 w-3.5 accent-slate-900" />
                      Only for electric or plug-in models
                    </label>
                  </div>
                )} />
            </Card>
          ))}
        </div>
        <Tokens names={[...COMMON_TOKENS]} />
      </div>
    </div>
  );
}

// ─── Models ──────────────────────────────────────────────────────────────

function ModelsTab({ draft, edit }: TabProps) {
  return (
    <Card title="Models" hint="How each model reads in a message, which questions it gets, and whether it plugs in (which adds the questions marked electric only). A business car always gets the Business cars questions."
      aside={<Reset changed={!same(draft.models, DEFAULT_CONFIG.models)} what="the models" onReset={() => edit((d) => { d.models = clone(DEFAULT_CONFIG.models); })} />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-slate-200 text-[12.5px] text-slate-600">
              <th className="py-2 pr-3 font-medium">Model</th>
              <th className="py-2 pr-3 font-medium">Reads as</th>
              <th className="py-2 pr-3 font-medium">Questions</th>
              <th className="py-2 font-medium">Plugs in</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_BASE.map((m) => {
              const c = draft.models[m.key];
              return (
                <tr key={m.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-slate-700">{m.label}<span className="ml-1.5 text-[12px] text-slate-600">{m.van ? "van" : "car"}</span></td>
                  <td className="py-2 pr-3"><Line value={c.label} onChange={(v) => edit((d) => { d.models[m.key].label = v; })} label={`${m.label} reads as`} /></td>
                  <td className="py-2 pr-3"><Select value={c.set} onChange={(v) => edit((d) => { d.models[m.key].set = v; })} label={`${m.label} questions`} options={QSETS.filter((q) => q.key !== "bizcar").map((q) => ({ key: q.key, label: q.label }))} /></td>
                  <td className="py-2"><input type="checkbox" checked={c.electric} onChange={(e) => edit((d) => { d.models[m.key].electric = e.target.checked; })} aria-label={`${m.label} plugs in`} className="h-4 w-4 accent-slate-900" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Day names, the fleet question, the offer lines ──────────────────────

function ExtrasTab({ draft, edit }: TabProps) {
  return (
    <div className="space-y-4">
      <Card title="Day names" hint="On the three day buttons the exec picks from."
        aside={<Reset changed={!same(draft.days, DEFAULT_CONFIG.days)} what="the day names" onReset={() => edit((d) => { d.days = clone(DEFAULT_CONFIG.days); })} />}>
        <div className="space-y-2.5">
          {DAYS.map((d) => (
            <div key={d} className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Line value={draft.days[d].title} onChange={(v) => edit((x) => { x.days[d].title = v; })} label={`Day ${d} name`} />
              <Line value={draft.days[d].aim} onChange={(v) => edit((x) => { x.days[d].aim = v; })} label={`Day ${d} aim`} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Fleet question" hint="The exec can add it for a business on Day 2 and Day 3, after the discovery question."
        aside={<Reset changed={!same(draft.fleet, DEFAULT_CONFIG.fleet)} what="the fleet question" onReset={() => edit((d) => { d.fleet = clone(DEFAULT_CONFIG.fleet); })} />}>
        <div className="space-y-2.5">
          {([2, 3] as const).map((d) => (
            <div key={d}>
              <div className="mb-1 text-[13px] font-medium text-slate-700">{`Day ${d}`}</div>
              <Area value={draft.fleet[d]} onChange={(v) => edit((x) => { x.fleet[d] = v; })} label={`Day ${d} fleet question`} />
            </div>
          ))}
          <Tokens names={COMMON_TOKENS} />
        </div>
      </Card>
      <Card title="Standard offer lines" hint={<>What an offer says on each day unless the offer has its own line. [Offer] is the sentence written on the offer. <Link href="/profiles/offers" className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">The offers themselves</Link>.</>}
        aside={<Reset changed={!same(draft.offers, DEFAULT_CONFIG.offers)} what="the offer lines" onReset={() => edit((d) => { d.offers = clone(DEFAULT_CONFIG.offers); })} />}>
        <div className="space-y-2.5">
          {([["1", "Day 1"], ["2", "Day 2"], ["3", "Day 3, when the offer has no last day"], ["dated3", "Day 3, when it has a last day"]] as const).map(([k, label]) => (
            <div key={k}>
              <div className="mb-1 text-[13px] font-medium text-slate-700">{label}</div>
              <Area value={draft.offers[k as keyof MessageConfig["offers"]]} onChange={(v) => edit((x) => { x.offers[k as keyof MessageConfig["offers"]] = v; })} label={`${label} offer line`} />
            </div>
          ))}
          <Tokens names={OFFER_TOKENS} />
        </div>
      </Card>
    </div>
  );
}
