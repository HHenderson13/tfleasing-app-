// Customer Profiles (user, 2026-11-04): a sales exec's notes on every live
// enquiry, filled in while they're on the phone, in whatever order the call
// goes. The sections are the three TF Leasing opening call guides (personal,
// business car, business van) with the scripts taken out: just what the exec
// needs to capture.
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

export type FieldType = "text" | "long" | "choice" | "multi" | "yesno" | "money" | "number" | "date" | "time";

export interface FieldDef {
  id: string;
  type: FieldType;
  /** "{v}" reads as car or van. */
  label: PerKind<string>;
  kinds?: ProfileKind[];
  options?: PerKind<string[]>;
  placeholder?: PerKind<string>;
  /** After a number: "months", "miles a year", "a month". */
  unit?: PerKind<string>;
  /** Quick picks for a number. */
  chips?: number[];
  /** Only shown once another field holds this value. */
  showIf?: { field: string; is: string };
  /** Takes the whole row. */
  wide?: boolean;
}

export type Tone = "sky" | "indigo" | "violet" | "amber" | "emerald" | "ink" | "orange" | "slate" | "teal" | "lime" | "blue";

export interface SectionDef {
  id: string;
  title: PerKind<string>;
  /** Shorter, for the side list, where the title doesn't fit. */
  nav?: PerKind<string>;
  hint?: PerKind<string>;
  kinds?: ProfileKind[];
  tone: Tone;
  fields: FieldDef[];
  /** For a notes box: tap one to start a line with it. */
  prompts?: PerKind<string[]>;
}

const BIZ: ProfileKind[] = ["business_car", "business_van"];
const CARS: ProfileKind[] = ["personal", "business_car"];
const VAN: ProfileKind[] = ["business_van"];

