// Messages (user, 2026-11-06): the Day 1, 2 and 3 email, WhatsApp and text
// for an unanswered enquiry, built from a few taps. Taken from the TrustFord
// Leasing "Day 2 & Day 3 unanswered enquiry follow up process" and its bespoke
// offer add-on. The exec picks the day, types the customer's first name, picks
// personal or business, the model, a discovery question and the offer, and
// copies. Nothing copies until everything the message needs is in.
//
// The wording itself is in message-config.ts, which admins can change at
// /profiles/templates. Everything here takes that config, and uses the
// standard wording when it isn't given.
//
// Day 1's own guide didn't come through with the others, so Day 1 is written
// from what the Day 2 and Day 3 guide says Day 1 does (thank them, answer their
// question, ask one WHAT, WHY or WHEN question) and its Day 1 examples.
//
// Pure and client-safe. The builder, the admin pages and the tests read from here.

import {
  ANGLES, DAYS, DEFAULT_CONFIG, MODEL_BASE, T, hasToken, putToken, tokenRe,
  type Angle, type Day, type Fits, type MessageConfig, type QSetKey, type WaStyleCfg, type Who,
} from "./message-config";
import { WHATSAPP_TILE } from "./whatsapp-icon";

export { ANGLES, ANGLE_LABEL, DAYS, DEFAULT_CONFIG } from "./message-config";
export type { Angle, Day, MessageConfig, Who } from "./message-config";
export type Channel = "email" | "whatsapp" | "text";

// ─── Models ──────────────────────────────────────────────────────────────

export interface MsgModel {
  key: string;
  /** As it reads in the message: "the Transit Custom". */
  label: string;
  van: boolean;
  /** Electric or plug-in: gets the questions marked electric only. */
  electric: boolean;
  /** Whose questions it gets (a business car always gets the business car ones). */
  set: QSetKey;
}

/** The model as this config has it: its name, its questions, whether it plugs in. */
export function msgModel(key: string | null | undefined, cfg: MessageConfig = DEFAULT_CONFIG): MsgModel | null {
  const base = key ? MODEL_BASE.find((m) => m.key === key) : undefined;
  if (!base) return null;
  const c = cfg.models[base.key] ?? DEFAULT_CONFIG.models[base.key];
  return { key: base.key, van: base.van, label: c.label, electric: c.electric, set: c.set };
}
/** Every model, cars then vans, with the standard names. */
export const MSG_MODELS: MsgModel[] = MODEL_BASE.map((m) => msgModel(m.key)!);
/** The quick picks above the full list. */
export const QUICK_MODELS = ["puma", "kuga", "explorer", "capri", "transit-custom", "ranger"];

/** The message model for whatever was typed on the profile: "Kuga PHEV" is the Kuga, "Ranger Raptor" the Ranger. */
export function msgModelFor(text: string, cfg: MessageConfig = DEFAULT_CONFIG): MsgModel | null {
  const t = text.toLowerCase().replace(/^\s*ford\s+/, "");
  const rules: [RegExp, string][] = [
    [/e-?transit\s+custom|e-?custom/, "e-transit-custom"],
    [/e-?transit\s+courier/, "e-transit-courier"],
    [/transit\s+city/, "transit-city"],
    [/explorer\s+van/, "explorer-van"],
    [/e-?transit/, "e-transit"],
    [/tourneo\s+custom/, "tourneo-custom"],
    [/tourneo\s+connect/, "tourneo-connect"],
    [/tourneo\s+courier/, "tourneo-courier"],
    [/transit\s+custom|\bcustom\b/, "transit-custom"],
    [/transit\s+connect|\bconnect\b/, "transit-connect"],
    [/transit\s+courier|\bcourier\b/, "transit-courier"],
    [/\btransit\b/, "transit"],
    [/\branger\b|\braptor\b/, "ranger"],
    [/mach-?\s?e/, "mach-e"],
    [/puma\s+gen-?\s?e/, "puma-gen-e"],
    [/\bpuma\b/, "puma"],
    [/\bkuga\b/, "kuga"],
    [/\bexplorer\b/, "explorer"],
    [/\bcapri\b/, "capri"],
    [/\bmustang\b/, "mustang"],
    [/\bbronco\b/, "bronco"],
    [/\bfocus\b/, "focus"],
  ];
  const hit = rules.find(([re]) => re.test(t));
  return hit ? msgModel(hit[1], cfg) : null;
}

