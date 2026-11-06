// What the message builder says (user, 2026-11-06: "an admin section so all
// parts of the templates, questions etc can be changed"). The standard wording
// lives here, written from the TrustFord Leasing guides. Admins change any of
// it at /profiles/templates, and only the sections they've changed are stored
// (message_config), so anything nobody has touched keeps following this file.
//
// Placeholders are in square brackets, as the guides write them: [First name],
// [Your name], [Model], [car or van]; a layout also places [Opening],
// [Offer and extras], [Question], [Fleet question] and [Ending].
//
// Pure and client-safe.

export type Day = 1 | 2 | 3;
export const DAYS: Day[] = [1, 2, 3];
export type Who = "personal" | "business";
export type Angle = "what" | "why" | "when";
export const ANGLES: Angle[] = ["what", "why", "when"];
export const ANGLE_LABEL: Record<Angle, string> = { what: "What", why: "Why", when: "When" };

// ─── Question sets and models ────────────────────────────────────────────

export type QSetKey = "puma" | "kuga" | "explorer" | "capri" | "car" | "ev" | "bizcar" | "courier" | "connect" | "custom" | "ecustom" | "ranger" | "van" | "evan";
export const QSETS: { key: QSetKey; label: string }[] = [
  { key: "puma", label: "Puma" },
  { key: "kuga", label: "Kuga" },
  { key: "explorer", label: "Explorer" },
  { key: "capri", label: "Capri" },
  { key: "car", label: "Other cars" },
  { key: "ev", label: "Other electric cars" },
  { key: "bizcar", label: "Business cars" },
  { key: "courier", label: "Transit Courier" },
  { key: "connect", label: "Transit Connect" },
  { key: "custom", label: "Transit Custom" },
  { key: "ecustom", label: "E-Transit Custom" },
  { key: "ranger", label: "Ranger" },
  { key: "van", label: "Other vans" },
  { key: "evan", label: "Other electric vans" },
];
const SET_KEYS = new Set<string>(QSETS.map((s) => s.key));

export interface ModelBase { key: string; label: string; van: boolean; electric: boolean; set: QSetKey }
/** The models a message can be about, cars then vans. Which is a van is fixed; the rest an admin can change. */
export const MODEL_BASE: ModelBase[] = [
  { key: "puma", label: "Puma", van: false, electric: false, set: "puma" },
  { key: "kuga", label: "Kuga", van: false, electric: true, set: "kuga" },
  { key: "explorer", label: "Explorer", van: false, electric: true, set: "explorer" },
  { key: "capri", label: "Capri", van: false, electric: true, set: "capri" },
  { key: "puma-gen-e", label: "Puma Gen-E", van: false, electric: true, set: "ev" },
  { key: "mach-e", label: "Mustang Mach-E", van: false, electric: true, set: "ev" },
  { key: "mustang", label: "Mustang", van: false, electric: false, set: "car" },
  { key: "bronco", label: "Bronco", van: false, electric: false, set: "car" },
  { key: "focus", label: "Focus", van: false, electric: false, set: "car" },
  { key: "tourneo-courier", label: "Tourneo Courier", van: false, electric: false, set: "car" },
  { key: "tourneo-connect", label: "Tourneo Connect", van: false, electric: false, set: "car" },
  { key: "tourneo-custom", label: "Tourneo Custom", van: false, electric: false, set: "car" },
  { key: "transit-courier", label: "Transit Courier", van: true, electric: false, set: "courier" },
  { key: "transit-connect", label: "Transit Connect", van: true, electric: false, set: "connect" },
  { key: "transit-custom", label: "Transit Custom", van: true, electric: false, set: "custom" },
  { key: "e-transit-custom", label: "E-Transit Custom", van: true, electric: true, set: "ecustom" },
  { key: "ranger", label: "Ranger", van: true, electric: false, set: "ranger" },
  { key: "transit", label: "Transit", van: true, electric: false, set: "van" },
  { key: "e-transit-courier", label: "E-Transit Courier", van: true, electric: true, set: "evan" },
  { key: "e-transit", label: "E-Transit", van: true, electric: true, set: "evan" },
  { key: "transit-city", label: "Transit City", van: true, electric: true, set: "evan" },
  { key: "explorer-van", label: "Explorer Van", van: true, electric: true, set: "evan" },
];

// ─── The shape of it ─────────────────────────────────────────────────────

/** An email opening or ending. Blank lines split it into paragraphs. */
export interface Choice { text: string; note?: string }
export type Fits = "all" | "personal" | "business-car" | "van";
export const FITS_LABEL: Record<Fits, string> = { all: "Everyone", personal: "Personal only", "business-car": "Business cars only", van: "Vans only" };
export interface WaStyleCfg { id: string; label: string; hint: string; fits: Fits; text: string; endings: string[] }
export interface QItem { text: string; electricOnly?: boolean }
export interface QBank { what: QItem[]; why: QItem[]; when: QItem[] }
export interface QSet {
  /** Day 1 and Day 2's questions. */
  early: QBank;
  /** Day 3's. */
  late: QBank;
  suggested: Record<Day, { angle: Angle; text: string }>;
}
export interface ModelCfg { label: string; set: QSetKey; electric: boolean }
export interface EmailDayCfg { subject: string; template: string; openings: Choice[]; endings: Choice[] }

export interface MessageConfig {
  days: Record<Day, { title: string; aim: string }>;
  email: Record<Day, EmailDayCfg>;
  whatsapp: Record<Day, WaStyleCfg[]>;
  questions: Record<QSetKey, QSet>;
  models: Record<string, ModelCfg>;
  fleet: { 2: string; 3: string };
  offers: { 1: string; 2: string; 3: string; dated3: string };
}

// ─── Placeholders ────────────────────────────────────────────────────────

export const T = {
  first: "First name", exec: "Your name", model: "Model", vehicle: "car or van",
  opening: "Opening", extras: "Offer and extras", question: "Question", fleet: "Fleet question", ending: "Ending",
  offer: "Offer", until: "Valid until",
} as const;
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Matches a placeholder however it's spaced or capitalised: [first name], [ First Name ]. */
export const tokenRe = (name: string) => new RegExp(`\\[\\s*${reEsc(name).replace(/ /g, "\\s+")}\\s*\\]`, "gi");
export const hasToken = (text: string, name: string) => tokenRe(name).test(text);
/** Swaps one placeholder for a value, as written (no $ patterns). */
export const putToken = (text: string, name: string, value: string) => text.replace(tokenRe(name), () => value);

export const COMMON_TOKENS: string[] = [T.first, T.exec, T.model, T.vehicle];
export const EMAIL_TOKENS: string[] = [...COMMON_TOKENS, T.opening, T.extras, T.question, T.fleet, T.ending];
export const WA_TOKENS: string[] = [...COMMON_TOKENS, T.extras, T.question, T.fleet, T.ending];
export const OFFER_TOKENS: string[] = [T.model, T.offer, T.until];

