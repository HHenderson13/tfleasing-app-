// Customer Profiles (user, 2026-11-04): a sales exec's notes on every live
// enquiry, filled in while they're on the phone, in whatever order the call
// goes. Built from the three TF Leasing opening call guides (personal,
// business car, business van), cut to the questions that matter: no scripts,
// no closing steps, nothing a sales call doesn't actually need.
//
// Pure and client-safe. The page, the CRM copy and the list's sorting all
// read from here, and the tests pin the rules.

import { RANGERS, type RangerTrim } from "./ranger-tax";

export type ProfileKind = "personal" | "business_car" | "business_van";
export type ProfileStatus = "live" | "ordered" | "lost";
export type FieldValue = string | string[];
export type ProfileData = Record<string, FieldValue>;

export const KINDS: ProfileKind[] = ["personal", "business_car", "business_van"];
export const KIND_LABEL: Record<ProfileKind, string> = { personal: "Personal", business_car: "Business car", business_van: "Business van" };
export const isBusiness = (k: ProfileKind) => k !== "personal";
export const vehicleWord = (k: ProfileKind) => (k === "business_van" ? "van" : "car");

/** A value per kind, or one value for all of them. */
type PerKind<T> = T | Partial<Record<ProfileKind, T>>;

/** What a field can look at to decide whether it's shown. */
export interface Ctx { kind: ProfileKind; model: string; data: ProfileData }

export type FieldType = "text" | "long" | "choice" | "multi" | "yesno" | "money" | "number" | "date" | "time";

export interface FieldDef {
  id: string;
  type: FieldType;
  /** "{v}" reads as car or van. */
  label: PerKind<string>;
  /** On the summary tile, where the full question is too long. */
  short?: string;
  kinds?: ProfileKind[];
  options?: PerKind<string[]>;
  placeholder?: PerKind<string>;
  /** After a number: "months", "miles a year", "a month". */
  unit?: PerKind<string>;
  /** Quick picks for a number. */
  chips?: number[];
  /** Only shown when this holds: a Ranger, a plug-in, another answer. */
  show?: (c: Ctx) => boolean;
  /** Takes the whole row. */
  wide?: boolean;
}

export type Tone = "sky" | "indigo" | "violet" | "amber" | "emerald" | "ink" | "orange" | "slate" | "teal" | "lime" | "blue";

export interface SectionDef {
  id: string;
  title: PerKind<string>;
  kinds?: ProfileKind[];
  tone: Tone;
  fields: FieldDef[];
  /** For a notes box: tap one to start a line with it. */
  prompts?: PerKind<string[]>;
}

const BIZ: ProfileKind[] = ["business_car", "business_van"];
const CARS: ProfileKind[] = ["personal", "business_car"];
const VAN: ProfileKind[] = ["business_van"];

export const isRanger = (model: string) => /\b(ranger|raptor)\b/i.test(model);
/** A van whoever's buying it. The Ranger counts as one here (user, 2026-11-04), whatever the tax man says. */
export const isVanModel = (model: string) => /\btransit\b|\bexplorer van\b|\bvan\b/i.test(model) || isRanger(model);
/** Electric or plug-in hybrid: something they'll charge. From the model, or the derivative ("Kuga PHEV"). */
export const isPlugIn = (text: string) =>
  /gen-?e\b|\bcapri\b|mach-?e|e-transit|explorer van|transit city|\bexplorer\b|electric|\bev\b|phev|plug-?in|\bkwh\b/i.test(text);

/**
 * Personal, or business car or van. The exec only says personal or business:
 * whether a business is on the car or the van questions follows the model, so
 * nobody has to decide whether a Ranger is a van on a live call.
 */
export function kindFor(who: "personal" | "business", model: string): ProfileKind {
  return who === "personal" ? "personal" : isVanModel(model) ? "business_van" : "business_car";
}

const plugIn = (c: Ctx) => isPlugIn(`${c.model} ${typeof c.data.derivative === "string" ? c.data.derivative : ""}`);
const considering = (c: Ctx) => plugIn(c) || c.data.openToElectric === "Yes" || c.data.openToElectric === "Maybe";