// ─── Filling in ──────────────────────────────────────────────────────────

export interface Vars { first: string; exec: string; model: string; van: boolean }
/** Fills in the customer, the exec, the model and car or van. */
export const fillVars = (s: string, v: Vars) =>
  [[T.first, v.first], [T.exec, v.exec], [T.model, v.model], [T.vehicle, v.van ? "van" : "car"]].reduce((t, [k, val]) => putToken(t, k, val), s);

/** Blank lines split paragraphs. */
const parasOf = (s: string) => s.split(/\n[ \t]*\n/).map((x) => x.trim()).filter(Boolean);

const SLOTS = [T.opening, T.extras, T.question, T.fleet, T.ending];
const SLOT_RE = new RegExp(SLOTS.map((s) => tokenRe(s).source).join("|"), "gi");

/**
 * A layout, filled in: the placeholders, then each slot ([Opening], [Question]
 * and the rest) swapped for its paragraphs in one pass, so nothing typed into
 * a slot is read as a placeholder. An empty slot leaves nothing behind.
 */
function layout(template: string, v: Vars, slots: Partial<Record<string, string[]>>): string[] {
  const filled = fillVars(template, v).replace(SLOT_RE, (tok) => {
    const name = SLOTS.find((s) => tokenRe(s).test(tok))!;
    return `\n\n${(slots[name] ?? []).join("\n\n")}\n\n`;
  });
  return parasOf(filled);
}

// ─── Discovery questions ─────────────────────────────────────────────────

export interface QuestionOption { angle: Angle; text: string; suggested: boolean }

/** Business cars share one list (the guide: "across Puma, Kuga, Explorer and Capri"); everything else has its own. */
const setFor = (who: Who, m: MsgModel): QSetKey => (who === "business" && !m.van ? "bizcar" : m.set);

const stem = (s: string) => s.toLowerCase().replace(/[?.!]+$/, "").trim();

/**
 * The questions for this day, model and customer, What then Why then When,
 * with the suggested one marked. Where the suggestion is a fuller version of
 * a listed question it takes that question's place.
 */
export function questionsFor(day: Day, who: Who, m: MsgModel, cfg: MessageConfig = DEFAULT_CONFIG): QuestionOption[] {
  const s = cfg.questions[setFor(who, m)];
  const bank = day === 3 ? s.late : s.early;
  const sug = s.suggested[day];
  const fill = (t: string) => putToken(putToken(t, T.model, m.label), T.vehicle, m.van ? "van" : "car").trim();
  const out: QuestionOption[] = [];
  const seen = new Set<string>();
  for (const angle of ANGLES) {
    const list: QuestionOption[] = bank[angle]
      .filter((q) => q.text.trim() && (!q.electricOnly || m.electric))
      .map((q) => ({ angle, text: fill(q.text), suggested: false }));
    if (angle === sug.angle && sug.text.trim()) {
      const st = fill(sug.text);
      const at = list.findIndex((q) => stem(st).startsWith(stem(q.text)));
      if (at >= 0) list[at] = { angle, text: st, suggested: true };
      else list.unshift({ angle, text: st, suggested: true });
    }
    for (const q of list) if (!seen.has(q.text)) { seen.add(q.text); out.push(q); }
  }
  return out;
}

/** Offered for a business: the wider fleet question. Day 2 and Day 3 only. */
export function fleetLine(day: Day, m: MsgModel, cfg: MessageConfig = DEFAULT_CONFIG): string | null {
  if (day === 1) return null;
  const t = putToken(putToken(cfg.fleet[day], T.model, m.label), T.vehicle, m.van ? "van" : "car").trim();
  return t || null;
}

// ─── How the messages read ───────────────────────────────────────────────

/**
 * Each choice as the dropdown shows it: the paragraph several choices open
 * with ("It's Freddy from TrustFord Leasing again.") or close with (the "Feel
 * free to reply" line) is left off, so what makes each one different shows.
 */
