// Messages (user, 2026-11-06): the Day 1, 2 and 3 email, WhatsApp and text
// for an unanswered enquiry, built from a few taps. Taken from the TrustFord
// Leasing "Day 2 & Day 3 unanswered enquiry follow up process" and its bespoke
// offer add-on. The exec picks the day, types the customer's first name, picks
// personal or business, the model, a discovery question and the offer, and
// copies. Nothing copies until everything the message needs is in.
//
// Day 1's own guide didn't come through with the others, so Day 1 is written
// from what the Day 2 and Day 3 guide says Day 1 does (thank them, answer their
// question, ask one WHAT, WHY or WHEN question) and its Day 1 examples.
//
// Pure and client-safe. The builder, the offers page and the tests read from here.

import { WHATSAPP_TILE } from "./whatsapp-icon";

export type Day = 1 | 2 | 3;
export type Channel = "email" | "whatsapp" | "text";
export type Who = "personal" | "business";
export type Angle = "what" | "why" | "when";
export const ANGLES: Angle[] = ["what", "why", "when"];
export const ANGLE_LABEL: Record<Angle, string> = { what: "What", why: "Why", when: "When" };

export const DAY_INFO: Record<Day, { title: string; aim: string }> = {
  1: { title: "Day 1", aim: "Introduce and discover" },
  2: { title: "Day 2", aim: "Help and understand" },
  3: { title: "Day 3", aim: "Still looking?" },
};

// ─── Models ──────────────────────────────────────────────────────────────

type Family = "puma" | "kuga" | "explorer" | "capri" | "car" | "ev" | "courier" | "connect" | "custom" | "ecustom" | "ranger" | "van" | "evan";

export interface MsgModel {
  key: string;
  /** As it reads in the message: "the Transit Custom". */
  label: string;
  van: boolean;
  electric: boolean;
  /** Whose questions it gets. */
  family: Family;
}

/** The models a message can be about, cars then vans. The guide's own nine come first in each. */
export const MSG_MODELS: MsgModel[] = [
  { key: "puma", label: "Puma", van: false, electric: false, family: "puma" },
  { key: "kuga", label: "Kuga", van: false, electric: false, family: "kuga" },
  { key: "explorer", label: "Explorer", van: false, electric: true, family: "explorer" },
  { key: "capri", label: "Capri", van: false, electric: true, family: "capri" },
  { key: "puma-gen-e", label: "Puma Gen-E", van: false, electric: true, family: "ev" },
  { key: "mach-e", label: "Mustang Mach-E", van: false, electric: true, family: "ev" },
  { key: "mustang", label: "Mustang", van: false, electric: false, family: "car" },
  { key: "bronco", label: "Bronco", van: false, electric: false, family: "car" },
  { key: "focus", label: "Focus", van: false, electric: false, family: "car" },
  { key: "tourneo-courier", label: "Tourneo Courier", van: false, electric: false, family: "car" },
  { key: "tourneo-connect", label: "Tourneo Connect", van: false, electric: false, family: "car" },
  { key: "tourneo-custom", label: "Tourneo Custom", van: false, electric: false, family: "car" },
  { key: "transit-courier", label: "Transit Courier", van: true, electric: false, family: "courier" },
  { key: "transit-connect", label: "Transit Connect", van: true, electric: false, family: "connect" },
  { key: "transit-custom", label: "Transit Custom", van: true, electric: false, family: "custom" },
  { key: "e-transit-custom", label: "E-Transit Custom", van: true, electric: true, family: "ecustom" },
  { key: "ranger", label: "Ranger", van: true, electric: false, family: "ranger" },
  { key: "transit", label: "Transit", van: true, electric: false, family: "van" },
  { key: "e-transit-courier", label: "E-Transit Courier", van: true, electric: true, family: "evan" },
  { key: "e-transit", label: "E-Transit", van: true, electric: true, family: "evan" },
  { key: "transit-city", label: "Transit City", van: true, electric: true, family: "evan" },
  { key: "explorer-van", label: "Explorer Van", van: true, electric: true, family: "evan" },
];
const BY_KEY = new Map(MSG_MODELS.map((m) => [m.key, m]));
export const msgModel = (key: string | null | undefined) => (key ? BY_KEY.get(key) ?? null : null);
/** The quick picks above the full list. */
export const QUICK_MODELS = ["puma", "kuga", "explorer", "capri", "transit-custom", "ranger"];