export const SECTIONS: SectionDef[] = [
  // What's been agreed for the next contact ("ring me back tomorrow at 10am").
  // Shown at the top of the profile rather than as a card, and copied first.
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
      { id: "derivative", type: "text", wide: true, label: { personal: "Derivative they enquired on", business_car: "Derivative they enquired on", business_van: "Derivative and body style" },
        placeholder: { personal: "e.g. Titanium 2.5 PHEV", business_car: "e.g. Wildtrak 3.0 V6", business_van: "e.g. 320 L2 Limited, double cab" } },
      { id: "exact", type: "choice", label: "Exact {v}, or open to similar?", options: ["Exact", "Open to similar"] },
      { id: "openIf", type: "multi", label: "Open to similar for", options: ["Better availability", "Better spec", "Lower rental"], showIf: { field: "exact", is: "Open to similar" } },
      { id: "onlineTerms", type: "yesno", label: "Picked upfront, term and mileage online?" },
    ],
  },
  {
    id: "why", tone: "indigo", title: "Why they enquired",
    fields: [
      { id: "interest", type: "text", wide: true, label: "What interested them about this {v}" },
      { id: "trigger", type: "text", wide: true, label: "What made them enquire today" },
      { id: "drivers", type: "multi", kinds: BIZ, label: "Mainly driven by", options: {
        business_car: ["The car", "Rental", "Availability", "Company car requirement", "Tax position", "Replacing a vehicle"],
        business_van: ["Payload", "Load space", "Rental", "Availability", "Replacing a van", "Adding to the fleet"],
      } },
    ],
  },
  {
    id: "business", tone: "violet", kinds: BIZ, title: "The business and fleet", nav: "Business and fleet", hint: "The opportunity beyond one {v}",
    fields: [
      { id: "bizWhat", type: "text", wide: true, label: "What the business does" },
      { id: "bizType", type: "choice", wide: true, label: "Type of business", options: ["Sole trader", "Partnership", "LLP", "Ltd", "PLC", "Charity", "Other"] },
      { id: "employees", type: "number", label: "Employees" },
      { id: "fleetTotal", type: "number", label: "Vehicles in total" },
      { id: "fleetCars", type: "number", label: "Cars" },
      { id: "fleetVans", type: "number", label: "Vans" },
      { id: "fleetHeld", type: "choice", label: "Fleet held as", options: ["Owned", "Financed", "Leased", "A mix"] },
      { id: "oneSupplier", type: "choice", label: "One main supplier, or several?", options: ["One main supplier", "Different places"] },
      { id: "suppliers", type: "text", label: "Current supplier or suppliers" },
      { id: "renewalsBy", type: "text", label: "Who manages renewals" },
      { id: "cycle", type: "yesno", label: { business_car: "Set replacement cycle?", business_van: "Set replacement cycle for vans?" } },
      { id: "reviewed", type: "choice", label: "Vehicles reviewed", options: ["One at a time", "As a wider fleet plan"] },
      { id: "renewalsDue", type: "text", wide: true, label: "Other vehicles due for renewal in 3, 6 or 12 months" },
      { id: "problems", type: "text", wide: true, label: "Anything causing issues, costing too much or due back soon" },
      { id: "policy", type: "yesno", label: { business_car: "Company car policy to work within?", business_van: "Company van policy to work within?" } },
      { id: "policyNote", type: "text", label: "Policy details", showIf: { field: "policy", is: "Yes" } },
      { id: "priorities", type: "multi", wide: true, label: "What matters most", options: {
        business_car: ["Rental", "Upfront", "Availability", "Reliability", "Running costs", "Downtime", "Spec", "Driver preference", "Supplier support"],
        business_van: ["Rental", "Upfront", "Availability", "Payload", "Load space", "Reliability", "Running costs", "Downtime", "Driver preference", "Supplier support"],
      } },
      { id: "widerFleet", type: "yesno", label: "Open to us quoting the wider fleet as vehicles renew?" },
      { id: "diarise", type: "yesno", label: "Diarise their upcoming renewals?" },
    ],
  },
  {
    id: "needs", tone: "amber", title: { personal: "What they need", business_car: "Car needs", business_van: "What the van must do" }, nav: { business_van: "Van needs" },
    fields: [
      { id: "usedFor", type: "text", label: "Mainly used for" },
      { id: "driver", type: "text", label: "Who will drive it" },
      { id: "forWhom", type: "choice", kinds: ["business_car"], label: "This is for a", options: ["Director", "Employee", "Pool car", "Other"] },
      { id: "carrying", type: "text", kinds: VAN, label: "Usually carrying" },
      { id: "payload", type: "text", kinds: VAN, label: "Payload needed" },
      { id: "loadSize", type: "text", kinds: VAN, wide: true, label: "Load length, roof height or wheelbase" },
      { id: "access", type: "multi", kinds: VAN, wide: true, label: "Access", options: ["Side loading door", "Twin side doors", "Tailgate", "Barn doors"] },
      { id: "carryingType", type: "multi", kinds: VAN, wide: true, label: "Carrying", options: ["Tools", "Materials", "Parcels", "People", "Equipment", "Specialist"] },
      { id: "towing", type: "yesno", kinds: VAN, label: "Towing?" },
      { id: "caz", type: "yesno", kinds: VAN, label: "Used in clean air zones or city centres?" },
      { id: "sites", type: "yesno", kinds: VAN, label: "Sites with height, weight or access limits?" },
      { id: "sitesNote", type: "text", kinds: VAN, label: "Site limits", showIf: { field: "sites", is: "Yes" } },
      { id: "drivers2", type: "yesno", kinds: VAN, label: "More than one driver?" },
      { id: "fuel", type: "multi", kinds: VAN, label: "Fuel", options: ["Diesel", "Petrol", "Hybrid", "Electric"] },
      { id: "charging", type: "multi", kinds: VAN, label: "If electric, charging at", options: ["Home", "Work", "Depot", "None yet"], showIf: { field: "fuel", is: "Electric" } },
      { id: "trim", type: "text", kinds: CARS, label: "Preferred trim or derivative" },
      { id: "colour", type: "text", kinds: CARS, label: "Preferred colour" },
      { id: "mustHave", type: "text", kinds: CARS, wide: true, label: "Must-have features or options" },
      { id: "niceToHave", type: "text", kinds: CARS, wide: true, label: "Nice to have, not essential" },
      { id: "notColours", type: "text", kinds: CARS, label: "Colours they wouldn't consider" },
      { id: "carRules", type: "text", kinds: ["business_car"], wide: true, label: "Fuel, EV, emissions, company car tax, image or driver policy needs" },
      { id: "taxRate", type: "choice", kinds: BIZ, label: "Driver's income tax rate", options: ["20%", "40%", "45%"] },
      { id: "fuelCard", type: "yesno", kinds: BIZ, label: "Business pays for private fuel?" },
      { id: "waitOrSooner", type: "choice", wide: true, label: "If the exact {v} isn't available quickly", options: ["Wait for the perfect {v}", "Take something close, sooner"] },
    ],
  },
  {
    id: "spec", tone: "indigo", kinds: VAN, title: "Accessories and conversion", nav: "Accessories", hint: "Affects the on the road cost and the lead time",
    fields: [
      { id: "accessories", type: "multi", wide: true, label: "Dealer-fit accessories needed", options: [
        "Ply lining", "Racking", "Roof rack or bars", "Ladder storage or clamps", "Tow bar", "Beacons", "Chapter 8 markings", "Signwriting",
        "Seat covers or mats", "Deadlocks or slam locks", "Extra security or tracker", "Bulkhead", "Load protection", "Internal lighting", "Power supply",
      ] },
      { id: "conversion", type: "text", wide: true, label: "Specialist conversion work" },
      { id: "fitBefore", type: "yesno", label: "Anything to fit before delivery?" },
      { id: "fitBeforeNote", type: "text", label: "What needs fitting", showIf: { field: "fitBefore", is: "Yes" } },
      { id: "essential", type: "text", wide: true, label: "Essential before it can go into service" },
      { id: "signwriting", type: "text", wide: true, label: "Signwriting or branding" },
    ],
  },
  {
    id: "current", tone: "sky", title: "Current vehicle and timing", nav: "Current vehicle",
    fields: [
      { id: "currentVehicle", type: "text", label: "Current make and model", placeholder: "e.g. VW Golf 1.5 TSI, 2019" },
      { id: "currentFunder", type: "text", label: "Finance or lease provider" },
      { id: "currentHeld", type: "choice", label: "How is it held?", options: ["Owned", "Finance", "Lease"] },
      { id: "agreementEnds", type: "text", label: "Agreement ends", placeholder: "e.g. March 2027" },
      { id: "replacing", type: "choice", label: "Replacing or adding?", options: ["Replacing", "Adding another"] },
      { id: "neededBy", type: "text", label: { personal: "Ideally wants the new car by", business_car: "Ideally needs the new car by", business_van: "Ideally needs the van by" }, placeholder: "e.g. end of January" },
      { id: "prompted", type: "text", wide: true, label: "What's prompted the change now" },
      { id: "hardDeadline", type: "yesno", kinds: BIZ, label: { business_car: "Hard deadline?", business_van: "Hard deadline to be on the road?" } },
    ],
  },
  {
    id: "terms", tone: "emerald", title: "Quote terms",
    fields: [
      { id: "upfront", type: "money", label: { personal: "Upfront they saw", business_car: "Upfront", business_van: "Upfront" } },
      { id: "term", type: "number", label: "Term", unit: "months", chips: [24, 36, 48] },
      { id: "mileage", type: "number", wide: true, label: "Annual mileage", unit: "miles a year", chips: [5000, 8000, 10000, 12000, 15000, 20000] },
      { id: "workFrom", type: "choice", label: "Work from these terms?", options: ["Yes", "Adjust"] },
      { id: "upfrontOk", type: "yesno", label: { personal: "Upfront comfortable?", business_car: "Upfront suitable for the business?", business_van: "Upfront suitable for the business?" } },
      { id: "termFits", type: "yesno", label: { personal: "Term fits how long they keep a car?", business_car: "Term fits how long they keep vehicles?", business_van: "Term fits how long they keep vans?" } },
      { id: "mileageOk", type: "yesno", label: "Mileage realistic?" },
      { id: "maintenance", type: "choice", label: "Maintenance", options: ["Included", "Without"] },
      { id: "accessoriesIn", type: "choice", kinds: VAN, label: "Accessories or conversion costs", options: ["In the rental", "Quoted separately"] },
      { id: "adjust", type: "multi", wide: true, label: "If the rental is too high, adjust", options: ["Upfront", "Term", "Mileage", "Different model or spec"] },
    ],
  },
  {
    id: "decision", tone: "violet", kinds: BIZ, title: "Decision and procurement", nav: "Decision",
    fields: [
      { id: "decider", type: "text", label: "Who makes the final decision" },
      { id: "approver", type: "choice", label: "Do they approve it?", options: ["They approve", "Goes via someone else"] },
      { id: "approverVia", type: "text", label: "Goes via", showIf: { field: "approver", is: "Goes via someone else" } },
      { id: "involved", type: "text", label: "Who else needs to be involved" },
      { id: "quoteTo", type: "text", label: "Quote addressed to" },
      { id: "moreQuotes", type: "yesno", label: "More than one quote needed?" },
      { id: "procurement", type: "yesno", label: "Set procurement process to follow?" },
      { id: "showOnQuote", type: "multi", wide: true, label: "Show on the quote", options: {
        business_car: ["P11D", "CO₂", "Maintenance", "VAT", "Delivery timescale", "Whole-life cost"],
        business_van: ["Payload", "Load dimensions", "Maintenance", "Accessories or conversion", "VAT", "Delivery timescale"],
      } },
      { id: "po", type: "yesno", label: "Purchase order needed before we go ahead?" },
      { id: "needFromMe", type: "text", wide: true, label: "What they need from me to move forward" },
      { id: "beforeProceed", type: "text", wide: true, label: "Anything else before they can go ahead" },
    ],
  },
  {
    id: "search", tone: "ink", title: "Availability and price", nav: "Availability", hint: "Check it live while they're on the phone",
    fields: [
      { id: "availability", type: "choice", wide: true, label: "The {v} they want is", options: ["Available", "Not available", "Available with lead time"] },
      { id: "leadTime", type: "text", label: "Lead time", showIf: { field: "availability", is: "Available with lead time" } },
      { id: "rental", type: "money", label: "Rental on their terms", unit: { personal: "a month", business_car: "+ VAT a month", business_van: "+ VAT a month" } },
      { id: "accessoriesPrice", type: "text", kinds: VAN, label: "Accessories or conversion" },
      { id: "alternative", type: "text", wide: true, label: "Alternative found" },
      { id: "altWhy", type: "multi", wide: true, label: "The alternative is", options: {
        personal: ["Cheaper", "Quicker", "Better spec", "Preferred colour", "Better availability"],
        business_car: ["Cheaper", "Quicker", "Better spec", "Preferred colour", "Better availability"],
        business_van: ["Cheaper", "Quicker", "Better payload", "Better load space", "Better availability", "Better suited to the job"],
      } },
    ],
  },
  {
    id: "close", tone: "emerald", title: "Closing",
    fields: [
      { id: "rightPackage", type: "choice", label: "Right {v} and package?", options: ["Yes", "Not yet"] },
      { id: "goAhead", type: "yesno", label: "Happy to go ahead today on these terms?" },
      { id: "needFirst", type: "text", wide: true, label: "Anything else they need first" },
      { id: "asked", type: "choice", wide: true, label: "Asked to get it started", options: ["Going ahead", "Send order or application details"] },
    ],
  },
  {
    id: "followup", tone: "orange", title: "If not ready today",
    fields: [
      { id: "toCheck", type: "text", wide: true, label: "What they need to check" },
      { id: "whoElse", type: "text", kinds: BIZ, wide: true, label: "Who else needs to be involved" },
      { id: "stopping", type: "text", wide: true, label: "Anything stopping them if the {v} and figures are right" },
    ],
  },
  {
    id: "insight", tone: "slate", title: { personal: "Customer insight", business_car: "Business insight", business_van: "Business insight" },
    hint: "Makes the next call feel personal",
    prompts: {
      personal: ["Family and personal", "Work and driving habits", "Hot buttons", "Objections or hesitations", "Key dates and deadlines", "Anything to follow up"],
      business_car: ["Decision maker", "Driver and role", "Renewals due", "Agreement end dates", "Procurement or PO process", "Company car policy", "Business priorities", "Future fleet opportunity", "Concerns", "Personal detail"],
      business_van: ["Decision maker", "Driver and role", "Renewals due", "Van replacement cycle", "Payload or load needs", "Accessories or conversion", "Site or access limits", "Clean air zone needs", "Future fleet opportunity", "Concerns", "Personal detail"],
    },
    fields: [{ id: "insight", type: "long", wide: true, label: "Notes" }],
  },
  {
    id: "notes", tone: "slate", title: "Other notes", hint: "Anything else from the call",
    fields: [{ id: "otherNotes", type: "long", wide: true, label: "Notes" }],
  },
];