export const SECTIONS: SectionDef[] = [
  // What's been agreed for the next contact ("ring me back tomorrow at 10am").
  // At the top of the profile rather than a tile, and copied first.
  {
    id: "next", tone: "orange", title: "Agreed next contact",
    fields: [
      { id: "contactBy", type: "choice", label: "How", options: ["Call", "Text", "Email"] },
      { id: "callbackDate", type: "date", label: "Day" },
      { id: "callbackTime", type: "time", label: "Time" },
    ],
  },
  {
    id: "vehicle", tone: "sky", title: { personal: "The car", business_car: "The car", business_van: "The van" },
    fields: [
      { id: "derivative", type: "text", wide: true, label: "Derivative", placeholder: { personal: "e.g. Titanium 2.5 PHEV", business_car: "e.g. ST-Line X 1.5", business_van: "e.g. 320 L2 Limited, or Wildtrak 3.0 V6" } },
      { id: "rangerSeats", type: "choice", label: "5 seat or 2 seat?", short: "Seats", options: ["5 seat", "2 seat"], show: (c) => isRanger(c.model) },
      { id: "exact", type: "choice", label: "Exact, or open to similar?", short: "Exact or similar", options: ["Exact", "Open to similar"] },
      { id: "openIf", type: "multi", label: "Open to similar for", short: "Similar for", options: ["Availability", "Spec", "Lower rental"], show: (c) => c.data.exact === "Open to similar" },
      { id: "colour", type: "text", kinds: CARS, label: "Colour" },
      { id: "mustHave", type: "text", kinds: CARS, wide: true, label: "Must-haves" },
    ],
  },
  {
    id: "why", tone: "indigo", title: "Why now",
    fields: [
      { id: "why", type: "text", wide: true, label: "Why this, and why now", short: "Why" },
      { id: "drivers", type: "multi", kinds: BIZ, wide: true, label: "Mainly about", options: {
        business_car: ["The car", "Rental", "Availability", "Company car policy", "Tax"],
        business_van: ["Payload", "Load space", "Rental", "Availability", "Adding to the fleet"],
      } },
    ],
  },
  {
    id: "business", tone: "violet", kinds: BIZ, title: "The business",
    fields: [
      { id: "bizWhat", type: "text", wide: true, label: "What the business does", short: "Does" },
      { id: "bizType", type: "choice", wide: true, label: "Type", options: ["Sole trader", "Partnership", "Ltd", "PLC", "Charity", "Other"] },
      { id: "fleetCars", type: "number", label: "Cars on the fleet", short: "Cars" },
      { id: "fleetVans", type: "number", label: "Vans on the fleet", short: "Vans" },
      { id: "suppliers", type: "text", label: "Current supplier", short: "Supplier" },
      { id: "renewalsDue", type: "text", label: "Others due in the next 12 months", short: "Renewals due" },
      { id: "priorities", type: "multi", wide: true, label: "What matters most", short: "Matters most", options: {
        business_car: ["Rental", "Availability", "Reliability", "Running costs", "Spec", "Driver choice"],
        business_van: ["Rental", "Availability", "Payload", "Reliability", "Running costs", "Downtime"],
      } },
      { id: "widerFleet", type: "yesno", label: "Can we quote the rest of the fleet?", short: "Rest of fleet" },
    ],
  },
  {
    id: "needs", tone: "amber", title: { personal: "How they'll use it", business_car: "How it's used", business_van: "What the van must do" },
    fields: [
      { id: "usedFor", type: "text", wide: true, label: "Mainly used for", short: "Used for" },
      { id: "driver", type: "text", label: "Who drives it", short: "Driver" },
      { id: "forWhom", type: "choice", kinds: ["business_car"], label: "For a", options: ["Director", "Employee", "Pool car"] },
      { id: "payload", type: "text", kinds: VAN, label: "Payload", placeholder: "e.g. 1 tonne" },
      { id: "loadSize", type: "text", kinds: VAN, label: "Length, roof or wheelbase", short: "Load space" },
      { id: "access", type: "multi", kinds: VAN, wide: true, label: "Access", options: ["Side door", "Twin side doors", "Tailgate", "Barn doors"] },
      { id: "towing", type: "yesno", kinds: VAN, label: "Towing?", short: "Towing" },
      { id: "caz", type: "yesno", kinds: VAN, label: "Into clean air zones?", short: "Clean air zones" },
      { id: "taxRate", type: "choice", kinds: BIZ, label: "Driver's tax rate", short: "Tax rate", options: ["20%", "40%", "45%"] },
      { id: "fuelCard", type: "yesno", kinds: BIZ, label: "Private fuel card?", short: "Fuel card" },
    ],
  },
  {
    id: "spec", tone: "indigo", kinds: VAN, title: "Accessories",
    fields: [
      { id: "accessories", type: "multi", wide: true, label: "Dealer-fit accessories", short: "Fitted", options: [
        "Ply lining", "Racking", "Roof rack", "Ladder clamps", "Tow bar", "Beacons", "Chapter 8", "Signwriting", "Seat covers", "Deadlocks", "Tracker", "Bulkhead", "Power supply",
      ] },
      { id: "conversion", type: "text", wide: true, label: "Conversion, or anything to fit before delivery", short: "Conversion" },
    ],
  },
  // Charging (user, 2026-11-04): asked straight away for anything they'd plug
  // in; otherwise one question first, and the rest only if the answer isn't no.
  {
    id: "charging", tone: "lime", title: "Charging",
    fields: [
      { id: "openToElectric", type: "choice", label: "Open to electric?", options: ["Yes", "Maybe", "No"], show: (c) => !plugIn(c) },
      { id: "offStreet", type: "yesno", label: "Off-street parking?", short: "Off-street parking", show: considering },
      { id: "homeCharger", type: "choice", label: "Home charger", options: ["Have one", "Could fit one", "Can't fit one"], show: considering },
      { id: "workCharging", type: "choice", label: { personal: "Charging at work?", business_car: "Charging at work?", business_van: "Charging at the depot?" }, short: "At work or depot", options: ["Yes", "Could fit one", "No"], show: considering },
      { id: "dailyMiles", type: "number", label: "A typical day", unit: "miles", show: considering },
    ],
  },
  {
    id: "current", tone: "sky", title: "Current vehicle",
    fields: [
      { id: "currentVehicle", type: "text", wide: true, label: "Make and model", short: "Vehicle", placeholder: "e.g. VW Golf 1.5 TSI, 2019" },
      { id: "currentHeld", type: "choice", label: "Owned, finance or lease?", short: "Held as", options: ["Owned", "Finance", "Lease"] },
      { id: "agreementEnds", type: "text", label: "Agreement ends", short: "Ends", placeholder: "e.g. March 2027" },
      { id: "neededBy", type: "text", label: "Needed by", placeholder: "e.g. end of January" },
      { id: "replacing", type: "choice", kinds: BIZ, label: "Replacing or adding?", short: "Replacing", options: ["Replacing", "Adding"] },
      // Ford's renewal discount on a van needs the V5 of one they have now (user, 2026-11-04).
      { id: "v5", type: "yesno", kinds: VAN, label: "Have the V5 for a van they run now? It unlocks the renewal discount", short: "V5 for renewal" },
    ],
  },
  {
    id: "terms", tone: "ink", title: "Quote and price",
    fields: [
      { id: "upfront", type: "money", label: "Upfront" },
      { id: "term", type: "number", label: "Term", unit: "months", chips: [24, 36, 48] },
      { id: "mileage", type: "number", wide: true, label: "Miles a year", short: "Mileage", unit: "miles a year", chips: [5000, 8000, 10000, 12000, 15000, 20000] },
      { id: "maintenance", type: "choice", label: "Maintenance", options: ["Included", "Without"] },
      { id: "rental", type: "money", label: "Rental on their terms", short: "Rental", unit: { personal: "a month", business_car: "+ VAT a month", business_van: "+ VAT a month" } },
      { id: "availability", type: "choice", wide: true, label: "Their {v} is", short: "Availability", options: ["Available", "On a lead time", "Not available"] },
      { id: "leadTime", type: "text", label: "Lead time", show: (c) => c.data.availability === "On a lead time" },
      { id: "alternative", type: "text", wide: true, label: "Alternative offered", short: "Alternative" },
    ],
  },
  {
    id: "decision", tone: "violet", kinds: BIZ, title: "Decision",
    fields: [
      { id: "decider", type: "text", label: "Who decides", short: "Decides" },
      { id: "approver", type: "choice", label: "Do they sign it off?", short: "Sign-off", options: ["Yes", "Goes via someone else"] },
      { id: "approverVia", type: "text", label: "Goes via", show: (c) => c.data.approver === "Goes via someone else" },
      { id: "moreQuotes", type: "yesno", label: "Getting other quotes?", short: "Other quotes" },
      { id: "po", type: "yesno", label: "Purchase order needed?", short: "PO needed" },
      { id: "needFromMe", type: "text", wide: true, label: "What they need from us to go ahead", short: "Needs from us" },
    ],
  },
  {
    id: "notes", tone: "slate", title: "Notes",
    prompts: {
      personal: ["Family", "Driving habits", "Hot buttons", "Worries", "Key dates"],
      business_car: ["Decision maker", "Driver", "Hot buttons", "Worries", "Future fleet", "Personal"],
      business_van: ["Decision maker", "Drivers", "Hot buttons", "Worries", "Future fleet", "Personal"],
    },
    fields: [{ id: "otherNotes", type: "long", wide: true, label: "Notes" }],
  },
];