function distinctive(texts: string[]): string[] {
  const paras = texts.map(parasOf);
  const count = (pick: (ps: string[]) => string) => {
    const m = new Map<string, number>();
    for (const ps of paras) if (ps.length > 1) m.set(pick(ps), (m.get(pick(ps)) ?? 0) + 1);
    return m;
  };
  const firsts = count((ps) => ps[0]);
  const lasts = count((ps) => ps[ps.length - 1]);
  return paras.map((ps) => {
    let out = ps;
    if (out.length > 1 && (firsts.get(out[0]) ?? 0) >= 2) out = out.slice(1);
    if (out.length > 1 && (lasts.get(out[out.length - 1]) ?? 0) >= 2) out = out.slice(0, -1);
    return out.join(" ");
  });
}

/** The email openings and endings to choose from, as they'll read. */
export function emailChoices(day: Day, v: Vars, cfg: MessageConfig = DEFAULT_CONFIG) {
  const d = cfg.email[day];
  const openings = distinctive(d.openings.map((o) => o.text));
  return {
    openings: d.openings.map((o, i) => ({ text: fillVars(openings[i], v), note: o.note ?? null })),
    endings: distinctive(d.endings.map((e) => e.text)).map((t) => fillVars(t, v)),
  };
}

export interface WaStyle extends WaStyleCfg {
  /** The style asks its own question (it has no [Question]), so no discovery question is needed. */
  ownQuestion: boolean;
}

const fits = (f: Fits, who: Who | null, m: MsgModel | null) =>
  f === "all" || (!!who && !!m && (f === "personal" ? who === "personal" : f === "business-car" ? who === "business" && !m.van : m.van));

/** The WhatsApp styles that suit this customer. */
export function waStyles(day: Day, who: Who | null, m: MsgModel | null, cfg: MessageConfig = DEFAULT_CONFIG): WaStyle[] {
  return cfg.whatsapp[day].filter((s) => fits(s.fits, who, m)).map((s) => ({ ...s, ownQuestion: !hasToken(s.text, T.question) }));
}

// ─── Offers ──────────────────────────────────────────────────────────────

export interface MessageOffer {
  id: string;
  /** What the exec sees when choosing it: "Transit Custom Trail at £299 + VAT". */
  title: string;
  models: string[];
  who: "personal" | "business" | "both";
  /** What makes it special, as a sentence the customer reads: "[Offer]". */
  offer: string;
  /** For the team only: rental, term, mileage, stock, delivery. Never in a message. */
  details: string;
  /** YYYY-MM-DD, the last day. Hidden from the messages after it. */
  validUntil: string | null;
  /** Each day's line; blank is the standard one. */
  day1: string;
  day2: string;
  day3: string;
  active: boolean;
  updatedAt: number;
  updatedBy: string;
}

/** The standard line an offer uses on this day, before it's filled in. */
export const standardOfferLine = (day: Day, dated: boolean, cfg: MessageConfig = DEFAULT_CONFIG) => (day === 3 && dated ? cfg.offers.dated3 : cfg.offers[day]);

export const isLiveOffer = (o: MessageOffer, today: string) => o.active && (!o.validUntil || o.validUntil >= today);

/** The live offers on this model for this customer. */
export function offersFor(offers: MessageOffer[], modelKey: string | null, who: Who | null, today: string): MessageOffer[] {
  if (!modelKey || !who) return [];
  return offers.filter((o) => isLiveOffer(o, today) && o.models.includes(modelKey) && (o.who === "both" || o.who === who));
}

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "Friday 28 November", as a customer reads it. */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return `${LONG_DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]} ${d} ${LONG_MONTHS[mo - 1]}`;
}

const sentence = (s: string) => { const t = s.trim(); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };

