"use client";

// The message builder (user, 2026-11-06): Day 1, 2 or 3, email, WhatsApp or
// text, built from a few taps and copied to paste into Outlook or send from
// WhatsApp or the phone. Opens from the Customer Profiles list with nothing
// filled in, or from a profile with the customer, personal or business and
// the model already in. Nothing copies until the message is complete: a copy
// with something missing says what, and marks it.

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ANGLES, ANGLE_LABEL, DAY_INFO, EMPTY_INPUT, GAP_RE, MSG_MODELS, QUICK_MODELS, buildMessage, emailChoices, firstWord, msgModel, offerLine, offersFor,
  questionsFor, smsParts, waStyles, type Angle, type Channel, type Day, type MessageOffer, type MissingKey, type MsgInput, type Sender, type Who,
} from "@/lib/message-templates";
import { Glyph, Icon } from "../ui";
import { saveMyDetailsAction } from "./actions";

export interface BuilderPrefill {
  first: string;
  who: Who | null;
  modelKey: string | null;
  /** Questions already asked from this profile. */
  asked: string[];
  customerName?: string;
}

const CHANNELS: { key: Channel; label: string }[] = [{ key: "email", label: "Email" }, { key: "whatsapp", label: "WhatsApp" }, { key: "text", label: "Text" }];
const CARS = MSG_MODELS.filter((m) => !m.van);
const VANS = MSG_MODELS.filter((m) => m.van);

const box = "w-full rounded-xl border bg-white px-3.5 text-base text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition placeholder:text-slate-500 focus:outline-none focus:ring-4 sm:text-[14.5px]";
const okRing = "border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-slate-900/10";
const badRing = "border-rose-400 focus:border-rose-600 focus:ring-rose-500/15";

/** Copies the email as formatted text (for Outlook) with plain text alongside; falls back for older browsers. */
async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      return true;
    }
  } catch { /* fall through */ }
  const div = document.createElement("div");
  div.innerHTML = html; // ours, every typed value escaped (buildMessage)
  div.contentEditable = "true";
  Object.assign(div.style, { position: "fixed", left: "-9999px", top: "0" });
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand("copy");
  sel?.removeAllRanges();
  div.remove();
  return ok;
}