/**
 * Questions the first version asked and this one doesn't. Anything already
 * typed into them is kept, shown under Notes and copied, never dropped.
 */
export const RETIRED: Record<string, string> = {
  onlineTerms: "Picked terms online", interest: "What interested them", trigger: "Why they enquired today",
  employees: "Employees", fleetTotal: "Vehicles in total", fleetHeld: "Fleet held as", oneSupplier: "One supplier or several", renewalsBy: "Manages renewals",
  cycle: "Replacement cycle", reviewed: "Vehicles reviewed", problems: "Problem vehicles", policy: "Vehicle policy", policyNote: "Policy details",
  diarise: "Diarise renewals", carrying: "Carrying", carryingType: "Carrying", sites: "Site limits", sitesNote: "Site limits", drivers2: "More than one driver",
  fuel: "Fuel", charging: "Charging at", trim: "Preferred trim", niceToHave: "Nice to have", notColours: "Colours they won't have", carRules: "Car policy needs",
  waitOrSooner: "Wait or take something sooner", fitBefore: "Fit before delivery", fitBeforeNote: "To fit before delivery", essential: "Essential before use",
  signwriting: "Signwriting", currentFunder: "Finance provider", prompted: "What prompted the change", hardDeadline: "Hard deadline",
  workFrom: "Work from these terms", upfrontOk: "Upfront comfortable", termFits: "Term fits", mileageOk: "Mileage realistic", accessoriesIn: "Accessories costs",
  adjust: "Adjust if too high", involved: "Also involved", quoteTo: "Quote addressed to", procurement: "Procurement process", showOnQuote: "Show on the quote",
  beforeProceed: "Before they can go ahead", accessoriesPrice: "Accessories price", altWhy: "Alternative is", rightPackage: "Right package",
  goAhead: "Happy to go ahead", needFirst: "Needed first", asked: "Asked for the business", toCheck: "Need to check", whoElse: "Who else",
  stopping: "Anything stopping them", insight: "Insight",
};