/** The message model for whatever was typed on the profile: "Kuga PHEV" is the Kuga, "Ranger Raptor" the Ranger. */
export function msgModelFor(text: string): MsgModel | null {
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
  return hit ? msgModel(hit[1]) : null;
}

// ─── Discovery questions ─────────────────────────────────────────────────

/** A question only for something they'd plug in. */
type Q = string | { t: string; plugIn: true };
interface Bank { what: Q[]; why: Q[]; when: Q[]; suggested: [Angle, string] }
interface Banks { day1: [Angle, string]; early: Bank; late: Bank }

// Word for word from the guide, with {model} where a question names the model
// it's asked about. The guide's Day 2 lists serve Day 1 as well (Day 2 is "a
// different WHAT, WHY or WHEN"), and a profile remembers what it has asked.
// "car", "ev" and "evan" are the Puma, Explorer and E-Transit Custom lists
// with the model's own name in, for the models the guide doesn't cover.
const BANKS: Record<Family | "bizcar", Banks> = {
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
    day1: ["why", "What caught your eye about the {model}?"],
    early: {
      what: [
        "Have you got a particular {model} spec or colour in mind, or are you fairly open?",
        "Is there anything you'd definitely want on your new {model}?",
        "Would you consider a different {model} spec if it worked out better value?",
        "Are you set on the {model} or looking at anything else as well?",
      ],
      why: [
        "What are you driving at the moment? Just wondering what you're moving from.",
        "Is there anything about your current car you're looking to improve on?",
        "Was it the {model} itself or the monthly rental that caught your eye?",
      ],
      when: [
        "Is your current car coming to the end of its agreement?",
        "Are you hoping to change fairly soon or planning ahead?",
        "Would you rather have something available sooner or wait for a particular spec?",
        "Have you got a rough date in mind for changing?",
      ],
      suggested: ["what", "Have you got a particular {model} spec or colour in mind, or are you fairly open? Just want to make sure I'm looking at the right options for you."],
    },
    late: {
      what: [
        "Are you still looking at the {model}, or have you started considering anything else?",
        "Have you managed to narrow down which {model} you'd like?",
        "Is there anything specific you're still trying to find out about the {model}?",
        "Would it help if I looked at a couple of different {model} options for you?",
      ],
      why: [
        "Is there anything that's making you unsure about changing at the moment?",
        "Have you found something else you prefer?",
        "Are you mainly comparing prices, or still deciding which car to go for?",
        "Is there anything I can help clear up about the {model}?",
      ],
      when: [
        "Are you still hoping to change soon, or is it something for later in the year?",
        "Is your current car due to go back soon?",
        "Would you be looking to get something sorted now if the figures worked?",
        "Would it be better if I picked this back up with you nearer the time?",
      ],
      suggested: ["what", "Are you still looking at the {model}, or have you found something else?"],
    },
  },
  ev: {
    day1: ["why", "What made you start looking at electric cars?"],
    early: {
      what: [
        "Would you be able to charge at home, or would you mainly use public chargers?",
        "Have you got a particular {model} spec in mind?",
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
      suggested: ["why", "Have you driven electric before, or would the {model} be your first? Just helps me understand what would be most useful to go through with you."],
    },
    late: {
      what: [
        "Are you still looking at the {model}, or have you considered a few other electric cars?",
        "Is there anything about electric driving you'd like me to help with?",
        "Is there anything about the {model}'s spec or charging you're unsure on?",
      ],
      why: [
        "Are you still thinking about making the switch to electric?",
        "Is there anything putting you off going electric?",
        "Are you comparing the {model} against other electric cars?",
        "Have you decided to stay with petrol or diesel for now?",
      ],
      when: [
        "Are you still hoping to go electric soon?",
        "Is this something you're looking to do now or further down the line?",
        "Would you be ready to move forward if we found the right {model}?",
        "Would it be better to pick this up closer to when your current car is due back?",
      ],
      suggested: ["why", "Are you still thinking about going electric with the {model}, or have you decided to leave it for now?"],
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
        "Is the business still looking for a {model}, or has something else been agreed?",
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
      suggested: ["what", "Is the business still looking to get the {model} sorted, or has the plan changed? Just want to make sure I'm not chasing you for something you've already dealt with."],
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
        "Are you comparing the {model} against diesel as well?",
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
        "Are you still considering the {model}, or have you decided to stick with diesel?",
        "Is there anything about electric vans you're still unsure on?",
        "Have you managed to work out whether electric would suit your daily mileage?",
      ],
      why: [
        "Are you still thinking about making the switch to electric?",
        "Is charging or range making you unsure?",
        "Have you decided to keep diesel for the moment?",
        "Is there anything about the {model} you'd like me to go through?",
      ],
      when: [
        "Are you still looking to move to electric soon?",
        "Is this something you're planning for later in the year?",
        "Would you need charging sorted before going ahead?",
        "Has the replacement date for your current van changed?",
      ],
      suggested: ["what", "Are you still thinking about the {model}, or have you decided to stick with diesel for now? Happy to talk through either option."],
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

export interface QuestionOption { angle: Angle; text: string; suggested: boolean }

/** Business cars share one list (the guide: "across Puma, Kuga, Explorer and Capri"); everything else has its own. */
const banksFor = (who: Who, m: MsgModel) => BANKS[who === "business" && !m.van ? "bizcar" : m.family];

const stem = (s: string) => s.toLowerCase().replace(/[?.!]+$/, "").trim();

/**
 * The questions for this day, model and customer, What then Why then When,
 * with the guide's suggested one marked. Where the suggestion is a fuller
 * version of a listed question it takes that question's place.
 */
export function questionsFor(day: Day, who: Who, m: MsgModel): QuestionOption[] {
  const b = banksFor(who, m);
  const bank = day === 3 ? b.late : b.early;
  const [sAngle, sText] = day === 1 ? b.day1 : bank.suggested;
  const plugIn = m.electric || m.key === "kuga";
  const fill = (s: string) => s.replaceAll("{model}", m.label);
  const out: QuestionOption[] = [];
  for (const angle of ANGLES) {
    const items = bank[angle]
      .filter((q) => typeof q === "string" || plugIn)
      .map((q) => fill(typeof q === "string" ? q : q.t));
    const list: QuestionOption[] = items.map((text) => ({ angle, text, suggested: false }));
    if (angle === sAngle) {
      const s = fill(sText);
      const at = list.findIndex((q) => stem(s).startsWith(stem(q.text)));
      if (at >= 0) list[at] = { angle, text: s, suggested: true };
      else list.unshift({ angle, text: s, suggested: true });
    }
    out.push(...list);
  }
  return out;
}

/** Offered for a business: the guide's wider fleet question. Day 2 and Day 3 only. */
export function fleetLine(day: Day, m: MsgModel): string | null {
  if (day === 2) return "Out of interest, do you normally replace your vehicles individually, or have you got a few coming up for renewal together?";
  if (day === 3) return `Even if this particular ${m.van ? "van" : "car"} has been sorted, have you got anything else coming up for renewal that we could help with?`;
  return null;
}

// ─── How the messages read ───────────────────────────────────────────────

/** {first} the customer, {exec} the exec's first name, {model}, {vehicle} car or van. */
interface Opening { lines: string[]; note?: string }
interface Ending { line: string; noContact?: boolean }
interface EmailDay { subject: string; openings: Opening[]; endings: Ending[]; contact: string }

const AGAIN = "It's {exec} from TrustFord Leasing again.";
const EMAIL: Record<Day, EmailDay> = {
  1: {
    subject: "Your Ford {model} enquiry",
    openings: [
      { lines: ["Thanks for your enquiry on the {model}! It's {exec} from TrustFord Leasing, and I'll be looking after you.", "I've just tried giving you a quick call, so thought I'd drop you an email as well."] },
      { lines: ["It's {exec} from TrustFord Leasing. Thanks for getting in touch about the {model}!", "I've just tried giving you a quick call, so thought I'd send a quick email instead."] },
    ],
    endings: [
      { line: "Let me know and I'll start looking at the best options for you." },
      { line: "Drop me a reply when you get a chance." },
      { line: "Happy to help with any questions you've got." },
    ],
    contact: "Feel free to reply here, call me or drop me a WhatsApp.",
  },
  2: {
    subject: "Your Ford {model} enquiry",
    openings: [
      { lines: [AGAIN, "I've just tried giving you another quick call about your {model} enquiry.", "I wanted to see if I could help you narrow down the best options."] },
      { lines: [AGAIN, "Just following up on your {model} enquiry from yesterday."] },
      { lines: [AGAIN, "I've just tried catching you again about the {model}."] },
      { lines: [AGAIN, "Just wanted to come back to you about the {model} you'd enquired on."] },
      { lines: ["It's {exec} from TrustFord Leasing again. Thought I'd drop you a quick email about the {model}."] },
      { lines: [AGAIN, "Just wanted to see if I could help you narrow down the right {model}."] },
      { lines: [AGAIN, "I've been looking at your enquiry and wanted to check something with you."], note: "only if you've reviewed it" },
    ],
    endings: [
      { line: "If you can let me know, I'll have a look at what would work best for you." },
      { line: "Let me know and I'll have a look at what would suit you best." },
      { line: "If you can let me know, I'll take a look at the options." },
      { line: "Drop me a reply when you get a chance." },
      { line: "Happy to have a look at a few options for you." },
      { line: "No need to call if you're busy, just reply here and I'll help where I can.", noContact: true },
    ],
    contact: "Feel free to reply here, call me or drop me a WhatsApp.",
  },
  3: {
    subject: "Still looking at the Ford {model}?",
    openings: [
      { lines: ["It's {exec} from TrustFord Leasing.", "I've tried catching you a couple of times about your {model} enquiry, so thought I'd drop you another email.", "Just wanted to check where you're up to with your search."] },
      { lines: ["It's {exec} from TrustFord Leasing.", "Just wanted to see where you're up to with the {model}."] },
      { lines: ["It's {exec} from TrustFord Leasing.", "I've tried catching you a couple of times, so thought I'd send a quick email instead."] },
      { lines: ["It's {exec} from TrustFord Leasing.", "Just checking back in about your {model} enquiry."] },
      { lines: ["It's {exec} from TrustFord Leasing.", "Not sure if you're still looking at the {model} or have already got something sorted?"] },
      { lines: ["It's {exec} from TrustFord Leasing.", "Just wanted to make sure you had everything you needed from us regarding the {model}."] },
      { lines: ["It's {exec} from TrustFord Leasing.", "I've not managed to catch you yet, so thought I'd see if email was easier."] },
    ],
    endings: [
      { line: "No problem at all if you're still looking around or aren't quite ready yet. Just helps me know what would be most useful for you." },
      { line: "No problem either way, just let me know." },
      { line: "Happy to help whenever you're ready." },
      { line: "If you're still looking, I'll see what we can do for you." },
      { line: "Even if you're just comparing options, I'm happy to help." },
      { line: "Just drop me a reply when you get a chance.", noContact: true },
      { line: "If you've already got something sorted, that's absolutely fine too." },
    ],
    contact: "Feel free to reply here or give me a call when you get a minute.",
  },
};

export interface WaStyle {
  id: string;
  label: string;
  /** Paragraphs. "@slots" is the offer, the answer and their own line; "@question", "@fleet", "@ending". */
  blocks: string[];
  /** The style asks its own question, so no discovery question is needed. */
  ownQuestion?: boolean;
  endings?: string[];
  /** Only offered when this holds. */
  fits?: (who: Who, m: MsgModel) => boolean;
  hint?: string;
}

const D2_END = ["Let me know and I'll take a look 👍", "Drop me a reply when you get a minute.", "Happy to look at a few options for you.", "Just let me know what you're thinking.", "Give me a shout when you get a chance."];

const WA: Record<Day, WaStyle[]> = {
  1: [
    { id: "standard", label: "Standard", blocks: ["Hi {first} 👋", "It's {exec} from TrustFord Leasing. Thanks for your enquiry on the {model}!", "@slots", "@question", "@ending", "{exec}"],
      endings: ["Drop me a message when you get a chance 👍", "Let me know when you get a minute 👍", "Happy to help with any questions you've got 👍"] },
    { id: "short", label: "Shorter", blocks: ["Hi {first}, it's {exec} from TrustFord Leasing 👋", "Thanks for your enquiry on the {model}!", "@slots", "@question", "@ending"],
      endings: ["Thanks, {exec}", "Drop me a message when you get a chance 👍"] },
  ],
  2: [
    { id: "standard", label: "Standard", blocks: ["Hi {first} 👋", AGAIN, "Just tried giving you another quick call about the {model}.", "@slots", "@question", "@fleet", "@ending", "{exec}"],
      endings: ["Let me know when you get a minute and I'll have a look at the options for you 👍", ...D2_END] },
    { id: "short", label: "Shorter", blocks: ["Hi {first}, it's {exec} from TrustFord Leasing again 👋", "Just wanted to check something on your {model} enquiry.", "@slots", "@question", "@fleet", "@ending"],
      endings: ["Let me know when you get a chance 👍", ...D2_END] },
  ],
  3: [
    { id: "standard", label: "Standard", blocks: ["Hi {first} 👋", AGAIN, "Just checking where you're up to with the {model}?", "@slots", "@question", "@fleet", "@ending", "{exec}"],
      endings: ["No problem either way, just let me know 👍", "Happy to help if you're still looking 👍", "No problem either way 👍"] },
    { id: "short", label: "Shorter", ownQuestion: true, blocks: ["Hi {first}, it's {exec} from TrustFord Leasing.", "Just checking if you're still looking at the {model} or have got something sorted?", "@slots", "@fleet", "No problem either way 👍"] },
    { id: "later", label: "Not caught you yet", ownQuestion: true, blocks: ["Hi {first} 👋", "Not managed to catch you yet about the {model}.", "Are you still looking to change, or is it something you're leaving until later?", "@slots", "@fleet", "Thanks, {exec}"] },
    { id: "easy-a", label: "Easy reply: still looking?", ownQuestion: true, fits: (w) => w === "personal", hint: "For someone who hasn't replied to anything",
      blocks: ["Hi {first}, it's {exec} from TrustFord Leasing 👋", "Just checking where you're up to with the {model}.", "Still looking, leaving it until later, or got something sorted?", "@slots", "No problem either way 👍"] },
    { id: "easy-b", label: "Easy reply: plan changed?", ownQuestion: true, fits: (w, m) => w === "business" && !m.van, hint: "For someone who hasn't replied to anything",
      blocks: ["Hi {first}, just checking back in about the {model}.", "Is the business still looking to get something ordered, or has the plan changed?", "@slots", "@fleet", "Thanks, {exec}"] },
    { id: "easy-c", label: "Easy reply: van sorted?", ownQuestion: true, fits: (_w, m) => m.van, hint: "For someone who hasn't replied to anything",
      blocks: ["Hi {first}, it's {exec} from TrustFord Leasing.", "Just checking if you're still looking for a {model}, or have managed to get a van sorted?", "@slots", "@fleet", "Give me a shout 👍"] },
    { id: "easy-d", label: "Easy reply: timing", ownQuestion: true, hint: "For someone who hasn't replied to anything",
      blocks: ["Hi {first}, just wanted to check if you're still looking to change your {vehicle} soon, or is it something for further down the line?", "@slots", "Happy to help either way 👍"] },
    { id: "easy-e", label: "Easy reply: comparing quotes", ownQuestion: true, hint: "For someone who hasn't replied to anything",
      blocks: ["Hi {first}, just checking if you're still comparing quotes on the {model}?", "If you are, happy to have a look at the figures with you.", "@slots", "Thanks, {exec}"] },
    { id: "easy-f", label: "Easy reply: no pressure", ownQuestion: true, hint: "For someone who hasn't replied to anything",
      blocks: ["Hi {first}, not managed to catch you yet about the {model}.", "No rush if you're just looking around. Just wanted to see if there's anything you need from me?", "@slots", "Thanks, {exec}"] },
  ],
};

export interface Vars { first: string; exec: string; model: string; van: boolean }
/** Fills in the customer, the exec and the model. */
export const fillVars = (s: string, v: Vars) =>
  s.replaceAll("{first}", v.first).replaceAll("{exec}", v.exec).replaceAll("{model}", v.model).replaceAll("{vehicle}", v.van ? "van" : "car");

/** The email openings and endings to choose from, as they'll read (less the "It's Freddy" line they all share). */
export function emailChoices(day: Day, v: Vars) {
  const d = EMAIL[day];
  return {
    openings: d.openings.map((o) => ({ text: fillVars(o.lines.filter((l) => l !== AGAIN && l !== "It's {exec} from TrustFord Leasing.").join(" "), v), note: o.note ?? null })),
    endings: d.endings.map((e) => fillVars(e.line, v)),
  };
}

/** The WhatsApp styles that suit this customer. */
export function waStyles(day: Day, who: Who | null, m: MsgModel | null): WaStyle[] {
  return WA[day].filter((s) => !s.fits || (who && m && s.fits(who, m)));
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

/** The standard line for each day. [Model], [Offer] and [Valid until] are filled in. */
export const OFFER_LINES: Record<Day, string> = {
  1: "Good news, the [Model] you've enquired on is actually part of one of our bespoke offers at the moment, so it's a really good time to be looking! [Offer]",
  2: "I also wanted to make sure you'd seen the offer we've got on the [Model] at the moment. [Offer]",
  3: "The offer on the [Model] is still running at the moment, so it's worth a look if you're still searching.",
};
const OFFER_DAY3_DATED = "The offer on the [Model] runs until [Valid until], so it's worth a look if you're still searching.";

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
export function offerLine(o: MessageOffer, day: Day, modelLabel: string): string {
  const own = (day === 1 ? o.day1 : day === 2 ? o.day2 : o.day3).trim();
  const tpl = own || (day === 3 && o.validUntil ? OFFER_DAY3_DATED : OFFER_LINES[day]);
  return tpl
    .replace(/\[model\]/gi, modelLabel)
    .replace(/\[offer\]/gi, sentence(o.offer))
    .replace(/\[valid until\]/gi, o.validUntil ? longDate(o.validUntil) : "")
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
    if (/\[valid until\]/i.test(line) && !o.validUntil) out.push(`Day ${i + 1} uses [Valid until], so it needs an end date.`);
    const unknown = (line.match(/\[[^\]]*\]/g) ?? []).filter((t) => !/^\[(model|offer|valid until)\]$/i.test(t));
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
}

/** A missing piece in the preview. Never copied: nothing copies while anything's missing. */
export const gap = (label: string) => `⟦${label}⟧`;
export const GAP_RE = /⟦([^⟧]+)⟧/g;

const ownQuestionText = (s: string) => { const t = s.trim(); return t && !/[?.!]$/.test(t) ? `${t}?` : t; };

export function buildMessage(input: MsgInput, sender: Sender, offers: MessageOffer[], today: string): Built {
  const m = msgModel(input.modelKey);
  const day = input.day ?? 1;
  const missing: Missing[] = [];
  const need = (key: MissingKey, text: string) => missing.push({ key, text });

  if (!input.day) need("day", "Pick Day 1, 2 or 3");
  if (!input.first.trim()) need("first", "Add the customer's first name");
  if (!input.who) need("who", "Choose personal or business");
  if (!m) need("model", "Choose the model");

  const styles = waStyles(day, input.who, m);
  const style = styles.find((s) => s.id === input.waStyle) ?? styles[0];
  const isWa = input.channel !== "email";
  const styleAsks = isWa && !!style.ownQuestion;

  // The discovery question.
  const options = m && input.who ? questionsFor(day, input.who, m) : [];
  let question: string | null = null;
  if (!styleAsks) {
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
  const model = m?.label ?? gap("model");
  const fill = (s: string) => fillVars(s, { first, exec: execFirst, model, van: !!m?.van });

  const slots = [offer && m ? offerLine(offer, day, m.label) : null, answer, input.extra.trim() || null].filter((x): x is string => !!x);
  const fleet = input.fleet && input.who === "business" && m ? fleetLine(day, m) : null;
  const q = question ?? (styleAsks ? null : gap("discovery question"));

  if (input.channel === "email") {
    const d = EMAIL[day];
    const opening = d.openings[Math.min(input.emailOpening, d.openings.length - 1)];
    const ending = d.endings[Math.min(input.emailEnding, d.endings.length - 1)];
    if (!sender.landline.trim() || !isUkPhone(sender.landline)) need("landline", "Add your landline under Your details");
    if (!sender.mobile.trim() || !isUkMobile(sender.mobile)) need("mobile", "Add your mobile under Your details");
    const paras = [
      `Hi ${first},`,
      ...opening.lines.map(fill),
      ...slots,
      ...(q ? [q] : []),
      ...(fleet ? [fleet] : []),
      fill(ending.line),
      ...(ending.noContact ? [] : [d.contact]),
      "Thanks,",
    ];
    const waHref = waLink(sender.mobile, `Hi ${execFirst}, it's ${first} about the ${model}.`);
    const signature = [
      sender.name.trim() || gap("your name"),
      "TrustFord Leasing",
      `Tel: ${sender.landline.trim() || gap("landline")}`,
      `Mobile: ${sender.mobile.trim() || gap("mobile")}`,
      `Email: ${sender.email}`,
    ];
    const subject = fill(d.subject);
    const text = [...paras, signature.join("\n"), waHref ? `Message me on WhatsApp: ${waHref}` : ""].filter(Boolean).join("\n\n");
    return { subject, paras, signature, text, html: emailHtml(paras, signature, waHref), waHref, missing, asks: question };
  }

  // WhatsApp, or a text: the same message, a text without the emoji.
  const endings = style.endings ?? [];
  const ending = endings.length ? endings[Math.min(input.waEnding, endings.length - 1)] : null;
  const paras = style.blocks.flatMap((b) => {
    if (b === "@slots") return slots;
    if (b === "@question") return q ? [q] : [];
    if (b === "@fleet") return fleet ? [fleet] : [];
    if (b === "@ending") return ending ? [fill(ending)] : [];
    return [fill(b)];
  });
  const shown = input.channel === "text" ? paras.map(forText) : paras;
  return { subject: null, paras: shown, signature: null, text: shown.join("\n\n"), html: null, waHref: null, missing, asks: question };
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