// ─── Part exchange ───────────────────────────────────────────────────────

/** Vehicle Vision's appraisal form: the customer fills it in, the appraisal comes back as a PDF (user, 2026-11-04). */
export const APPRAISAL_URL = "https://assist.vehicle-vision.com/landing.033c550a-7372-11ee-a3e1-0a45e79e31e9";

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

export const isRanger = (model: string) => /\b(ranger|raptor)\b/i.test(model);
/** A model that's a van whatever the customer is: a business customer on one of these is on the van guide. */
export const isVanModel = (model: string) => /\btransit\b|\bexplorer van\b|\bvan\b/i.test(model);

// ─── Reading the definitions for one profile ─────────────────────────────

const pick = <T,>(v: PerKind<T> | undefined, kind: ProfileKind): T | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string" || Array.isArray(v)) return v as T;
  return (v as Partial<Record<ProfileKind, T>>)[kind];
};
const words = (s: string, kind: ProfileKind) => s.replaceAll("{v}", vehicleWord(kind));

export const titleOf = (s: SectionDef, kind: ProfileKind) => words(pick(s.title, kind) ?? "", kind);
export const navTitleOf = (s: SectionDef, kind: ProfileKind) => (pick(s.nav, kind) != null ? words(pick(s.nav, kind)!, kind) : titleOf(s, kind));
export const hintOf = (s: SectionDef, kind: ProfileKind) => { const h = pick(s.hint, kind); return h ? words(h, kind) : null; };
export const promptsOf = (s: SectionDef, kind: ProfileKind) => pick(s.prompts, kind) ?? [];
export const labelOf = (f: FieldDef, kind: ProfileKind) => words(pick(f.label, kind) ?? "", kind);
export const optionsOf = (f: FieldDef, kind: ProfileKind) => (f.type === "yesno" ? ["Yes", "No"] : (pick(f.options, kind) ?? []).map((o) => words(o, kind)));
export const unitOf = (f: FieldDef, kind: ProfileKind) => pick(f.unit, kind) ?? null;
export const placeholderOf = (f: FieldDef, kind: ProfileKind) => pick(f.placeholder, kind) ?? null;