/** "Label: value" for anything kept from the first version. */
export function retiredLines(data: ProfileData): string[] {
  return Object.entries(RETIRED)
    .filter(([id]) => filled(data[id]))
    .map(([id, label]) => `${label}: ${Array.isArray(data[id]) ? (data[id] as string[]).join(", ") : String(data[id]).trim()}`);
}

// ─── Part exchange ───────────────────────────────────────────────────────

/** CitNOW's Vehicle Vision appraisal form, Ford branded: the customer fills it in, the appraisal comes back as a PDF (user, 2026-11-04). */
export const APPRAISAL_URL = "https://assist.vehicle-vision.com/landing/033c550a-7372-11ee-a3e1-0a45e79e31e9";

export const PX_FIELDS: FieldDef[] = [
  { id: "pxHas", type: "choice", label: "Part exchange?", options: ["Yes", "No", "Not sure yet"] },
  { id: "pxReg", type: "text", label: "Registration" },
  { id: "pxMileage", type: "number", label: "Mileage", unit: "miles" },
  { id: "pxLinkSent", type: "date", label: "Appraisal link sent" },
  { id: "pxValue", type: "money", label: "Appraisal value" },
  { id: "pxSettlement", type: "money", label: "Finance to settle" },
  { id: "pxValidUntil", type: "date", label: "Valuation valid until" },
];

/** Value less what's owed on it. Positive is equity, negative is negative equity. */
export function pxEquity(value: number, settlement: number): number {
  return Math.round((value - settlement) * 100) / 100;
}

/** Kept with the profile but not part of a section: how warm the lead is. */
export const HEAT = ["Hot", "Warm", "Cold"] as const;
export type Heat = (typeof HEAT)[number];

export const LOST_REASONS = [
  "Price or rental", "Bought or leased elsewhere", "Availability or lead time", "Finance declined", "Changed their mind", "Stopped responding", "Other",
];

/** Suggestions for "model interested in". Anything can be typed. */
export const FORD_MODELS = [
  "Puma", "Puma Gen-E", "Kuga", "Focus", "Capri", "Explorer", "Mustang", "Mustang Mach-E", "Bronco", "Ranger", "Ranger Raptor",
  "Tourneo Courier", "Tourneo Connect", "Tourneo Custom", "Transit Courier", "E-Transit Courier", "Transit Connect", "Transit Custom",
  "E-Transit Custom", "Transit", "E-Transit", "Transit City", "Explorer Van",
];

// ─── Reading the definitions for one profile ─────────────────────────────

const pick = <T,>(v: PerKind<T> | undefined, kind: ProfileKind): T | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string" || Array.isArray(v)) return v as T;
  return (v as Partial<Record<ProfileKind, T>>)[kind];
};
const words = (s: string, kind: ProfileKind) => s.replaceAll("{v}", vehicleWord(kind));