async function copyPlain(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    Object.assign(ta.style, { position: "fixed", opacity: "0" });
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** A missing piece in the preview, highlighted so it's obvious what's left. */
function WithGaps({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(GAP_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(<mark key={m.index} className="rounded bg-amber-100 px-1 font-medium text-amber-900">{m[1]}</mark>);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function MessageBuilder({ sender: sender0, offers, admin, prefill, today, onClose, onCopied }: {
  sender: Sender; offers: MessageOffer[]; admin: boolean; prefill?: BuilderPrefill; today: string; onClose: () => void;
  /** After a copy: the discovery question it asked, so a profile can remember it. */
  onCopied?: (question: string | null) => void;
}) {
  const [input, setInput] = useState<MsgInput>(() => ({ ...EMPTY_INPUT, first: prefill?.first ?? "", who: prefill?.who ?? null, modelKey: prefill?.modelKey ?? null }));
  const [sender, setSender] = useState(sender0);
  const [tried, setTried] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const asked = useMemo(() => new Set(prefill?.asked ?? []), [prefill?.asked]);

  const up = (p: Partial<MsgInput>) => setInput((s) => ({ ...s, ...p }));
  // A different day has its own openings, endings and styles: start those again.
  const setDay = (day: Day) => up({ day, emailOpening: 0, emailEnding: 0, waStyle: "standard", waEnding: 0 });

  const m = msgModel(input.modelKey);
  const day = input.day ?? 1;
  const built = buildMessage(input, sender, offers, today);
  const miss = (k: MissingKey) => (tried ? built.missing.find((x) => x.key === k)?.text ?? null : null);
  const questions = m && input.who ? questionsFor(day, input.who, m) : [];
  const live = offersFor(offers, m?.key ?? null, input.who, today);
  const styles = waStyles(day, input.who, m);
  const style = styles.find((s) => s.id === input.waStyle) ?? styles[0];
  const styleAsks = input.channel !== "email" && !!style.ownQuestion;
  const vars = { first: input.first.trim() || "them", exec: firstWord(sender.name), model: m?.label ?? "model", van: !!m?.van };
  const choices = emailChoices(day, vars);
  const needDetails = !sender.landline.trim() || !sender.mobile.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = was; };
  }, [onClose]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  async function copy() {
    setTried(true);
    if (built.missing.length) {
      setToast(null);
      if (built.missing.some((x) => x.key === "landline" || x.key === "mobile")) setDetails(true);
      return;
    }
    const ok = input.channel === "email" && built.html ? await copyRich(built.html, built.text) : await copyPlain(built.text);
    if (!ok) { setToast("Your browser didn't allow the copy. Select the message and copy it instead."); return; }
    setToast(input.channel === "email" ? "Email copied. Paste it into Outlook, then copy the subject." : input.channel === "whatsapp" ? "Copied. Paste it into WhatsApp." : "Copied. Paste it into a text.");
    onCopied?.(built.asks);
  }
  async function copySubject() {
    setTried(true);
    if (!built.subject || built.missing.some((x) => x.key === "model")) return;
    if (await copyPlain(built.subject)) setToast("Subject copied");
  }

  const sms = input.channel === "text" ? smsParts(built.text) : null;
  const copyLabel = input.channel === "email" ? "Copy email" : input.channel === "whatsapp" ? "Copy WhatsApp" : "Copy text";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 backdrop-blur-[2px] sm:p-4 lg:p-6" role="dialog" aria-modal aria-label="Write a message"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-full max-w-[1200px] flex-col overflow-hidden bg-slate-50 shadow-2xl sm:rounded-2xl">
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-white"><Glyph name="chat" className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16.5px] font-semibold tracking-tight text-slate-900">{prefill?.customerName ? `Message ${prefill.customerName}` : "Write a message"}</h2>
            <p className="hidden truncate text-[12.5px] text-slate-600 sm:block">Read it through before you send it. The templates are a start, not a script.</p>
          </div>
          {admin && <Link href="/profiles/offers" className="hidden h-9 items-center rounded-xl px-3 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:flex">Edit offers</Link>}
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"><Icon name="x" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
          {/* ── What it says ── */}
          <div className="min-w-0 space-y-4 p-4 sm:p-6 lg:overflow-y-auto">
            <Step n={1} title="Which day?" done={!!input.day} error={miss("day")}>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as Day[]).map((d) => (
                  <button key={d} type="button" aria-pressed={input.day === d} onClick={() => setDay(d)}
                    className={`rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition ${input.day === d ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-900 ring-slate-300 hover:ring-slate-400"}`}>
                    <div className="text-[14.5px] font-semibold">{DAY_INFO[d].title}</div>
                    <div className={`text-[12px] leading-4 ${input.day === d ? "text-slate-300" : "text-slate-600"}`}>{DAY_INFO[d].aim}</div>
                  </button>
                ))}
              </div>
            </Step>

            <Step n={2} title="The customer" done={!!input.first.trim() && !!input.who} error={miss("first") ?? miss("who")}>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input value={input.first} onChange={(e) => up({ first: e.target.value })} placeholder="Their first name" aria-label="Customer's first name"
                  autoComplete="off" className={`${box} h-11 sm:flex-1 ${miss("first") ? badRing : okRing}`} />
                <Segment value={input.who} onChange={(who) => up({ who })} bad={!!miss("who")}
                  items={[{ key: "personal", label: "Personal" }, { key: "business", label: "Business" }]} />
              </div>
            </Step>

            <Step n={3} title="The model" done={!!m} error={miss("model")}>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_MODELS.map((k) => (
                  <Chip key={k} on={input.modelKey === k} onClick={() => up({ modelKey: k })}>{msgModel(k)!.label}</Chip>
                ))}
                <select value={m && !QUICK_MODELS.includes(m.key) ? m.key : ""} onChange={(e) => up({ modelKey: e.target.value || null })} aria-label="Another model"
                  className={`h-8 rounded-full border bg-white pl-3 pr-7 text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-900/10 ${m && !QUICK_MODELS.includes(m.key) ? "border-slate-900 bg-slate-900 text-white" : miss("model") ? "border-rose-400" : "border-slate-300"}`}>
                  <option value="">More models</option>
                  <optgroup label="Cars">{CARS.filter((x) => !QUICK_MODELS.includes(x.key)).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
                  <optgroup label="Vans">{VANS.filter((x) => !QUICK_MODELS.includes(x.key)).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
                </select>
              </div>
            </Step>

            {input.day === 1 && (
              <Step n={4} title="Did their enquiry ask us anything?" done={input.asked === "no" || (input.asked === "yes" && !!input.answer.trim())} error={miss("asked") ?? miss("answer")}>
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={input.asked === "no"} onClick={() => up({ asked: "no" })} bad={!!miss("asked")}>No question asked</Chip>
                  <Chip on={input.asked === "yes"} onClick={() => up({ asked: "yes" })} bad={!!miss("asked")}>Yes, I&apos;ll answer it</Chip>
                </div>
                {input.asked === "yes" && (
                  <textarea value={input.answer} onChange={(e) => up({ answer: e.target.value })} rows={3} autoFocus
                    placeholder="Your answer, as you'd say it. Only what you've checked: never guess stock, delivery or price."
                    className={`${box} mt-2.5 resize-y py-2.5 leading-[22px] ${miss("answer") ? badRing : okRing}`} />
                )}
              </Step>
            )}

            <Step n={input.day === 1 ? 5 : 4} title="The discovery question" done={styleAsks || !!built.asks}
              hint={styleAsks ? "This WhatsApp asks its own, so a question here is only for the email." : "One main question, one they can answer quickly. Not one you've asked before."}
              error={miss("question")}>
              {!m || !input.who ? (
                <p className="text-[13.5px] text-slate-600">Pick personal or business and the model, and the questions for it show here.</p>
              ) : (
                <QuestionPicker key={`${day}-${input.who}-${m.key}`} questions={questions} asked={asked} value={input.useOwn ? null : input.question} useOwn={input.useOwn} own={input.own}
                  bad={!!miss("question")} onPick={(q) => up({ question: q, useOwn: false })} onOwn={(own) => up({ useOwn: true, own })} />
              )}
            </Step>

            {live.length > 0 && m && (
              <Step n={input.day === 1 ? 6 : 5} title={`There's an offer on the ${m.label}`} done={!!input.offerId && (input.offerId === "none" || live.some((o) => o.id === input.offerId))}
                hint="Only mention it if it's right for what they enquired on." error={miss("offer")}>
                <div className="space-y-2">
                  {live.map((o) => (
                    <Radio key={o.id} on={input.offerId === o.id} onClick={() => up({ offerId: o.id })} bad={!!miss("offer")}>
                      <div className="text-[14px] font-semibold text-slate-900">{o.title}</div>
                      <div className="mt-0.5 text-[13px] leading-5 text-slate-700">{offerLine(o, day, m.label)}</div>
                      {o.details.trim() && <div className="mt-1.5 whitespace-pre-line rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12.5px] leading-5 text-slate-600"><span className="font-semibold text-slate-700">For you, not them: </span>{o.details}</div>}
                      {o.validUntil && <div className="mt-1 text-[12.5px] text-slate-600">{`Runs until ${o.validUntil.split("-").reverse().join("/")}`}</div>}
                    </Radio>
                  ))}
                  <Radio on={input.offerId === "none"} onClick={() => up({ offerId: "none" })} bad={!!miss("offer")}>
                    <div className="text-[14px] font-medium text-slate-900">Don&apos;t mention an offer</div>
                  </Radio>
                </div>
              </Step>
            )}

            <Step title="Anything else to say?" optional>
              <textarea value={input.extra} onChange={(e) => up({ extra: e.target.value })} rows={2}
                placeholder="Optional. Something useful and true: stock you've checked, a delivery date you've confirmed."
                className={`${box} resize-y py-2.5 leading-[22px] ${okRing}`} />
              {input.who === "business" && day !== 1 && (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-5 text-slate-700">
                  <input type="checkbox" checked={input.fleet} onChange={(e) => up({ fleet: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-400 accent-slate-900" />
                  <span><span className="font-medium text-slate-900">Ask about the rest of their fleet.</span> Only if they&apos;ve said they run a few.</span>
                </label>
              )}
            </Step>
          </div>

          {/* ── How it reads ── */}
          <div className="flex min-h-0 min-w-0 flex-col border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
              <div role="tablist" aria-label="Send as" className="inline-flex gap-1 rounded-xl bg-slate-200/60 p-1">
                {CHANNELS.map((c) => (
                  <button key={c.key} type="button" role="tab" aria-selected={input.channel === c.key} onClick={() => up({ channel: c.key })}
                    className={`h-8 rounded-lg px-3.5 text-[13.5px] font-medium transition ${input.channel === c.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{c.label}</button>
                ))}
              </div>
              <button type="button" onClick={() => setDetails((d) => !d)}
                className={`ml-auto flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition ${needDetails ? "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                <Icon name="person" className="h-3.5 w-3.5" />{needDetails ? "Add your numbers" : "Your details"}
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 px-4 py-4 sm:px-6 lg:overflow-y-auto">
              {details && <Details sender={sender} onSaved={(s) => { setSender(s); setDetails(false); setToast("Your details are saved for every message"); }} onClose={() => setDetails(false)}
                bad={{ landline: !!miss("landline"), mobile: !!miss("mobile") }} />}

              {/* What it looks like: the dropdowns. */}
              <div className="grid gap-2.5 sm:grid-cols-2">
                {input.channel === "email" ? (
                  <>
                    <Select label="Opening" value={input.emailOpening} onChange={(i) => up({ emailOpening: i })}
                      options={choices.openings.map((o) => (o.note ? `${o.text} (${o.note})` : o.text))} />
                    <Select label="Ending" value={input.emailEnding} onChange={(i) => up({ emailEnding: i })} options={choices.endings} />
                  </>
                ) : (
                  <>
                    <Select label="Style" value={Math.max(0, styles.indexOf(style))} onChange={(i) => up({ waStyle: styles[i].id, waEnding: 0 })}
                      options={styles.map((s) => (s.hint ? `${s.label} (${s.hint.toLowerCase()})` : s.label))} />
                    {style.endings && style.endings.length > 1 && (
                      <Select label="Ending" value={input.waEnding} onChange={(i) => up({ waEnding: i })} options={style.endings.map((e) => e.replaceAll("{exec}", vars.exec))} />
                    )}
                  </>
                )}
              </div>

              {/* The message. */}
              {input.channel === "email" ? (
                <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                    <span className="text-[12.5px] font-medium text-slate-600">Subject</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-900"><WithGaps text={built.subject ?? ""} /></span>
                    <button type="button" onClick={() => void copySubject()} className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-white">
                      <Icon name="copy" className="h-3.5 w-3.5" />Copy
                    </button>
                  </div>
                  <div className="space-y-3 px-4 py-4 font-[Aptos,Calibri,Arial,sans-serif] text-[14.5px] leading-6 text-slate-900">
                    {built.paras.map((p, i) => <p key={i}><WithGaps text={p} /></p>)}
                    <p className="leading-[1.45]">
                      {built.signature?.map((l, i) => <span key={i} className={`block ${i === 0 ? "font-semibold" : ""}`}><WithGaps text={l} /></span>)}
                    </p>
                    <span className={`inline-flex h-9 items-center rounded-md px-4 text-[14px] font-bold text-white ${built.waHref ? "bg-[#075E54]" : "bg-slate-400"}`}>
                      Message me on WhatsApp
                    </span>
                    {!built.waHref && <p className="text-[12.5px] text-amber-800">The button needs your mobile.</p>}
                  </div>
                </div>
              ) : (
                <div className={`rounded-2xl p-3 sm:p-4 ${input.channel === "whatsapp" ? "bg-[#ECE5DD]" : "bg-slate-100"}`}>
                  <div className={`ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tr-md px-3.5 py-2.5 text-[14.5px] leading-[21px] text-slate-900 shadow-sm ${input.channel === "whatsapp" ? "bg-[#DCF8C6]" : "bg-white"}`}>
                    {built.paras.map((p, i) => <span key={i} className="block [&:not(:first-child)]:mt-[21px]"><WithGaps text={p} /></span>)}
                  </div>
                  {sms && (
                    <p className="mt-2 text-right text-[12.5px] text-slate-600">
                      {`${sms.chars} characters, ${sms.parts === 1 ? "one text" : `sends as ${sms.parts} texts`}`}{!sms.plain && ", because of a special character"}
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
        {/* Copy, always in reach: under both halves, outside the scrolling, so a phone never loses it. */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {tried && built.missing.length > 0 ? (
              <div role="alert" className="max-h-28 min-w-0 flex-1 overflow-y-auto rounded-xl bg-rose-50 px-3.5 py-2 text-[13px] leading-5 text-rose-900 ring-1 ring-inset ring-rose-200">
                <span className="font-semibold">Before you can copy it: </span>
                {built.missing.map((x, i) => <span key={x.key}>{i ? "; " : ""}{i ? x.text.charAt(0).toLowerCase() + x.text.slice(1) : x.text}</span>)}.
              </div>
            ) : (
              <span className="hidden flex-1 text-[12.5px] text-slate-600 lg:block">
                {built.missing.length ? `${built.missing.length} thing${built.missing.length === 1 ? "" : "s"} to fill in` : "Ready. Read it through, then copy."}
              </span>
            )}
            <button type="button" onClick={() => void copy()}
              className={`flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-[14px] font-semibold text-white shadow-sm transition ${built.missing.length ? "bg-slate-500 hover:bg-slate-600" : "bg-slate-900 hover:bg-slate-800"}`}>
              <Icon name="copy" />{copyLabel}
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[14px] text-white shadow-xl">
            <Icon name="check" className="h-4 w-4 text-emerald-400" />{toast}
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, hint, done, error, optional, children }: {
  n?: number; title: string; hint?: string; done?: boolean; error?: string | null; optional?: boolean; children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)] sm:p-5 ${error ? "!shadow-[0_0_0_1.5px_rgba(225,29,72,0.55)]" : ""}`}>
      <div className="mb-3 flex items-start gap-2.5">
        {optional ? (
          <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><Icon name="plus" className="h-3.5 w-3.5" /></span>
        ) : (
          <span className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${done ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-300"}`}>
            {done ? <Icon name="check" className="h-3.5 w-3.5" /> : n}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-6 text-slate-900">{title}</h3>
          {hint && <p className="text-[12.5px] leading-5 text-slate-600">{hint}</p>}
        </div>
      </div>
      {children}
      {error && <p className="mt-2 text-[13px] font-medium text-rose-700">{error}</p>}
    </section>
  );
}

function Chip({ on, onClick, bad, children }: { on: boolean; onClick: () => void; bad?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`h-8 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition ${on ? "bg-slate-900 text-white shadow-sm" : `bg-white text-slate-700 ring-1 ring-inset hover:bg-slate-50 ${bad ? "ring-rose-400" : "ring-slate-300 hover:ring-slate-400"}`}`}>
      {children}
    </button>
  );
}

function Segment<T extends string>({ items, value, onChange, bad }: { items: { key: T; label: string }[]; value: T | null; onChange: (k: T) => void; bad?: boolean }) {
  return (
    <div role="radiogroup" className={`inline-flex h-11 shrink-0 gap-1 rounded-xl bg-slate-200/60 p-1 ${bad ? "ring-1 ring-rose-400" : ""}`}>
      {items.map((it) => (
        <button key={it.key} type="button" role="radio" aria-checked={value === it.key} onClick={() => onChange(it.key)}
          className={`flex-1 rounded-lg px-4 text-[14px] font-medium transition ${value === it.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{it.label}</button>
      ))}
    </div>
  );
}

function Radio({ on, onClick, bad, children }: { on: boolean; onClick: () => void; bad?: boolean; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left ring-1 ring-inset transition ${on ? "bg-slate-50 ring-2 ring-slate-900" : bad ? "bg-white ring-rose-300 hover:ring-rose-400" : "bg-white ring-slate-200 hover:ring-slate-400"}`}>
      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1 ring-inset ${on ? "bg-slate-900 ring-slate-900" : "bg-white ring-slate-400"}`}>
        {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: number; options: string[]; onChange: (i: number) => void }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12.5px] font-medium text-slate-700">{label}</span>
      <select value={Math.min(value, options.length - 1)} onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-full truncate rounded-xl border border-slate-300 bg-white pl-3 pr-8 text-[13.5px] text-slate-900 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10">
        {options.map((o, i) => <option key={i} value={i}>{i === 0 && !/^standard$/i.test(o) ? `${o} (standard)` : o}</option>)}
      </select>
    </label>
  );
}

/** The guide's questions for this day and model: its suggestion first, then What, Why and When, and room for their own. */
function QuestionPicker({ questions, asked, value, useOwn, own, bad, onPick, onOwn }: {
  questions: { angle: Angle; text: string; suggested: boolean }[]; asked: Set<string>; value: string | null; useOwn: boolean; own: string; bad: boolean;
  onPick: (q: string) => void; onOwn: (q: string) => void;
}) {
  const suggested = questions.find((q) => q.suggested);
  const startAngle = questions.find((q) => q.text === value)?.angle ?? suggested?.angle ?? "what";
  const [angle, setAngle] = useState<Angle | "own">(useOwn ? "own" : startAngle);
  const row = (q: { text: string; suggested: boolean }) => (
    <Radio key={q.text} on={!useOwn && value === q.text} onClick={() => onPick(q.text)} bad={bad}>
      <span className="block text-[14px] leading-5 text-slate-900">{q.text}</span>
      {(q.suggested || asked.has(q.text)) && (
        <span className="mt-1 flex flex-wrap gap-1.5">
          {q.suggested && <span className="rounded-full bg-emerald-50 px-2 py-px text-[11.5px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">Suggested</span>}
          {asked.has(q.text) && <span className="rounded-full bg-amber-50 px-2 py-px text-[11.5px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">Asked them before</span>}
        </span>
      )}
    </Radio>
  );
  return (
    <div>
      <div role="tablist" aria-label="Kind of question" className="mb-2.5 inline-flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {[...ANGLES, "own" as const].map((a) => (
          <button key={a} type="button" role="tab" aria-selected={angle === a} onClick={() => setAngle(a)}
            className={`h-8 rounded-lg px-3 text-[13px] font-medium transition ${angle === a ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
            {a === "own" ? "My own" : ANGLE_LABEL[a]}
            {a !== "own" && questions.some((q) => q.angle === a && !useOwn && q.text === value) && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 align-middle" />}
          </button>
        ))}
      </div>
      {angle === "own" ? (
        <input value={own} onChange={(e) => onOwn(e.target.value)} autoFocus placeholder="Type the question you want to ask"
          className={`${box} h-11 ${bad ? badRing : okRing}`} />
      ) : (
        <div className="space-y-2">{questions.filter((q) => q.angle === angle).map(row)}</div>
      )}
    </div>
  );
}

/** The exec's landline, mobile and signing email: added once, used in every message. */
function Details({ sender, onSaved, onClose, bad }: { sender: Sender; onSaved: (s: Sender) => void; onClose: () => void; bad: { landline: boolean; mobile: boolean } }) {
  const [landline, setLandline] = useState(sender.landline);
  const [mobile, setMobile] = useState(sender.mobile);
  const [email, setEmail] = useState(sender.email);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await saveMyDetailsAction({ landline, mobile, email }).catch(() => ({ ok: false as const, errors: { form: "Couldn't save your details. Please try again." } }));
    setBusy(false);
    if (r.ok) onSaved(r.sender);
    else setErrors(r.errors);
  }
  const field = (label: string, value: string, set: (v: string) => void, key: string, placeholder: string, type = "tel") => (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12.5px] font-medium text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
        className={`${box} h-10 ${errors[key] || (bad as Record<string, boolean>)[key] ? badRing : okRing}`} />
      {errors[key] && <span className="mt-1 block text-[12.5px] text-rose-700">{errors[key]}</span>}
    </label>
  );
  return (
    <div className="rounded-xl bg-amber-50/60 p-3.5 ring-1 ring-inset ring-amber-200">
      <div className="mb-2.5 flex items-center gap-2">
        <h4 className="flex-1 text-[14px] font-semibold text-slate-900">{`Your details, ${firstWord(sender.name)}`}</h4>
        <button type="button" onClick={onClose} aria-label="Close your details" className="grid h-7 w-7 place-items-center rounded-lg text-slate-600 hover:bg-white"><Icon name="x" className="h-3.5 w-3.5" /></button>
      </div>
      <p className="mb-3 text-[12.5px] leading-5 text-slate-700">They go at the bottom of every email, and your mobile is the WhatsApp button. Saved once, for every message.</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {field("Landline", landline, setLandline, "landline", "e.g. 0113 496 0000")}
        {field("Mobile", mobile, setMobile, "mobile", "e.g. 07700 900123")}
        <div className="sm:col-span-2">{field("Email it's signed with", email, setEmail, "email", "you@trustford.co.uk", "email")}</div>
      </div>
      {errors.form && <p className="mt-2 text-[12.5px] text-rose-700">{errors.form}</p>}
      <button type="button" onClick={() => void save()} disabled={busy}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400">
        {busy ? "Saving" : "Save my details"}
      </button>
    </div>
  );
}