export const sectionsFor = (kind: ProfileKind) => SECTIONS.filter((s) => !s.kinds || s.kinds.includes(kind));

/** The fields showing right now: this kind's, less any waiting on another answer. */
export function fieldsShown(s: SectionDef, kind: ProfileKind, data: ProfileData): FieldDef[] {
  return s.fields.filter((f) => (!f.kinds || f.kinds.includes(kind)) && (!f.showIf || has(data[f.showIf.field], f.showIf.is)));
}

const has = (v: FieldValue | undefined, x: string) => (Array.isArray(v) ? v.includes(x) : v === x);
export const filled = (v: FieldValue | undefined) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "");

export function sectionProgress(s: SectionDef, kind: ProfileKind, data: ProfileData) {
  const shown = fieldsShown(s, kind, data);
  const answered = shown.filter((f) => filled(data[f.id])).length;
  return { answered, total: shown.length };
}

/** Every question section together, for the list's progress bar. */
export function progressOf(kind: ProfileKind, data: ProfileData) {
  let answered = 0;
  let total = 0;
  for (const s of sectionsFor(kind)) {
    if (s.id === "notes" || s.id === "next") continue;
    const p = sectionProgress(s, kind, data);
    answered += p.answered;
    total += p.total;
  }
  return { answered, total, pct: total ? Math.round((answered / total) * 100) : 0 };
}

/** Every key a profile may hold. Anything else sent to the server is refused. */
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
  kind: ProfileKind; data: ProfileData; docs?: DocLine[];
  since?: { data: ProfileData; at: number } | null; only?: string; today?: string;
}): string {
  const { kind, data, since } = input;
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
    for (const f of fieldsShown(s, kind, data)) {
      const v = data[f.id];
      if (!filled(v)) continue;
      if (!changed(f.id)) continue;
      lines.push(f.type === "long" ? (v as string).trim() : line(labelOf(f, kind), formatValue(f, v, kind, today)));
    }
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
  const text = [p.model, p.data.derivative, p.data.trim].filter((x) => typeof x === "string").join(" ");
  const trim = TRIM_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? null;
  const fuel = /phev|plug[\s-]?in|\b2\.3\b/i.test(text) ? "phev" : /diesel|\bv6\b|\b3\.0\b|\b2\.0\b/i.test(text) ? "diesel" : null;
  const versions = trim ? RANGERS.filter((r) => r.trim === trim) : [];
  const version = versions.length === 1 ? versions[0] : versions.find((r) => r.fuel === fuel) ?? null;
  const twoSeat = /\b(2|two)[\s-]?seat/i.test(text) && (version?.twoSeat ?? false);
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