/** The offer as it reads on this day. */
export function offerLine(o: MessageOffer, day: Day, modelLabel: string, cfg: MessageConfig = DEFAULT_CONFIG): string {
  const own = (day === 1 ? o.day1 : day === 2 ? o.day2 : o.day3).trim();
  const tpl = own || standardOfferLine(day, !!o.validUntil, cfg);
  return putToken(putToken(putToken(tpl, T.model, modelLabel), T.offer, sentence(o.offer)), T.until, o.validUntil ? longDate(o.validUntil) : "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Anything wrong with an offer before it's saved. */
export function offerProblems(o: Pick<MessageOffer, "title" | "models" | "offer" | "validUntil" | "day1" | "day2" | "day3">): string[] {
  const out: string[] = [];
  if (!o.title.trim()) out.push("Give it a name the team will recognise.");
  if (!o.models.length) out.push("Pick the model or models it's on.");
  if (!o.offer.trim()) out.push("Say what makes it special.");
  if (o.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(o.validUntil)) out.push("The end date isn't a date.");
  for (const [i, line] of [o.day1, o.day2, o.day3].entries()) {
    if (hasToken(line, T.until) && !o.validUntil) out.push(`Day ${i + 1} uses [Valid until], so it needs an end date.`);
    const unknown = (line.match(/\[[^\]]*\]/g) ?? []).filter((t) => !/^\[\s*(model|offer|valid\s+until)\s*\]$/i.test(t));
    if (unknown.length) out.push(`Day ${i + 1} has ${unknown.join(", ")}, which isn't something it can fill in. Use [Model], [Offer] or [Valid until].`);
  }
  return out;
}

// ─── The exec ────────────────────────────────────────────────────────────

export interface Sender { name: string; email: string; landline: string; mobile: string }

/** A UK number in its national form, digits only: "+44 7700 900123" is "07700900123". */
export function ukNational(s: string): string {
  const d = s.replace(/[^\d+]/g, "");
  if (d.startsWith("+44")) return `0${d.slice(3).replace(/^0/, "")}`;
  if (d.startsWith("0044")) return `0${d.slice(4).replace(/^0/, "")}`;
  return d.replace(/\+/g, "");
}
export const isUkMobile = (s: string) => /^07\d{9}$/.test(ukNational(s));
export const isUkPhone = (s: string) => /^0\d{9,10}$/.test(ukNational(s));

/** The wa.me link that opens a chat with the exec, with the customer's first line written for them. */
export function waLink(mobile: string, prefill?: string): string | null {
  if (!isUkMobile(mobile)) return null;
  const n = `44${ukNational(mobile).slice(1)}`;
  return `https://wa.me/${n}${prefill ? `?text=${encodeURIComponent(prefill)}` : ""}`;
}

export const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? "";

/**
 * The customer's first name from the profile's name, when it reads like a
 * person's: "sarah jones" is "Sarah", "Mr Smith" stays "Mr Smith". A company
 * name gives nothing, so the exec types the contact's own.
 */
export function firstNameGuess(customerName: string): string {
  const s = customerName.trim().replace(/\s+/g, " ");
  if (!s || s.split(" ").length > 4) return "";
  if (/\b(ltd|limited|plc|llp|llc|inc|services|group|solutions|contractors|electrical|plumbing|heating|building|builders|construction|trading|transport|logistics|garage|motors|properties|property|company|co|uk|and sons)\b|&|\d/i.test(s)) return "";
  const cap = (w: string) => (w === w.toUpperCase() || w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w[0].toUpperCase() + w.slice(1));
  const words = s.split(" ");
  if (/^(mr|mrs|ms|miss|dr|mx)\.?$/i.test(words[0])) return words.length > 1 ? `${cap(words[0].replace(".", ""))} ${cap(words[words.length - 1])}` : "";
  return cap(words[0]);
}

// ─── Building the message ────────────────────────────────────────────────

export interface MsgInput {
  day: Day | null;
  channel: Channel;
  first: string;
  who: Who | null;
  modelKey: string | null;
  /** Day 1: did their enquiry ask us something? */
  asked: "yes" | "no" | null;
  answer: string;
  /** The question picked from the list, or null. */
  question: string | null;
  /** Their own question instead of one from the list. */
  useOwn: boolean;
  own: string;
  /** An offer's id, "none", or not chosen yet (null). */
  offerId: string | null;
  extra: string;
  fleet: boolean;
  emailOpening: number;
  emailEnding: number;
  waStyle: string;
  waEnding: number;
}

export const EMPTY_INPUT: MsgInput = {
  day: null, channel: "email", first: "", who: null, modelKey: null, asked: null, answer: "", question: null, useOwn: false, own: "",
  offerId: null, extra: "", fleet: false, emailOpening: 0, emailEnding: 0, waStyle: "standard", waEnding: 0,
};

export type MissingKey = "day" | "first" | "who" | "model" | "asked" | "answer" | "question" | "offer" | "landline" | "mobile";
export interface Missing { key: MissingKey; text: string }

export interface Built {
  /** Email only. */
  subject: string | null;
  /** Paragraphs as they'll read. A missing piece shows as ⟦first name⟧ until it's filled in. */
  paras: string[];
  /** Email only: the signature, as plain lines. */
  signature: string[] | null;
  /** What goes on the clipboard: plain text for every channel, and HTML for an email. */
  text: string;
  html: string | null;
  waHref: string | null;
  missing: Missing[];
  /** The discovery question it asks, if one was picked. */
  asks: string | null;
  /** Whether this message has a discovery question at all (its layout has [Question]). */
  needsQuestion: boolean;
}

/** A missing piece in the preview. Never copied: nothing copies while anything's missing. */
export const gap = (label: string) => `⟦${label}⟧`;
export const GAP_RE = /⟦([^⟧]+)⟧/g;

const ownQuestionText = (s: string) => { const t = s.trim(); return t && !/[?.!]$/.test(t) ? `${t}?` : t; };

export function buildMessage(input: MsgInput, sender: Sender, offers: MessageOffer[], today: string, cfg: MessageConfig = DEFAULT_CONFIG): Built {
  const m = msgModel(input.modelKey, cfg);
  const day = input.day ?? 1;
  const missing: Missing[] = [];
  const need = (key: MissingKey, text: string) => missing.push({ key, text });

  if (!input.day) need("day", `Pick ${DAYS.map((d) => cfg.days[d].title).join(", ").replace(/, ([^,]*)$/, " or $1")}`);
  if (!input.first.trim()) need("first", "Add the customer's first name");
  if (!input.who) need("who", "Choose personal or business");
  if (!m) need("model", "Choose the model");

  const styles = waStyles(day, input.who, m, cfg);
  const style = styles.find((s) => s.id === input.waStyle) ?? styles[0] ?? waStyles(day, null, null, DEFAULT_CONFIG)[0];
  const isWa = input.channel !== "email";
  const email = cfg.email[day];
  const needsQuestion = hasToken(isWa ? style.text : email.template, T.question);

  // The discovery question.
  const options = m && input.who ? questionsFor(day, input.who, m, cfg) : [];
  let question: string | null = null;
  if (needsQuestion) {
    if (input.useOwn) {
      question = ownQuestionText(input.own) || null;
      if (!question) need("question", "Type your question");
    } else {
      question = input.question && options.some((q) => q.text === input.question) ? input.question : null;
      if (!question) need("question", "Pick a question to ask");
    }
  }

  // Day 1: answer anything they asked. Only once Day 1 is picked.
  let answer: string | null = null;
  if (input.day === 1) {
    if (!input.asked) need("asked", "Say whether they asked us a question");
    else if (input.asked === "yes") {
      answer = input.answer.trim() || null;
      if (!answer) need("answer", "Type your answer to their question");
    }
  }

  // The offer, when the model has one: a decision every time, never assumed.
  const live = offersFor(offers, m?.key ?? null, input.who, today);
  const offer = live.find((o) => o.id === input.offerId) ?? null;
  if (live.length && !offer && input.offerId !== "none") need("offer", live.length === 1 ? "Choose whether to mention the offer" : "Choose which offer to mention, or none");

  const first = input.first.trim().replace(/\s+/g, " ") || gap("first name");
  const execFirst = firstWord(sender.name) || gap("your name");
  const v: Vars = { first, exec: execFirst, model: m?.label ?? gap("model"), van: !!m?.van };
  const fill = (s: string) => fillVars(s, v);

  const extras = [offer && m ? offerLine(offer, day, m.label, cfg) : null, answer, input.extra.trim() || null].filter((x): x is string => !!x);
  const fleet = input.fleet && input.who === "business" && m ? fleetLine(day, m, cfg) : null;
  // A question from the list is the config's own words, so it's filled in; one they typed is left as typed.
  const q = question ? (input.useOwn ? question : fill(question)) : needsQuestion ? gap("discovery question") : null;
  const slots = { [T.extras]: extras, [T.question]: q ? [q] : [], [T.fleet]: fleet ? [fleet] : [] };

  if (input.channel === "email") {
    const opening = email.openings[Math.min(input.emailOpening, email.openings.length - 1)]?.text ?? "";
    const ending = email.endings[Math.min(input.emailEnding, email.endings.length - 1)]?.text ?? "";
    if (!sender.landline.trim() || !isUkPhone(sender.landline)) need("landline", "Add your landline under Your details");
    if (!sender.mobile.trim() || !isUkMobile(sender.mobile)) need("mobile", "Add your mobile under Your details");
    const paras = layout(email.template, v, { ...slots, [T.opening]: parasOf(fill(opening)), [T.ending]: parasOf(fill(ending)) });
    const waHref = waLink(sender.mobile, `Hi ${execFirst}, it's ${first} about the ${v.model}.`);
    const signature = [
      sender.name.trim() || gap("your name"),
      "TrustFord Leasing",
      `Tel: ${sender.landline.trim() || gap("landline")}`,
      `Mobile: ${sender.mobile.trim() || gap("mobile")}`,
      `Email: ${sender.email}`,
    ];
    const subject = fill(email.subject).trim();
    const text = [...paras, signature.join("\n"), waHref ? `Message me on WhatsApp: ${waHref}` : ""].filter(Boolean).join("\n\n");
    return { subject, paras, signature, text, html: emailHtml(paras, signature, waHref), waHref, missing, asks: question, needsQuestion };
  }

  // WhatsApp, or a text: the same message, a text without the emoji.
  const endings = style.endings.filter((e) => e.trim());
  const ending = endings.length ? endings[Math.min(input.waEnding, endings.length - 1)] : null;
  const paras = layout(style.text, v, { ...slots, [T.ending]: ending ? parasOf(fill(ending)) : [] });
  const shown = input.channel === "text" ? paras.map((p) => p.split("\n").map(forText).join("\n")) : paras;
  return { subject: null, paras: shown, signature: null, text: shown.join("\n\n"), html: null, waHref: null, missing, asks: question, needsQuestion };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The email as HTML, so it pastes into Outlook formatted, with the WhatsApp
 * button working. Outlook's own font and size; a table for the button, since
 * Outlook drops a link's background colour but keeps a cell's.
 */
function emailHtml(paras: string[], signature: string[], waHref: string | null): string {
  const font = "font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt";
  const p = (inner: string) => `<p style="margin:0 0 11pt;${font}">${inner}</p>`;
  const body = paras.map((x) => p(esc(x).replace(/\n/g, "<br>"))).join("");
  const sig = p(signature.map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : esc(l))).join("<br>"));
  // A light green card: the WhatsApp tile, then the words, both links. Tables
  // and cell colours because that's what Outlook keeps; the rounded corners are
  // a bonus where the reader's email shows them.
  const href = waHref ? esc(waHref) : "";
  const button = waHref
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:2pt 0 0"><tr>`
      + `<td bgcolor="#F0FBF4" style="background:#F0FBF4;border:1px solid #C9EED7;border-radius:12px;padding:6px 18px 6px 6px">`
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td valign="middle" style="padding:0 10px 0 0"><a href="${href}"><img src="${WHATSAPP_TILE}" width="36" height="36" alt="WhatsApp" style="display:block;border:0;width:36px;height:36px"></a></td>`
      + `<td valign="middle" style="${font}"><a href="${href}" style="color:#111B21;text-decoration:none;font-weight:bold">Message me on WhatsApp</a></td>`
      + `</tr></table></td></tr></table>`
    : "";
  return `<div style="${font}">${body}${sig}${button}</div>`;
}

/**
 * A WhatsApp line as a text: no emoji, and where an emoji ended the line, a
 * full stop instead (a comma after "Hi Sarah"). Curly quotes go straight so a
 * text stays in the plain character set and fits in fewer messages.
 */
export function forText(line: string): string {
  const had = /\p{Extended_Pictographic}/u.test(line);
  let l = line.replace(/\s*\p{Extended_Pictographic}️?/gu, "").replace(/\s+$/, "");
  if (had && l && !/[.!?,:]$/.test(l)) l += /^Hi [^,.!?]+$/.test(l) ? "," : ".";
  return l.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

const GSM = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const GSM_EXT = new Set(Array.from("^{}\\[~]|€"));

/** How many texts a message sends as: 160 characters for one, 153 a part after that; 70 and 67 once anything is outside the plain set. */
export function smsParts(text: string): { chars: number; parts: number; plain: boolean } {
  const chars = Array.from(text);
  const plain = chars.every((c) => GSM.has(c) || GSM_EXT.has(c));
  const n = plain ? chars.reduce((s, c) => s + (GSM_EXT.has(c) ? 2 : 1), 0) : text.length;
  const [one, part] = plain ? [160, 153] : [70, 67];
  return { chars: n, parts: n <= one ? 1 : Math.ceil(n / part), plain };
}