/** Anything in square brackets that isn't one of these. */
export function unknownTokens(text: string, allowed: string[]): string[] {
  const ok = new Set(allowed.map((a) => a.toLowerCase()));
  return [...new Set((text.match(/\[[^\]]*\]/g) ?? []).filter((t) => !ok.has(t.slice(1, -1).trim().replace(/\s+/g, " ").toLowerCase())))];
}

// ─── The standard wording ────────────────────────────────────────────────

type Q = string | { t: string; plugIn: true };
interface Bank { what: Q[]; why: Q[]; when: Q[]; suggested: [Angle, string] }
interface Banks { day1: [Angle, string]; early: Bank; late: Bank }

// Word for word from the guide, with [Model] where a question names the model
// it's asked about. The guide's Day 2 lists serve Day 1 as well (Day 2 is "a
// different WHAT, WHY or WHEN"), and a profile remembers what it has asked.
// "car", "ev" and "evan" are the Puma, Explorer and E-Transit Custom lists
// with the model's own name in, for the models the guide doesn't cover.
const BANKS: Record<QSetKey, Banks> = {
  puma: {
    day1: ["why", "What caught your eye about the Puma?"],
    early: {
      what: [
        "Have you got a particular Puma spec or colour in mind, or are you fairly open?",
        "Is there anything you'd definitely want on your new Puma?",
        "Would you consider a different Puma spec if it worked out better value?",
        "Are you set on the Puma or looking at anything else as well?",
      ],
      why: [
        "What are you driving at the moment? Just wondering what you're moving from.",
        "Is there anything about your current car you're looking to improve on?",
        "Was it the Puma itself or the monthly rental that caught your eye?",
        "Are you looking for something smaller, more economical or just fancy a change?",
      ],
      when: [
        "Is your current car coming to the end of its agreement?",
        "Are you hoping to change fairly soon or planning ahead?",
        "Would you rather have something available sooner or wait for a particular spec?",
        "Have you got a rough date in mind for changing?",
      ],
      suggested: ["what", "Have you got a particular Puma spec or colour in mind, or are you fairly open? Just want to make sure I'm looking at the right options for you."],
    },
    late: {
      what: [
        "Are you still looking at the Puma, or have you started considering anything else?",
        "Have you managed to narrow down which Puma you'd like?",
        "Is there anything specific you're still trying to find out about the Puma?",
        "Would it help if I looked at a couple of different Puma options for you?",
      ],
      why: [
        "Is there anything that's making you unsure about changing at the moment?",
        "Have you found something else you prefer?",
        "Are you mainly comparing prices, or still deciding which car to go for?",
        "Is there anything I can help clear up about the Puma?",
      ],
      when: [
        "Are you still hoping to change soon, or is it something for later in the year?",
        "Is your current car due to go back soon?",
        "Would you be looking to get something sorted now if the figures worked?",
        "Would it be better if I picked this back up with you nearer the time?",
      ],
      suggested: ["what", "Are you still looking at the Puma, or have you found something else?"],
    },
  },
  kuga: {
    day1: ["why", "Is the Kuga mainly a family car or something for commuting?"],
    early: {
      what: [
        "Are you looking specifically at the hybrid Kuga, or would you consider other versions?",
        "Is there a particular spec or colour you're after?",
        "Is it the extra space you're looking for, or is there something else important?",
        "Would you consider a different Kuga spec if it meant a better monthly rental?",
      ],
      why: [
        "What are you currently driving?",
        "Is the Kuga mainly a family car or something for commuting?",
        "Are you looking for something bigger than what you've got now?",
        "Is it the running costs or the car itself that's attracted you?",
      ],
      when: [
        "Is your current car due to be changed soon?",
        "Are you looking for something in stock or happy to wait?",
        "Have you got a particular date you're working towards?",
        "Are you ready to change or just comparing some options at the moment?",
      ],
      suggested: ["why", "Is it the extra space that's attracted you to the Kuga, or are you mainly looking at the hybrid running costs?"],
    },
    late: {
      what: [
        "Are you still considering the Kuga or looking at some other SUVs as well?",
        "Have you managed to narrow down which Kuga spec you want?",
        "Is there anything else you'd like to know about the Kuga?",
        "Would it help if I compared a couple of different Kuga options?",
      ],
      why: [
        "Is there anything making you unsure about going for the Kuga?",
        "Are you still comparing a few cars?",
        "Have you found something that suits you better?",
        "Is there anything else I can help with before you decide?",
      ],
      when: [
        "Are you still looking to change fairly soon?",
        "Is your current car due for replacement, or can you take your time?",
        "Would you want to get something ordered now if we found the right Kuga?",
        "Would it be worth coming back to this nearer your current agreement ending?",
      ],
      suggested: ["what", "Are you still considering the Kuga, or have you gone in a different direction? Happy to help if you're still comparing."],
    },
  },
  explorer: {
    day1: ["why", "What made you start looking at electric cars?"],
    early: {
      what: [
        "Would you be able to charge at home, or would you mainly use public chargers?",
        "Have you got a particular Explorer spec in mind?",
        "Is range your biggest priority, or are you more focused on the monthly rental?",
        "Have you looked at the Capri as well, or is it definitely the Explorer?",
      ],
      why: [
        "Have you had an electric car before, or would this be your first?",
        "What's made you start looking at electric?",
        "Are you currently driving petrol, diesel or electric?",
        "Is there anything that's putting you off making the switch to electric?",
      ],
      when: [
        "Are you thinking of making the switch fairly soon?",
        "Is your current lease coming to an end?",
        "Would you be looking for something available sooner, or happy to wait for the right specification?",
        "Have you got a date in mind for getting your new car?",
      ],
      suggested: ["why", "Have you driven electric before, or would the Explorer be your first? Just helps me understand what would be most useful to go through with you."],
    },
    late: {
      what: [
        "Are you still looking at the Explorer, or have you considered a few other electric cars?",
        "Is there anything about electric driving you'd like me to help with?",
        "Would a comparison between the Explorer and Capri be useful?",
        "Is there anything about the Explorer's spec or charging you're unsure on?",
      ],
      why: [
        "Are you still thinking about making the switch to electric?",
        "Is there anything putting you off going electric?",
        "Are you comparing the Explorer against other electric cars?",
        "Have you decided to stay with petrol or diesel for now?",
      ],
      when: [
        "Are you still hoping to go electric soon?",
        "Is this something you're looking to do now or further down the line?",
        "Would you be ready to move forward if we found the right Explorer?",
        "Would it be better to pick this up closer to when your current car is due back?",
      ],
      suggested: ["why", "Are you still thinking about going electric with the Explorer, or have you decided to leave it for now?"],
    },
  },
  capri: {
    day1: ["why", "What was it about the Capri that caught your eye?"],
    early: {
      what: [
        "Have you got a particular Capri spec or colour in mind?",
        "Is it specifically the Capri you're after, or have you considered the Explorer too?",
        "Would you be able to charge at home?",
        "Are you more interested in the range, specification or monthly cost?",
      ],
      why: [
        "What was it about the Capri that caught your eye?",
        "Have you been thinking about electric for a while?",
        "What are you driving at the moment?",
        "Is there anything about your current car that you'd like to change?",
      ],
      when: [
        "Is your current agreement coming to an end?",
        "Are you looking to change soon or just getting some ideas?",
        "Would you prefer something sooner or wait for the exact Capri you want?",
        "Have you got a particular date in mind for delivery?",
      ],
      suggested: ["what", "Are you set on the Capri, or have you considered the Explorer as well? Happy to compare the two for you if that helps."],
    },
    late: {
      what: [
        "Are you still looking at the Capri, or have you seen something else you like?",
        "Have you managed to decide which Capri spec you'd want?",
        "Would you like me to compare the Capri against the Explorer?",
        "Is there anything else you'd like to know about the Capri?",
      ],
      why: [
        "Are you still thinking about making the switch to electric?",
        "Have you seen another electric car that's caught your eye?",
        "Is there anything making you unsure about the Capri?",
        "Are you still comparing cars, or have you made your mind up?",
      ],
      when: [
        "Are you still looking to change fairly soon?",
        "Would you be ready to order if we found the right Capri?",
        "Is your current agreement ending soon, or have you got a bit of time?",
        "Would it be more useful to pick this back up nearer when you're ready to change?",
      ],
      suggested: ["what", "Are you still looking at the Capri, or have you got something else lined up?"],
    },
  },
  car: {
    day1: ["why", "What caught your eye about the [Model]?"],
    early: {
      what: [
        "Have you got a particular [Model] spec or colour in mind, or are you fairly open?",
        "Is there anything you'd definitely want on your new [Model]?",
        "Would you consider a different [Model] spec if it worked out better value?",
        "Are you set on the [Model] or looking at anything else as well?",
      ],
      why: [
        "What are you driving at the moment? Just wondering what you're moving from.",
        "Is there anything about your current car you're looking to improve on?",
        "Was it the [Model] itself or the monthly rental that caught your eye?",
      ],
      when: [
        "Is your current car coming to the end of its agreement?",
        "Are you hoping to change fairly soon or planning ahead?",
        "Would you rather have something available sooner or wait for a particular spec?",
        "Have you got a rough date in mind for changing?",
      ],
      suggested: ["what", "Have you got a particular [Model] spec or colour in mind, or are you fairly open? Just want to make sure I'm looking at the right options for you."],
    },
    late: {
      what: [
        "Are you still looking at the [Model], or have you started considering anything else?",
        "Have you managed to narrow down which [Model] you'd like?",
        "Is there anything specific you're still trying to find out about the [Model]?",
        "Would it help if I looked at a couple of different [Model] options for you?",
      ],
      why: [
        "Is there anything that's making you unsure about changing at the moment?",
        "Have you found something else you prefer?",
        "Are you mainly comparing prices, or still deciding which car to go for?",
        "Is there anything I can help clear up about the [Model]?",
      ],
      when: [
        "Are you still hoping to change soon, or is it something for later in the year?",
        "Is your current car due to go back soon?",
        "Would you be looking to get something sorted now if the figures worked?",
        "Would it be better if I picked this back up with you nearer the time?",
      ],
      suggested: ["what", "Are you still looking at the [Model], or have you found something else?"],
    },
  },
  ev: {
    day1: ["why", "What made you start looking at electric cars?"],
    early: {
      what: [
        "Would you be able to charge at home, or would you mainly use public chargers?",
        "Have you got a particular [Model] spec in mind?",
        "Is range your biggest priority, or are you more focused on the monthly rental?",
      ],
      why: [
        "Have you had an electric car before, or would this be your first?",
        "What's made you start looking at electric?",
        "Are you currently driving petrol, diesel or electric?",
        "Is there anything that's putting you off making the switch to electric?",
      ],
      when: [
        "Are you thinking of making the switch fairly soon?",
        "Is your current lease coming to an end?",
        "Would you be looking for something available sooner, or happy to wait for the right specification?",
        "Have you got a date in mind for getting your new car?",
      ],
      suggested: ["why", "Have you driven electric before, or would the [Model] be your first? Just helps me understand what would be most useful to go through with you."],
    },
    late: {
      what: [
        "Are you still looking at the [Model], or have you considered a few other electric cars?",
        "Is there anything about electric driving you'd like me to help with?",
        "Is there anything about the [Model]'s spec or charging you're unsure on?",
      ],
      why: [
        "Are you still thinking about making the switch to electric?",
        "Is there anything putting you off going electric?",
        "Are you comparing the [Model] against other electric cars?",
        "Have you decided to stay with petrol or diesel for now?",
      ],
      when: [
        "Are you still hoping to go electric soon?",
        "Is this something you're looking to do now or further down the line?",
        "Would you be ready to move forward if we found the right [Model]?",
        "Would it be better to pick this up closer to when your current car is due back?",
      ],
      suggested: ["why", "Are you still thinking about going electric with the [Model], or have you decided to leave it for now?"],
    },
  },
  bizcar: {
    day1: ["why", "Are you replacing an existing company car or adding another?"],
    early: {
      what: [
        "Is this car for yourself or another driver in the business?",
        "Are you working to a particular company car policy?",
        "Is monthly rental the main priority, or are you looking at overall running costs?",
        "Is there a particular specification the driver needs?",
        "Are you looking at this as a one-off vehicle or potentially a few?",
      ],
      why: [
        "Are you replacing an existing company car or adding another?",
        "What are you currently running in the business?",
        "Is the main aim to reduce costs, or is a vehicle simply due for replacement?",
        "Is there a particular reason you've chosen this model?",
        { t: "Are you considering electric for the tax benefits or more because of the vehicle itself?", plugIn: true },
      ],
      when: [
        "Is there an existing lease coming to an end?",
        "Are you working towards a particular date for the new car?",
        "Is the business looking to get something ordered soon?",
        "Have you got other vehicles due for renewal around the same time?",
        "Would the business be flexible on specification if something suitable was available sooner?",
      ],
      suggested: ["what", "Is this car for yourself or another driver in the business? Just want to make sure we're looking at the right vehicle and package."],
    },
    late: {
      what: [
        "Is the business still looking for a [Model], or has something else been agreed?",
        "Are you still considering this car for the driver?",
        "Is there anything you need from us to help make a decision?",
        "Would another specification or rental structure be worth looking at?",
        "Are you comparing a few different suppliers at the moment?",
      ],
      why: [
        "Is there anything holding things up at your end?",
        "Has the business decided to hold off replacing the car?",
        "Are you waiting for approval, or still comparing options?",
        "Has the driver decided on something else?",
        "Is there anything we could do differently to make the offer work?",
      ],
      when: [
        "Are you still looking to get the car ordered soon?",
        "Has your required delivery date changed?",
        "Are you waiting until closer to your current agreement ending?",
        "Would it be more useful to revisit this when your next vehicles are due for renewal?",
        "Is there a particular date the business needs to make a decision by?",
      ],
      suggested: ["what", "Is the business still looking to get the [Model] sorted, or has the plan changed? Just want to make sure I'm not chasing you for something you've already dealt with."],
    },
  },
  courier: {
    day1: ["why", "What's made you look at the Courier?"],
    early: {
      what: [
        "What would you normally be carrying in the Courier?",
        "Would you need any shelving or racking fitted?",
        "Is the Courier the size you're after, or have you considered the Connect as well?",
        "Will the van mainly be used locally or for longer journeys?",
      ],
      why: [
        "Are you moving down from a bigger van?",
        "What's made you look at the Courier?",
        "What are you currently running?",
        "Are you replacing an existing van or adding another?",
      ],
      when: [
        "Is your current van due to be changed soon?",
        "Are you looking to get the Courier on the road fairly quickly?",
        "Have you got any upcoming work you need the van for?",
        "Are you happy to wait for a particular spec?",
      ],
      suggested: ["what", "What sort of things will you normally be carrying in the Courier? Just want to make sure the size is right for you."],
    },
    late: {
      what: [
        "Are you still looking at the Courier, or considering something a bit bigger?",
        "Have you managed to decide which size of van you need?",
        "Is there anything else you'd like to know about the Courier?",
        "Would it help if I looked at the Connect as an alternative?",
      ],
      why: [
        "Have you managed to get another van sorted?",
        "Are you still looking to replace your current van?",
        "Has anything changed with the business since you enquired?",
        "Is there anything that's put you off the Courier?",
      ],
      when: [
        "Are you still looking to get something on the road fairly soon?",
        "Has your deadline changed?",
        "Is this something you're leaving until later?",
        "Would it be better to pick this up nearer when your current van is due back?",
      ],
      suggested: ["what", "Are you still looking for a Courier, or have you got another van sorted?"],
    },
  },
  connect: {
    day1: ["what", "What do you normally carry in your van?"],
    early: {
      what: [
        "What do you normally carry in your van?",
        "Would you need any racking, roof bars or other extras fitted?",
        "Is there a particular load length or payload you need?",
        "Have you considered the Courier, or do you definitely need the extra space?",
      ],
      why: [
        "What are you driving at the moment?",
        "Is there anything about your current van that isn't quite working for you?",
        "Are you replacing a van or adding another?",
        "What's made you look at the Connect?",
      ],
      when: [
        "Is your current van coming to the end of its agreement?",
        "Have you got a particular delivery date in mind?",
        "Would you prefer something available sooner or are you happy to wait?",
        "Are you planning ahead or looking to get something sorted now?",
      ],
      suggested: ["what", "Would you need anything fitted to the Connect, like racking or ply lining, or would a standard van do the job?"],
    },
    late: {
      what: [
        "Are you still looking at the Connect, or have you considered another size of van?",
        "Have you managed to settle on the spec you need?",
        "Is there anything else you'd like to know about the Connect?",
        "Would it help if I looked at a few different options?",
      ],
      why: [
        "Have you managed to get a van sorted elsewhere?",
        "Is there anything that's made you reconsider the Connect?",
        "Are you still planning on replacing your current van?",
        "Has anything changed with what the business needs?",
      ],
      when: [
        "Are you still hoping to get a new van fairly soon?",
        "Is your current van due back soon?",
        "Would you be ready to order if we found the right Connect?",
        "Is this something you'd rather look at further down the line?",
      ],
      suggested: ["what", "Are you still looking to get a Connect sorted, or has the plan changed?"],
    },
  },
  custom: {
    day1: ["what", "What sort of work will you mainly use the van for?"],
    early: {
      what: [
        "Have you got a particular Custom size or spec in mind?",
        "Will you need any racking, roof bars or ply lining?",
        "Is it a panel van you're after, or do you need additional seats?",
        "Will you be doing much towing?",
        "Is there a particular load length or payload you need?",
      ],
      why: [
        "What are you currently driving?",
        "Are you replacing a Custom or moving from a different van?",
        "Is there anything about your current van that you'd like to improve?",
        "Is this an additional van because the business is growing?",
        "What's made you start looking at changing?",
      ],
      when: [
        "Is your existing van due back soon?",
        "Have you got a job coming up that you need the van for?",
        "Are you looking for something available quite quickly?",
        "Have you got a particular date you need it on the road?",
        "Would you consider another spec if it meant getting something sooner?",
      ],
      suggested: ["what", "Have you got a particular Custom size or spec in mind, and would you need anything fitted before delivery?"],
    },
    late: {
      what: [
        "Are you still looking at the Transit Custom?",
        "Have you managed to narrow down which Custom you need?",
        "Would a different Custom spec be worth considering?",
        "Is there anything else you need to know about the van before deciding?",
        "Have you found a van that suits the business better?",
      ],
      why: [
        "Have you managed to sort a van elsewhere?",
        "Are you still planning on replacing your current Custom?",
        "Is there anything holding you back from making a decision?",
        "Has anything changed with the work you need the van for?",
        "Is it the price, specification or availability that's making you hold off?",
      ],
      when: [
        "Are you still looking to get the van on the road soon?",
        "Has your required delivery date changed?",
        "Would you be ready to get something ordered if we found the right Custom?",
        "Is this something you're looking to sort now or further down the line?",
        "Would it be better to come back to this closer to when your current van is due back?",
      ],
      suggested: ["what", "Are you still looking to get a Custom sorted, or have you managed to find something elsewhere? Happy to help if you're still looking."],
    },
  },
  ecustom: {
    day1: ["why", "What's got you considering electric vans?"],
    early: {
      what: [
        "Roughly how many miles does the van cover in a normal working day?",
        "Would you have somewhere to charge it overnight?",
        "Would the van mainly be used locally or for longer journeys?",
        "Are you comparing the electric Custom against diesel as well?",
        "Is there a particular payload you need?",
      ],
      why: [
        "What's got you considering electric vans?",
        "Are you looking to save on running costs?",
        "Have you got any electric vehicles in the business already?",
        "What's your current van?",
        "Is there a particular reason you're thinking of moving away from diesel?",
      ],
      when: [
        "Are you looking to switch to electric soon?",
        "Is there a current van coming up for replacement?",
        "Would you need to get charging sorted before delivery?",
        "Have you got a date in mind for getting the van on the road?",
      ],
      suggested: ["what", "Roughly how many miles would the van do in a normal day, and would you have somewhere to charge overnight?"],
    },
    late: {
      what: [
        "Are you still considering the E-Custom, or have you decided to stick with diesel?",
        "Is there anything about electric vans you're still unsure on?",
        "Would it help if I compared the electric and diesel Custom?",
        "Have you managed to work out whether electric would suit your daily mileage?",
      ],
      why: [
        "Are you still thinking about making the switch to electric?",
        "Is charging or range making you unsure?",
        "Have you decided to keep diesel for the moment?",
        "Is there anything about the electric Custom you'd like me to go through?",
      ],
      when: [
        "Are you still looking to move to electric soon?",
        "Is this something you're planning for later in the year?",
        "Would you need charging sorted before going ahead?",
        "Has the replacement date for your current van changed?",
      ],
      suggested: ["what", "Are you still thinking about the E-Custom, or have you decided to stick with diesel for now? Happy to talk through either option."],
    },
  },
  evan: {
    day1: ["why", "What's got you considering electric vans?"],
    early: {
      what: [
        "Roughly how many miles does the van cover in a normal working day?",
        "Would you have somewhere to charge it overnight?",
        "Would the van mainly be used locally or for longer journeys?",
        "Are you comparing the [Model] against diesel as well?",
        "Is there a particular payload you need?",
      ],
      why: [
        "What's got you considering electric vans?",
        "Are you looking to save on running costs?",
        "Have you got any electric vehicles in the business already?",
        "What's your current van?",
        "Is there a particular reason you're thinking of moving away from diesel?",
      ],
      when: [
        "Are you looking to switch to electric soon?",
        "Is there a current van coming up for replacement?",
        "Would you need to get charging sorted before delivery?",
        "Have you got a date in mind for getting the van on the road?",
      ],
      suggested: ["what", "Roughly how many miles would the van do in a normal day, and would you have somewhere to charge overnight?"],
    },
    late: {
      what: [
        "Are you still considering the [Model], or have you decided to stick with diesel?",
        "Is there anything about electric vans you're still unsure on?",
        "Have you managed to work out whether electric would suit your daily mileage?",
      ],
      why: [
        "Are you still thinking about making the switch to electric?",
        "Is charging or range making you unsure?",
        "Have you decided to keep diesel for the moment?",
        "Is there anything about the [Model] you'd like me to go through?",
      ],
      when: [
        "Are you still looking to move to electric soon?",
        "Is this something you're planning for later in the year?",
        "Would you need charging sorted before going ahead?",
        "Has the replacement date for your current van changed?",
      ],
      suggested: ["what", "Are you still thinking about the [Model], or have you decided to stick with diesel for now? Happy to talk through either option."],
    },
  },
  ranger: {
    day1: ["what", "Is it mainly for work, personal use or a bit of both?"],
    early: {
      what: [
        "Have you got a particular Ranger spec in mind?",
        "Will you be doing much towing?",
        "Are you looking at the two-seat or five-seat version?",
        "Would you prefer diesel or the plug-in hybrid?",
        "Is it mainly for work, personal use or a bit of both?",
      ],
      why: [
        "Are you already driving a Ranger?",
        "What's made you start looking at changing your pickup?",
        "Is there something your current vehicle doesn't quite do?",
        "What caught your eye about the Ranger?",
        "Is it replacing a current pickup or an additional vehicle?",
      ],
      when: [
        "Is your current pickup coming to the end of its agreement?",
        "Are you looking for something available soon?",
        "Would you consider a different Ranger spec if it meant getting one quicker?",
        "Have you got a particular date you'd like it delivered?",
      ],
      suggested: ["what", "Are you looking at the two-seat or five-seat Ranger? There are some important differences for business users, so it's worth checking."],
    },
    late: {
      what: [
        "Are you still looking at the Ranger, or have you got another pickup in mind?",
        "Have you managed to decide which Ranger spec you'd want?",
        "Is there anything else you'd like to know about the Ranger?",
        "Would you consider a different Ranger model if the package worked better?",
        "Are you still comparing diesel and plug-in hybrid?",
      ],
      why: [
        "Have you managed to get another Ranger sorted?",
        "Are you still planning on replacing your current pickup?",
        "Is there anything making you unsure about the Ranger?",
        "Have you found something else that suits the business better?",
        "Is it the rental or the vehicle itself that's making you hold off?",
      ],
      when: [
        "Are you still looking to change your pickup soon?",
        "Is your current Ranger coming to the end of its agreement?",
        "Would you be ready to order if we found the right spec?",
        "Has your timescale changed since you enquired?",
        "Would it be better to pick this back up closer to when you're ready to change?",
      ],
      suggested: ["what", "Are you still looking at getting a Ranger, or have you got something else sorted?"],
    },
  },
  van: {
    day1: ["what", "What sort of work will the van be doing?"],
    early: {
      what: [
        "What sort of work will the van be doing?",
        "What do you normally need to carry?",
        "Would you need any extras fitted before delivery?",
        "Is there a particular payload or load length you need?",
        "Are you looking for one van or a few?",
      ],
      why: [
        "What's prompted you to start looking for another van?",
        "Are you replacing one or growing the fleet?",
        "Is your existing van starting to cost you money?",
        "What are you currently running?",
        "Is there anything your current vans don't quite do that you need?",
      ],
      when: [
        "When would you ideally like the van on the road?",
        "Is there a current agreement coming to an end?",
        "Have you got a contract or job coming up that you need it for?",
        "Are you looking to order soon or planning ahead?",
        "Have you got any other vans due for renewal?",
      ],
      suggested: ["why", "What are you currently running in the business? Just helps me understand what you're replacing and whether there's anything better suited to the job."],
    },
    late: {
      what: [
        "Are you still looking for another van, or have you got something sorted?",
        "Have you decided which van would suit the business best?",
        "Is there anything else you need to know before making a decision?",
        "Are you comparing a few different vans or suppliers?",
        "Would a different spec or model be worth looking at?",
      ],
      why: [
        "Has anything changed with what the business needs?",
        "Are you still planning on replacing your current van?",
        "Is there anything holding things up?",
        "Have you managed to get another van sorted?",
        "Is there anything we could do differently to make the offer work?",
      ],
      when: [
        "Are you still hoping to get something on the road soon?",
        "Has your required delivery date changed?",
        "Are you leaving the replacement until later?",
        "Would you be ready to order if we found the right van?",
        "Would it help if I got back in touch closer to when you're ready?",
      ],
      suggested: ["what", "Are you still looking to get another van sorted for the business, or has something changed since you enquired?"],
    },
  },
};
const qi = (q: Q): QItem => (typeof q === "string" ? { text: q } : { text: q.t, electricOnly: true });
const toBank = (b: Bank): QBank => ({ what: b.what.map(qi), why: b.why.map(qi), when: b.when.map(qi) });
const toSet = (b: Banks): QSet => ({
  early: toBank(b.early),
  late: toBank(b.late),
  suggested: { 1: { angle: b.day1[0], text: b.day1[1] }, 2: { angle: b.early.suggested[0], text: b.early.suggested[1] }, 3: { angle: b.late.suggested[0], text: b.late.suggested[1] } },
});