export const titleOf = (s: SectionDef, kind: ProfileKind) => words(pick(s.title, kind) ?? "", kind);
export const promptsOf = (s: SectionDef, kind: ProfileKind) => pick(s.prompts, kind) ?? [];
export const labelOf = (f: FieldDef, kind: ProfileKind) => words(pick(f.label, kind) ?? "", kind);
export const shortOf = (f: FieldDef, kind: ProfileKind) => f.short ?? labelOf(f, kind).replace(/\?$/, "");
export const optionsOf = (f: FieldDef, kind: ProfileKind) => (f.type === "yesno" ? ["Yes", "No"] : (pick(f.options, kind) ?? []).map((o) => words(o, kind)));
export const unitOf = (f: FieldDef, kind: ProfileKind) => pick(f.unit, kind) ?? null;
export const placeholderOf = (f: FieldDef, kind: ProfileKind) => pick(f.placeholder, kind) ?? null;

export const sectionsFor = (kind: ProfileKind) => SECTIONS.filter((s) => !s.kinds || s.kinds.includes(kind));
/** The tiles on the profile's front page, in order. */
export const topicsFor = (kind: ProfileKind) => sectionsFor(kind).filter((s) => s.id !== "next" && s.id !== "notes");

/** The fields showing right now: this kind's, less any waiting on a Ranger, a plug-in or another answer. */
export function fieldsShown(s: SectionDef, c: Ctx): FieldDef[] {
  return s.fields.filter((f) => (!f.kinds || f.kinds.includes(c.kind)) && (!f.show || f.show(c)));
}

export const filled = (v: FieldValue | undefined) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "");

export function sectionProgress(s: SectionDef, c: Ctx) {
  const shown = fieldsShown(s, c);
  const answered = shown.filter((f) => filled(c.data[f.id])).length;
  return { answered, total: shown.length };
}

/** Every topic together, for the list's progress bar. */
export function progressOf(c: Ctx) {
  let answered = 0;
  let total = 0;
  for (const s of topicsFor(c.kind)) {
    const p = sectionProgress(s, c);
    answered += p.answered;
    total += p.total;
  }
  return { answered, total, pct: total ? Math.round((answered / total) * 100) : 0 };
}

/**
 * A topic on its summary tile: the answers so far as short label and value,
 * and, while nothing's answered, what to ask about.
 */
export function summaryOf(s: SectionDef, c: Ctx, today: string, max = 4) {
  const shown = fieldsShown(s, c);
  const rows = shown.filter((f) => filled(c.data[f.id])).map((f) => [shortOf(f, c.kind), formatValue(f, c.data[f.id], c.kind, today)] as [string, string]);
  return { rows: rows.slice(0, max), more: Math.max(0, rows.length - max), ask: rows.length ? [] : shown.slice(0, 4).map((f) => shortOf(f, c.kind)) };
}

/**
 * How a topic's questions sit in its two-column panel: a short question
 * (yes / no, two or three short options, an amount, a date) takes half the
 * width, anything else the whole row. Halves only ever come in pairs, so every
 * row lines up: a short question with no short neighbour takes the row.
 * Widths are estimated from the text at the panel's size (13px pills).
 */
export function panelLayout(fields: FieldDef[], kind: ProfileKind): { f: FieldDef; half: boolean }[] {
  const HALF = 180; // px available to one column in the narrowest panel
  const fits = (text: string) => text.length * 7.2 <= HALF;
  const short = (f: FieldDef) => {
    if (f.wide || !fits(labelOf(f, kind)) || f.chips) return false;
    if (f.type === "yesno" || f.type === "date" || f.type === "time") return true;
    if (f.type === "money" || f.type === "number") return (unitOf(f, kind) ?? "").length <= 8;
    if (f.type === "choice") {
      const opts = optionsOf(f, kind);
      return opts.reduce((w, o) => w + o.length * 7.2 + 26, 0) + (opts.length - 1) * 6 <= HALF;
    }
    return f.type === "text";
  };
  const out = fields.map((f) => ({ f, half: short(f) }));
  for (let i = 0; i < out.length; i++) {
    if (!out[i].half) continue;
    if (out[i + 1]?.half) { i++; continue; }
    out[i].half = false;
  }
  return out;
}

/** Every key a profile may be sent. Anything else is refused. */
export const DATA_KEYS = new Set<string>([...SECTIONS.flatMap((s) => s.fields.map((f) => f.id)), ...PX_FIELDS.map((f) => f.id), "heat"]);
const FIELD_BY_ID = new Map<string, FieldDef>([...SECTIONS.flatMap((s) => s.fields), ...PX_FIELDS].map((f) => [f.id, f]));
export const fieldById = (id: string) => FIELD_BY_ID.get(id);