/** The email: "Hi", the chosen opening, the offer and extras, the question, the fleet question, the chosen ending, "Thanks,". The signature follows. */
const EMAIL_LAYOUT = "Hi [First name],\n\n[Opening]\n\n[Offer and extras]\n\n[Question]\n\n[Fleet question]\n\n[Ending]\n\nThanks,";
const AGAIN = "It's [Your name] from TrustFord Leasing again.";
const HELLO = "It's [Your name] from TrustFord Leasing.";
const CONTACT = "Feel free to reply here, call me or drop me a WhatsApp.";
const CONTACT_3 = "Feel free to reply here or give me a call when you get a minute.";
const p = (...paras: string[]) => paras.join("\n\n");

const EMAIL: Record<Day, EmailDayCfg> = {
  1: {
    subject: "Your Ford [Model] enquiry",
    template: EMAIL_LAYOUT,
    openings: [
      { text: p("Thanks for your enquiry on the [Model]! It's [Your name] from TrustFord Leasing, and I'll be looking after you.", "I've just tried giving you a quick call, so thought I'd drop you an email as well.") },
      { text: p("It's [Your name] from TrustFord Leasing. Thanks for getting in touch about the [Model]!", "I've just tried giving you a quick call, so thought I'd send a quick email instead.") },
    ],
    endings: [
      { text: p("Let me know and I'll start looking at the best options for you.", CONTACT) },
      { text: p("Drop me a reply when you get a chance.", CONTACT) },
      { text: p("Happy to help with any questions you've got.", CONTACT) },
    ],
  },
  2: {
    subject: "Your Ford [Model] enquiry",
    template: EMAIL_LAYOUT,
    openings: [
      { text: p(AGAIN, "I've just tried giving you another quick call about your [Model] enquiry.", "I wanted to see if I could help you narrow down the best options.") },
      { text: p(AGAIN, "Just following up on your [Model] enquiry from yesterday.") },
      { text: p(AGAIN, "I've just tried catching you again about the [Model].") },
      { text: p(AGAIN, "Just wanted to come back to you about the [Model] you'd enquired on.") },
      { text: "It's [Your name] from TrustFord Leasing again. Thought I'd drop you a quick email about the [Model]." },
      { text: p(AGAIN, "Just wanted to see if I could help you narrow down the right [Model].") },
      { text: p(AGAIN, "I've been looking at your enquiry and wanted to check something with you."), note: "only if you've reviewed it" },
    ],
    endings: [
      { text: p("If you can let me know, I'll have a look at what would work best for you.", CONTACT) },
      { text: p("Let me know and I'll have a look at what would suit you best.", CONTACT) },
      { text: p("If you can let me know, I'll take a look at the options.", CONTACT) },
      { text: p("Drop me a reply when you get a chance.", CONTACT) },
      { text: p("Happy to have a look at a few options for you.", CONTACT) },
      { text: "No need to call if you're busy, just reply here and I'll help where I can." },
    ],
  },
  3: {
    subject: "Still looking at the Ford [Model]?",
    template: EMAIL_LAYOUT,
    openings: [
      { text: p(HELLO, "I've tried catching you a couple of times about your [Model] enquiry, so thought I'd drop you another email.", "Just wanted to check where you're up to with your search.") },
      { text: p(HELLO, "Just wanted to see where you're up to with the [Model].") },
      { text: p(HELLO, "I've tried catching you a couple of times, so thought I'd send a quick email instead.") },
      { text: p(HELLO, "Just checking back in about your [Model] enquiry.") },
      { text: p(HELLO, "Not sure if you're still looking at the [Model] or have already got something sorted?") },
      { text: p(HELLO, "Just wanted to make sure you had everything you needed from us regarding the [Model].") },
      { text: p(HELLO, "I've not managed to catch you yet, so thought I'd see if email was easier.") },
    ],
    endings: [
      { text: p("No problem at all if you're still looking around or aren't quite ready yet. Just helps me know what would be most useful for you.", CONTACT_3) },
      { text: p("No problem either way, just let me know.", CONTACT_3) },
      { text: p("Happy to help whenever you're ready.", CONTACT_3) },
      { text: p("If you're still looking, I'll see what we can do for you.", CONTACT_3) },
      { text: p("Even if you're just comparing options, I'm happy to help.", CONTACT_3) },
      { text: "Just drop me a reply when you get a chance." },
      { text: p("If you've already got something sorted, that's absolutely fine too.", CONTACT_3) },
    ],
  },
};

const D2_END = ["Let me know and I'll take a look 👍", "Drop me a reply when you get a minute.", "Happy to look at a few options for you.", "Just let me know what you're thinking.", "Give me a shout when you get a chance."];
const EASY = "For someone who hasn't replied to anything";
const wa = (id: string, label: string, text: string[], endings: string[] = [], fits: Fits = "all", hint = ""): WaStyleCfg => ({ id, label, hint, fits, text: p(...text), endings });

const WHATSAPP: Record<Day, WaStyleCfg[]> = {
  1: [
    wa("standard", "Standard", ["Hi [First name] 👋", "It's [Your name] from TrustFord Leasing. Thanks for your enquiry on the [Model]!", "[Offer and extras]", "[Question]", "[Ending]", "[Your name]"],
      ["Drop me a message when you get a chance 👍", "Let me know when you get a minute 👍", "Happy to help with any questions you've got 👍"]),
    wa("short", "Shorter", ["Hi [First name], it's [Your name] from TrustFord Leasing 👋", "Thanks for your enquiry on the [Model]!", "[Offer and extras]", "[Question]", "[Ending]"],
      ["Thanks, [Your name]", "Drop me a message when you get a chance 👍"]),
  ],
  2: [
    wa("standard", "Standard", ["Hi [First name] 👋", AGAIN, "Just tried giving you another quick call about the [Model].", "[Offer and extras]", "[Question]", "[Fleet question]", "[Ending]", "[Your name]"],
      ["Let me know when you get a minute and I'll have a look at the options for you 👍", ...D2_END]),
    wa("short", "Shorter", ["Hi [First name], it's [Your name] from TrustFord Leasing again 👋", "Just wanted to check something on your [Model] enquiry.", "[Offer and extras]", "[Question]", "[Fleet question]", "[Ending]"],
      ["Let me know when you get a chance 👍", ...D2_END]),
  ],
  3: [
    wa("standard", "Standard", ["Hi [First name] 👋", AGAIN, "Just checking where you're up to with the [Model]?", "[Offer and extras]", "[Question]", "[Fleet question]", "[Ending]", "[Your name]"],
      ["No problem either way, just let me know 👍", "Happy to help if you're still looking 👍", "No problem either way 👍"]),
    wa("short", "Shorter", ["Hi [First name], it's [Your name] from TrustFord Leasing.", "Just checking if you're still looking at the [Model] or have got something sorted?", "[Offer and extras]", "[Fleet question]", "No problem either way 👍"]),
    wa("later", "Not caught you yet", ["Hi [First name] 👋", "Not managed to catch you yet about the [Model].", "Are you still looking to change, or is it something you're leaving until later?", "[Offer and extras]", "[Fleet question]", "Thanks, [Your name]"]),
    wa("easy-a", "Easy reply: still looking?", ["Hi [First name], it's [Your name] from TrustFord Leasing 👋", "Just checking where you're up to with the [Model].", "Still looking, leaving it until later, or got something sorted?", "[Offer and extras]", "No problem either way 👍"], [], "personal", EASY),
    wa("easy-b", "Easy reply: plan changed?", ["Hi [First name], just checking back in about the [Model].", "Is the business still looking to get something ordered, or has the plan changed?", "[Offer and extras]", "[Fleet question]", "Thanks, [Your name]"], [], "business-car", EASY),
    wa("easy-c", "Easy reply: van sorted?", ["Hi [First name], it's [Your name] from TrustFord Leasing.", "Just checking if you're still looking for a [Model], or have managed to get a van sorted?", "[Offer and extras]", "[Fleet question]", "Give me a shout 👍"], [], "van", EASY),
    wa("easy-d", "Easy reply: timing", ["Hi [First name], just wanted to check if you're still looking to change your [car or van] soon, or is it something for further down the line?", "[Offer and extras]", "Happy to help either way 👍"], [], "all", EASY),
    wa("easy-e", "Easy reply: comparing quotes", ["Hi [First name], just checking if you're still comparing quotes on the [Model]?", "If you are, happy to have a look at the figures with you.", "[Offer and extras]", "Thanks, [Your name]"], [], "all", EASY),
    wa("easy-f", "Easy reply: no pressure", ["Hi [First name], not managed to catch you yet about the [Model].", "No rush if you're just looking around. Just wanted to see if there's anything you need from me?", "[Offer and extras]", "Thanks, [Your name]"], [], "all", EASY),
  ],
};