/** Tidies a patch from the browser: known keys, sane sizes; an empty value (null) removes the key. */
export function cleanPatch(input: unknown): Record<string, FieldValue | null> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Record<string, FieldValue | null> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!DATA_KEYS.has(k)) return null;
    const long = fieldById(k)?.type === "long";
    if (v == null || v === "") out[k] = null;
    else if (typeof v === "string") out[k] = v.slice(0, long ? 20_000 : 2_000);
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v.length ? (v as string[]).slice(0, 40).map((x) => x.slice(0, 200)) : null;
    else return null;
  }
  return out;
}

// ─── Dates and times, in UK wall-clock time ──────────────────────────────

/** "2026-11-04T14:05", now, in the UK. Compared as text with the next contact's date and time. */
export function ukNow(d = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

/** "Thu 6 Nov", with the year when it isn't this one. */
export function fmtDate(iso: string, today?: string): string {
  if (!isDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const year = today && today.slice(0, 4) === iso.slice(0, 4) ? "" : ` ${y}`;
  return `${day} ${d} ${MONTHS[m - 1]}${year}`;
}

/** "14:30" reads "2:30pm"; "09:00" reads "9am". */
export function fmtTime(t: string): string {
  if (!isTime(t)) return t;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "today", "tomorrow", "yesterday" or the date. */
export function dayWord(iso: string, today: string): string {
  if (iso === today) return "today";
  if (iso === addDays(today, 1)) return "tomorrow";
  if (iso === addDays(today, -1)) return "yesterday";
  return fmtDate(iso, today);
}

// ─── What to work on first ───────────────────────────────────────────────

export interface Urgency {
  /** 0 overdue, 1 due later today, 2 hot, 3 nothing booked, 4 booked, 5 cold. */
  tier: 0 | 1 | 2 | 3 | 4 | 5;
  /** Short, for a badge: "Overdue". */
  label: string;
  /** The detail: "Call was due 10:30am". */
  detail: string | null;
  tone: "rose" | "amber" | "slate" | "sky";
}

/** The agreed next contact as a date and, if one was agreed, a time. */
export function callbackOf(data: ProfileData): { date: string; time: string | null } | null {
  const date = data.callbackDate;
  if (!isDate(date)) return null;
  const time = isTime(data.callbackTime) ? (data.callbackTime as string) : null;
  return { date, time };
}

/** "tomorrow, 10am", "Mon 9 Nov". */
export function callbackText(cb: { date: string; time: string | null }, today: string): string {
  const day = dayWord(cb.date, today);
  return cb.time ? `${day}, ${fmtTime(cb.time)}` : day;
}

/** "Call", "Text", "Email", or "Contact" when how wasn't agreed. */
export const contactVerb = (data: ProfileData) => (["Call", "Text", "Email"].includes(data.contactBy as string) ? (data.contactBy as string) : "Contact");

/** "Call tomorrow at 10am", "Text Mon 9 Nov". The agreed next contact in words. */
export function nextContactText(data: ProfileData, today: string): string | null {
  const cb = callbackOf(data);
  if (!cb) return null;
  const day = dayWord(cb.date, today);
  return `${contactVerb(data)} ${day}${cb.time ? ` at ${fmtTime(cb.time)}` : ""}`;
}

/**
 * Why this enquiry is where it is in the list. An agreed next contact is a
 * promise, so a due one beats everything; then hot leads; then anything with
 * nothing booked, which is how a live enquiry goes cold without anyone noticing.
 */
export function urgencyOf(data: ProfileData, now: string): Urgency {
  const today = now.slice(0, 10);
  const cb = callbackOf(data);
  const heat = data.heat as Heat | undefined;
  const verb = contactVerb(data);
  if (cb) {
    const due = cb.time ? `${cb.date}T${cb.time}` : null;
    const overdue = cb.date < today || (cb.date === today && due != null && due <= now);
    if (overdue) return { tier: 0, label: "Overdue", detail: `${verb} was due ${cb.date === today ? fmtTime(cb.time!) : callbackText(cb, today)}`, tone: "rose" };
    if (cb.date === today) return { tier: 1, label: "Due today", detail: cb.time ? `${verb} at ${fmtTime(cb.time)}` : `${verb} any time today`, tone: "amber" };
  }
  if (heat === "Hot") return { tier: 2, label: "Hot", detail: cb ? `${verb} ${callbackText(cb, today)}` : "Nothing booked", tone: "rose" };
  if (heat === "Cold") return { tier: 5, label: "Cold", detail: cb ? `${verb} ${callbackText(cb, today)}` : null, tone: "sky" };
  if (!cb) return { tier: 3, label: "Nothing booked", detail: null, tone: "amber" };
  return { tier: 4, label: `${verb} ${callbackText(cb, today)}`, detail: null, tone: "slate" };
}

/** Most important first. Ties: the soonest next contact, then the newest enquiry. */
export function sortLive<T extends { data: ProfileData; createdAt: number }>(rows: T[], now: string): T[] {
  const key = (r: T) => {
    const cb = callbackOf(r.data);
    return cb ? `${cb.date}T${cb.time ?? "00:00"}` : "9999";
  };
  return rows
    .map((r) => ({ r, u: urgencyOf(r.data, now), k: key(r) }))
    .sort((a, b) => a.u.tier - b.u.tier || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0) || b.r.createdAt - a.r.createdAt)
    .map((x) => x.r);
}

// ─── Copy for the CRM ────────────────────────────────────────────────────

export const pounds = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const num = (v: FieldValue | undefined) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** One answer as it reads in the notes: "48 months", "£3,000", "Thu 6 Nov 2026". */
export function formatValue(f: FieldDef, v: FieldValue, kind: ProfileKind, today?: string): string {
  if (Array.isArray(v)) return v.join(", ");
  const unit = unitOf(f, kind);
  if (f.type === "money") { const n = num(v); return n == null ? v : `${pounds(n)}${unit ? ` ${unit}` : ""}`; }
  if (f.type === "number") { const n = num(v); return n == null ? v : `${n.toLocaleString("en-GB")}${unit ? ` ${unit}` : ""}`; }
  if (f.type === "date") return fmtDate(v, today);
  if (f.type === "time") return fmtTime(v);
  return v.trim();
}

const line = (label: string, value: string) => `${label}${label.endsWith("?") ? " " : ": "}${value}`;

export interface DocLine { createdAt: number; text: string }

/**
 * The notes as plain text for pasting into the CRM. Leaves out what the CRM
 * already holds (the customer's name, personal or business, the model) and
 * how warm the lead is. With `since`, only what's new or changed since then.
 */
export function crmText(input: {
  kind: ProfileKind; model: string; data: ProfileData; docs?: DocLine[];
  since?: { data: ProfileData; at: number } | null; only?: string; today?: string;
}): string {
  const { kind, data, since } = input;
  const c: Ctx = { kind, model: input.model, data };
  const today = input.today ?? ukNow().slice(0, 10);
  const changed = (id: string) => !since || JSON.stringify(since.data[id] ?? null) !== JSON.stringify(data[id] ?? null);
  const blocks: string[] = [];

  for (const s of sectionsFor(kind)) {
    if (input.only && input.only !== s.id) continue;
    if (s.id === "next") {
      // One line, first: "Agreed next contact: Call, Thu 5 Nov at 10am".
      const cb = callbackOf(data);
      if (!["contactBy", "callbackDate", "callbackTime"].some(changed)) continue;
      const how = ["Call", "Text", "Email"].includes(data.contactBy as string) ? (data.contactBy as string) : null;
      const when = cb ? `${fmtDate(cb.date, today)}${cb.time ? ` at ${fmtTime(cb.time)}` : ""}` : null;
      if (how || when) blocks.push(`Agreed next contact: ${[how, when].filter(Boolean).join(", ")}`);
      continue;
    }
    const lines: string[] = [];
    for (const f of fieldsShown(s, c)) {
      const v = data[f.id];
      if (!filled(v)) continue;
      if (!changed(f.id)) continue;
      lines.push(f.type === "long" ? (v as string).trim() : line(shortOf(f, kind), formatValue(f, v, kind, today)));
    }
    // Notes also carry anything typed into a question the first version asked.
    if (s.id === "notes" && Object.keys(RETIRED).some((id) => filled(data[id]) && changed(id))) lines.push(...retiredLines(data));
    if (lines.length) blocks.push([titleOf(s, kind), ...lines].join("\n"));
  }

  if (!input.only || input.only === "px") {
    const px = pxText(data, today);
    if (px && (!since || PX_FIELDS.some((f) => changed(f.id)))) blocks.push(`Part exchange\n${px}`);
  }
  if (!input.only || input.only === "docs") {
    const docs = (input.docs ?? []).filter((d) => !since || d.createdAt > since.at).map((d) => d.text);
    if (docs.length) blocks.push(["Documents", ...docs].join("\n"));
  }
  return blocks.join("\n\n");
}

/** "AB12 CDE, 45,000 miles. Valued at £12,500, valid until Fri 21 Nov. £8,000 to settle, so £4,500 equity." */
export function pxText(data: ProfileData, today?: string): string | null {
  if (data.pxHas === "No") return "No part exchange";
  const reg = typeof data.pxReg === "string" ? data.pxReg.trim().toUpperCase() : "";
  const miles = num(data.pxMileage);
  const value = num(data.pxValue);
  const settle = num(data.pxSettlement);
  const parts: string[] = [];
  const car = [reg, miles != null ? `${miles.toLocaleString("en-GB")} miles` : ""].filter(Boolean).join(", ");
  if (car) parts.push(`${car}.`);
  if (isDate(data.pxLinkSent) && value == null) parts.push(`Appraisal link sent ${fmtDate(data.pxLinkSent as string, today)}.`);
  if (value != null) parts.push(`Valued at ${pounds(value)}${isDate(data.pxValidUntil) ? `, valid until ${fmtDate(data.pxValidUntil as string, today)}` : ""}.`);
  if (value != null && settle != null && settle > 0) {
    const eq = pxEquity(value, settle);
    parts.push(`${pounds(settle)} to settle, so ${eq >= 0 ? `${pounds(eq)} equity` : `${pounds(-eq)} negative equity`}.`);
  } else if (settle != null && settle > 0) parts.push(`${pounds(settle)} to settle.`);
  if (!parts.length) return data.pxHas === "Yes" ? "Has a part exchange" : null;
  return parts.join(" ");
}

// ─── Opening the calculators with what we already know ───────────────────

export interface FuelPrefill {
  customerName: string;
  segment: "car" | "van";
  customer: "private" | "business";
  annualMiles: number | null;
  termMonths: number | null;
  /** Their current vehicle as typed, to start the search with. */
  currentVehicle: string;
  /** The model they're interested in, to pick the electric side if we have it. */
  model: string;
}

export function fuelPrefillOf(p: { customerName: string; kind: ProfileKind; model: string; data: ProfileData }): FuelPrefill {
  const miles = num(p.data.mileage);
  const term = num(p.data.term);
  return {
    customerName: p.customerName,
    segment: p.kind === "business_van" || isVanModel(p.model) ? "van" : "car",
    customer: p.kind === "personal" ? "private" : "business",
    annualMiles: miles != null && miles > 0 && miles <= 200_000 ? Math.round(miles) : null,
    termMonths: term != null && [24, 36, 48, 60].includes(term) ? term : null,
    currentVehicle: typeof p.data.currentVehicle === "string" ? p.data.currentVehicle.trim() : "",
    model: p.model.trim(),
  };
}

/** The electric model in the calculator's range that matches what they enquired on, if any. */
export function matchEvModel(model: string, evModels: { key: string; model: string }[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const m = norm(model.replace(/^ford\s+/i, ""));
  if (!m) return null;
  return evModels.find((e) => norm(e.model) === m)?.key
    ?? evModels.find((e) => norm(e.model).startsWith(m))?.key
    ?? evModels.find((e) => m.includes(norm(e.model)))?.key
    ?? null;
}

export interface RangerPrefill {
  customerName: string;
  taxRate: string | null;
  fuelCard: "yes" | "no" | null;
  termMonths: number | null;
  trim: RangerTrim | null;
  versionId: string | null;
  seats: 2 | 5;
  /** Ex VAT a month: only a business quote is ex VAT. */
  rental: number | null;
}

const TRIM_PATTERNS: [RangerTrim, RegExp][] = [
  ["Raptor", /raptor/i], ["MS-RT", /ms[\s-]?rt/i], ["Platinum", /platinum/i], ["Wildtrak", /wild\s?trak/i], ["Limited", /limited/i], ["XLT", /\bxlt\b/i],
];

export function rangerPrefillOf(p: { customerName: string; kind: ProfileKind; model: string; data: ProfileData }): RangerPrefill {
  const text = [p.model, p.data.derivative].filter((x) => typeof x === "string").join(" ");
  const trim = TRIM_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? null;
  const fuel = /phev|plug[\s-]?in|\b2\.3\b/i.test(text) ? "phev" : /diesel|\bv6\b|\b3\.0\b|\b2\.0\b/i.test(text) ? "diesel" : null;
  const versions = trim ? RANGERS.filter((r) => r.trim === trim) : [];
  const version = versions.length === 1 ? versions[0] : versions.find((r) => r.fuel === fuel) ?? null;
  const wantsTwo = p.data.rangerSeats === "2 seat" || (p.data.rangerSeats == null && /\b(2|two)[\s-]?seat/i.test(text));
  const twoSeat = wantsTwo && (version?.twoSeat ?? false);
  const rate = typeof p.data.taxRate === "string" ? p.data.taxRate.replace("%", "") : "";
  const term = num(p.data.term);
  const rental = num(p.data.rental);
  return {
    customerName: p.customerName,
    taxRate: ["20", "40", "45"].includes(rate) ? rate : null,
    fuelCard: p.data.fuelCard === "Yes" ? "yes" : p.data.fuelCard === "No" ? "no" : null,
    termMonths: term != null && [24, 36, 48, 60].includes(term) ? term : null,
    trim,
    versionId: version?.id ?? null,
    seats: twoSeat ? 2 : 5,
    rental: isBusiness(p.kind) && rental != null && rental > 0 ? rental : null,
  };
}