export const DEFAULT_CONFIG: MessageConfig = {
  days: { 1: { title: "Day 1", aim: "Introduce and discover" }, 2: { title: "Day 2", aim: "Help and understand" }, 3: { title: "Day 3", aim: "Still looking?" } },
  email: EMAIL,
  whatsapp: WHATSAPP,
  questions: Object.fromEntries(QSETS.map((s) => [s.key, toSet(BANKS[s.key])])) as Record<QSetKey, QSet>,
  models: Object.fromEntries(MODEL_BASE.map((m) => [m.key, { label: m.label, set: m.set, electric: m.electric }])),
  fleet: {
    2: "Out of interest, do you normally replace your vehicles individually, or have you got a few coming up for renewal together?",
    3: "Even if this particular [car or van] has been sorted, have you got anything else coming up for renewal that we could help with?",
  },
  offers: {
    1: "Good news, the [Model] you've enquired on is actually part of one of our bespoke offers at the moment, so it's a really good time to be looking! [Offer]",
    2: "I also wanted to make sure you'd seen the offer we've got on the [Model] at the moment. [Offer]",
    3: "The offer on the [Model] is still running at the moment, so it's worth a look if you're still searching.",
    dated3: "The offer on the [Model] runs until [Valid until], so it's worth a look if you're still searching.",
  },
};

// ─── Reading what's stored ───────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, d: string, max = 4000) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").slice(0, max) : d);
const list = <T,>(v: unknown, d: T[], one: (x: unknown) => T | null, max = 60): T[] =>
  Array.isArray(v) ? v.map(one).filter((x): x is T => x != null).slice(0, max) : d;
const choice = (x: unknown): Choice | null => {
  if (!isObj(x) || typeof x.text !== "string") return null;
  const note = typeof x.note === "string" ? x.note.trim().slice(0, 120) : "";
  return note ? { text: str(x.text, ""), note } : { text: str(x.text, "") };
};
const qitem = (x: unknown): QItem | null => (isObj(x) && typeof x.text === "string" ? (x.electricOnly === true ? { text: str(x.text, "", 600), electricOnly: true } : { text: str(x.text, "", 600) }) : null);
const isAngle = (v: unknown): v is Angle => v === "what" || v === "why" || v === "when";
const isFits = (v: unknown): v is Fits => v === "all" || v === "personal" || v === "business-car" || v === "van";

/**
 * The config as the builder uses it: whatever's stored, laid over the
 * standard, one section at a time. Anything missing or the wrong shape is the
 * standard, so a bad row can never stop a message being written.
 */
export function normaliseConfig(raw: unknown): MessageConfig {
  const r = isObj(raw) ? raw : {};
  const D = DEFAULT_CONFIG;
  const at = (o: unknown, k: string | number) => (isObj(o) ? o[String(k)] : undefined);
  const days = {} as MessageConfig["days"];
  const email = {} as MessageConfig["email"];
  const whatsapp = {} as MessageConfig["whatsapp"];
  for (const d of DAYS) {
    const rd = at(r.days, d);
    days[d] = { title: str(at(rd, "title"), D.days[d].title, 40), aim: str(at(rd, "aim"), D.days[d].aim, 80) };
    const re = at(r.email, d);
    email[d] = {
      subject: str(at(re, "subject"), D.email[d].subject, 200),
      template: str(at(re, "template"), D.email[d].template),
      openings: list(at(re, "openings"), D.email[d].openings, choice),
      endings: list(at(re, "endings"), D.email[d].endings, choice),
    };
    const seen = new Set<string>();
    whatsapp[d] = list(at(r.whatsapp, d), D.whatsapp[d], (x) => {
      if (!isObj(x) || typeof x.text !== "string") return null;
      let id = typeof x.id === "string" && x.id ? x.id.slice(0, 40) : "style";
      while (seen.has(id)) id = `${id}-2`;
      seen.add(id);
      return { id, label: str(x.label, "", 60), hint: str(x.hint, "", 120), fits: isFits(x.fits) ? x.fits : "all", text: str(x.text, ""),
        endings: list(x.endings, [], (e) => (typeof e === "string" ? e.slice(0, 600) : null), 20) };
    }, 20);
  }
  const questions = {} as MessageConfig["questions"];
  for (const { key } of QSETS) {
    const rs = at(r.questions, key);
    const ds = D.questions[key];
    const bank = (rb: unknown, db: QBank): QBank => ({ what: list(at(rb, "what"), db.what, qitem), why: list(at(rb, "why"), db.why, qitem), when: list(at(rb, "when"), db.when, qitem) });
    const suggested = {} as QSet["suggested"];
    for (const d of DAYS) {
      const s = at(at(rs, "suggested"), d);
      suggested[d] = { angle: isAngle(at(s, "angle")) ? (at(s, "angle") as Angle) : ds.suggested[d].angle, text: str(at(s, "text"), ds.suggested[d].text, 600) };
    }
    questions[key] = { early: bank(at(rs, "early"), ds.early), late: bank(at(rs, "late"), ds.late), suggested };
  }
  const models: MessageConfig["models"] = {};
  for (const m of MODEL_BASE) {
    const rm = at(r.models, m.key);
    const set = at(rm, "set");
    models[m.key] = {
      label: str(at(rm, "label"), D.models[m.key].label, 40),
      set: typeof set === "string" && SET_KEYS.has(set) ? (set as QSetKey) : D.models[m.key].set,
      electric: typeof at(rm, "electric") === "boolean" ? (at(rm, "electric") as boolean) : D.models[m.key].electric,
    };
  }
  return {
    days, email, whatsapp, questions, models,
    fleet: { 2: str(at(r.fleet, 2), D.fleet[2], 600), 3: str(at(r.fleet, 3), D.fleet[3], 600) },
    offers: { 1: str(at(r.offers, 1), D.offers[1], 600), 2: str(at(r.offers, 2), D.offers[2], 600), 3: str(at(r.offers, 3), D.offers[3], 600), dated3: str(at(r.offers, "dated3"), D.offers.dated3, 600) },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only the sections that differ from the standard: what's stored, so the rest keeps following this file. */
export function configOverrides(cfg: MessageConfig): Record<string, unknown> {
  const D = DEFAULT_CONFIG;
  const out: Record<string, Record<string, unknown> | unknown> = {};
  const part = (name: string, key: string, v: unknown, d: unknown) => {
    if (same(v, d)) return;
    const o = (out[name] ?? {}) as Record<string, unknown>;
    o[key] = v;
    out[name] = o;
  };
  for (const d of DAYS) {
    part("days", String(d), cfg.days[d], D.days[d]);
    part("email", String(d), cfg.email[d], D.email[d]);
    part("whatsapp", String(d), cfg.whatsapp[d], D.whatsapp[d]);
  }
  for (const { key } of QSETS) part("questions", key, cfg.questions[key], D.questions[key]);
  for (const m of MODEL_BASE) part("models", m.key, cfg.models[m.key], D.models[m.key]);
  if (!same(cfg.fleet, D.fleet)) out.fleet = cfg.fleet;
  if (!same(cfg.offers, D.offers)) out.offers = cfg.offers;
  return out;
}

export type ConfigTab = "email" | "whatsapp" | "questions" | "models" | "extras";
export interface Problem { tab: ConfigTab; where: string; text: string }

/** Everything that would stop a message reading properly, before it's saved. */
export function configProblems(cfg: MessageConfig): Problem[] {
  const out: Problem[] = [];
  const add = (tab: ConfigTab, where: string, text: string) => out.push({ tab, where, text });
  const tokens = (tab: ConfigTab, where: string, text: string, allowed: string[]) => {
    const bad = unknownTokens(text, allowed);
    if (bad.length) add(tab, where, `${bad.join(", ")} isn't something it can fill in. It can use ${allowed.map((a) => `[${a}]`).join(", ")}.`);
  };
  const blank = (s: string) => !s.trim();
  for (const d of DAYS) {
    if (blank(cfg.days[d].title)) add("extras", `Day ${d}`, "Give the day a name.");
    const e = cfg.email[d];
    if (blank(e.subject)) add("email", `Day ${d} subject`, "The email needs a subject.");
    tokens("email", `Day ${d} subject`, e.subject, COMMON_TOKENS);
    if (blank(e.template)) add("email", `Day ${d} layout`, "The email layout is empty.");
    tokens("email", `Day ${d} layout`, e.template, EMAIL_TOKENS);
    if (!e.openings.length) add("email", `Day ${d} openings`, "Keep at least one opening.");
    if (!e.endings.length) add("email", `Day ${d} endings`, "Keep at least one ending.");
    e.openings.forEach((o, i) => { if (blank(o.text)) add("email", `Day ${d} opening ${i + 1}`, "This opening is empty."); tokens("email", `Day ${d} opening ${i + 1}`, o.text, COMMON_TOKENS); });
    e.endings.forEach((o, i) => { if (blank(o.text)) add("email", `Day ${d} ending ${i + 1}`, "This ending is empty."); tokens("email", `Day ${d} ending ${i + 1}`, o.text, COMMON_TOKENS); });
    const styles = cfg.whatsapp[d];
    if (!styles.length) add("whatsapp", `Day ${d}`, "Keep at least one WhatsApp style.");
    styles.forEach((s, i) => {
      const where = `Day ${d} ${s.label.trim() || `style ${i + 1}`}`;
      if (blank(s.label)) add("whatsapp", where, "Give the style a name.");
      if (blank(s.text)) add("whatsapp", where, "The message is empty.");
      tokens("whatsapp", where, s.text, WA_TOKENS);
      if (hasToken(s.text, T.ending) && !s.endings.some((x) => !blank(x))) add("whatsapp", where, "It uses [Ending] but has no endings to choose from.");
      s.endings.forEach((x, j) => { if (blank(x)) add("whatsapp", `${where} ending ${j + 1}`, "This ending is empty."); tokens("whatsapp", `${where} ending ${j + 1}`, x, COMMON_TOKENS); });
    });
  }
  for (const { key, label } of QSETS) {
    const s = cfg.questions[key];
    for (const [stage, bank] of [["Day 1 and 2", s.early], ["Day 3", s.late]] as const) {
      if (!ANGLES.some((a) => bank[a].length)) add("questions", `${label}, ${stage}`, "Keep at least one question.");
      for (const a of ANGLES) bank[a].forEach((q, i) => {
        const where = `${label}, ${stage}, ${ANGLE_LABEL[a]} ${i + 1}`;
        if (blank(q.text)) add("questions", where, "This question is empty.");
        tokens("questions", where, q.text, COMMON_TOKENS);
      });
    }
    for (const d of DAYS) {
      if (blank(s.suggested[d].text)) add("questions", `${label}, Day ${d} suggestion`, "The suggested question is empty.");
      tokens("questions", `${label}, Day ${d} suggestion`, s.suggested[d].text, COMMON_TOKENS);
    }
  }
  for (const m of MODEL_BASE) if (blank(cfg.models[m.key].label)) add("models", m.label, "Say how the model reads in a message.");
  tokens("extras", "Fleet question, Day 2", cfg.fleet[2], COMMON_TOKENS);
  tokens("extras", "Fleet question, Day 3", cfg.fleet[3], COMMON_TOKENS);
  for (const k of ["1", "2", "3", "dated3"] as const) {
    const where = k === "dated3" ? "Offer line, Day 3 with a last day" : `Offer line, Day ${k}`;
    const text = cfg.offers[k as keyof MessageConfig["offers"]];
    if (blank(text)) add("extras", where, "The offer line is empty.");
    tokens("extras", where, text, OFFER_TOKENS);
    if (k === "3" && hasToken(text, T.until)) add("extras", where, "This one is for an offer with no last day, so it can't use [Valid until].");
  }
  return out;
}
