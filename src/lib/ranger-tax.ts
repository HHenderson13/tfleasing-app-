// Ranger BIK Calculator: the vehicles, the tax year's rates and the maths.
// Pure and client-safe: the page runs it live, the PDF prints its rows and
// workings, and the tests pin it.
//
// Why a Ranger is a car or a van (HMRC EIM23151, CA23511, user 2026-11-04):
//   - From 6 April 2025 (1 April for corporation tax) a double cab pick-up is
//     a CAR for benefit in kind, capital allowances and the lease restriction,
//     whatever its payload.
//   - The Ranger 2-Seat (XLT and Wildtrak, 3.0 diesel and 2.3 PHEV) has no
//     second row of seats, so it stays a VAN. Same list price and CO2 as the
//     5-seat.
//   - VAT and road tax are unchanged by the April 2025 rule. A double cab
//     with a payload of one tonne or more is still a commercial vehicle for
//     VAT. The Raptor's payload is under one tonne, so it is a car for VAT as
//     well: half the VAT on a car lease can't be reclaimed, and none on a
//     purchase.
//
// Money is worked in pence-rounded steps, so every line of the workings
// multiplies out exactly as printed.

// ─── The range, from Ford's price lists ────────────────────────────────────

export type RangerTrim = "XLT" | "Limited" | "Wildtrak" | "Platinum" | "MS-RT" | "Raptor";
export type RangerFuel = "diesel" | "phev" | "petrol";
export type Seats = 5 | 2;

export interface RangerVersion {
  id: string;
  trim: RangerTrim;
  fuel: RangerFuel;
  /** How it reads in a name: "3.0 V6 diesel". */
  engineShort: string;
  /** As the price list gives it. */
  engine: string;
  /** WLTP, g/km. For a PHEV, the weighted figure. */
  co2: number;
  /** Equivalent all-electric range, miles (PHEV only). Only counts for CO2 of 50 g/km or less. */
  electricRangeMiles: number | null;
  basicExVat: number;
  basicIncVat: number;
  /** Ford's "on the road" price incl. VAT: basic + delivery + plates + first year VED + first registration fee. */
  otrIncVat: number;
  /** Maximum payload from the price list, kg. Null where the list doesn't give one. */
  payloadKg: number | null;
  /** Payload under one tonne: a car for VAT. The Raptor. */
  payloadUnderTonne: boolean;
  /** Ford build a 2-Seat version, taxed as a van. */
  twoSeat: boolean;
  source: string;
}

/** What Ford adds to the basic price to make "on the road" (both lists, effective 5 February 2026). */
export const OTR_ITEMS = {
  deliveryExVat: 920, deliveryIncVat: 1104,
  platesExVat: 20.83, platesIncVat: 25,
  vedFirstYear: 345, firstRegFee: 55,
} as const;

const RANGER_LIST = "Ford Ranger 26.5MY price list, effective 5 February 2026";
const RAPTOR_LIST = "Ford Ranger Raptor 26.5MY price list, effective 5 February 2026";
const V6_DIESEL = "3.0L TD EcoBlue V6 240PS, 10-speed automatic, 4WD";
const PHEV = "2.3 EcoBoost 281PS plug-in hybrid, 10-speed automatic, 4WD";

export const RANGERS: RangerVersion[] = [
  { id: "xlt-diesel", trim: "XLT", fuel: "diesel", engineShort: "3.0 V6 diesel", engine: V6_DIESEL, co2: 272, electricRangeMiles: null,
    basicExVat: 36250, basicIncVat: 43500, otrIncVat: 45029, payloadKg: 1098, payloadUnderTonne: false, twoSeat: true, source: RANGER_LIST },
  { id: "xlt-phev", trim: "XLT", fuel: "phev", engineShort: "2.3 PHEV", engine: PHEV, co2: 71, electricRangeMiles: 26,
    basicExVat: 36700, basicIncVat: 44040, otrIncVat: 45569, payloadKg: 1071, payloadUnderTonne: false, twoSeat: true, source: RANGER_LIST },
  { id: "limited-phev", trim: "Limited", fuel: "phev", engineShort: "2.3 PHEV", engine: PHEV, co2: 70, electricRangeMiles: 26,
    basicExVat: 42900, basicIncVat: 51480, otrIncVat: 53009, payloadKg: 1058, payloadUnderTonne: false, twoSeat: false, source: RANGER_LIST },
  { id: "wildtrak-diesel", trim: "Wildtrak", fuel: "diesel", engineShort: "3.0 V6 diesel", engine: V6_DIESEL, co2: 269, electricRangeMiles: null,
    basicExVat: 46750, basicIncVat: 56100, otrIncVat: 57629, payloadKg: 1084, payloadUnderTonne: false, twoSeat: true, source: RANGER_LIST },
  { id: "wildtrak-phev", trim: "Wildtrak", fuel: "phev", engineShort: "2.3 PHEV", engine: PHEV, co2: 70, electricRangeMiles: 26,
    basicExVat: 44900, basicIncVat: 53880, otrIncVat: 55409, payloadKg: 1067, payloadUnderTonne: false, twoSeat: true, source: RANGER_LIST },
  { id: "platinum-diesel", trim: "Platinum", fuel: "diesel", engineShort: "3.0 V6 diesel", engine: V6_DIESEL, co2: 273, electricRangeMiles: null,
    basicExVat: 48800, basicIncVat: 58560, otrIncVat: 60089, payloadKg: 1054, payloadUnderTonne: false, twoSeat: false, source: RANGER_LIST },
  { id: "platinum-phev", trim: "Platinum", fuel: "phev", engineShort: "2.3 PHEV", engine: PHEV, co2: 71, electricRangeMiles: 26,
    basicExVat: 46950, basicIncVat: 56340, otrIncVat: 57869, payloadKg: 1061, payloadUnderTonne: false, twoSeat: false, source: RANGER_LIST },
  { id: "msrt-diesel", trim: "MS-RT", fuel: "diesel", engineShort: "3.0 V6 diesel", engine: V6_DIESEL, co2: 277, electricRangeMiles: null,
    basicExVat: 51650, basicIncVat: 61980, otrIncVat: 63509, payloadKg: 1088, payloadUnderTonne: false, twoSeat: false, source: RANGER_LIST },
  { id: "raptor-petrol", trim: "Raptor", fuel: "petrol", engineShort: "3.0 V6 petrol", engine: "3.0L EcoBoost V6 292PS, 10-speed automatic, 4WD", co2: 315, electricRangeMiles: null,
    basicExVat: 51650, basicIncVat: 61980, otrIncVat: 63509, payloadKg: null, payloadUnderTonne: true, twoSeat: false, source: RAPTOR_LIST },
];

export const TRIMS: RangerTrim[] = ["XLT", "Limited", "Wildtrak", "Platinum", "MS-RT", "Raptor"];

export const rangerById = (id: string): RangerVersion | undefined => RANGERS.find((r) => r.id === id);
export const versionsOfTrim = (trim: RangerTrim) => RANGERS.filter((r) => r.trim === trim);

/** "Wildtrak 2-Seat 3.0 V6 diesel". */
export const rangerName = (v: RangerVersion, seats: Seats) => `${v.trim}${seats === 2 ? " 2-Seat" : ""} ${v.engineShort}`;

// ─── Factory options, from the same price lists ────────────────────────────
//
// Only the options with a charge: a £0 option can't move a P11D value. Each
// is Ford's list price incl. VAT, which is what the P11D value takes, for the
// trims (and engines) the list offers it on. A choose-one group holds at most
// one: one colour, one wheel pack, one load cover and so on.

export type OptionGroup = "paint" | "wheels" | "styling" | "cover" | "loadbox" | "towing" | "assist" | "other";

export const OPTION_GROUPS: { key: OptionGroup; label: string; one: boolean }[] = [
  { key: "paint", label: "Colour", one: true },
  { key: "wheels", label: "Wheels and tyres", one: true },
  { key: "styling", label: "Styling pack", one: true },
  { key: "cover", label: "Load cover", one: true },
  { key: "loadbox", label: "Load box", one: true },
  { key: "towing", label: "Towing", one: false },
  { key: "assist", label: "Driver assistance upgrade", one: true },
  { key: "other", label: "Other options", one: false },
];

export interface RangerOption {
  id: string;
  /** Ford's WERS code. */
  code: string;
  name: string;
  exVat: number;
  incVat: number;
  group: OptionGroup;
  trims: RangerTrim[];
  /** Only on these engines; every engine when absent. */
  fuels?: RangerFuel[];
  note?: string;
}

const ALL5: RangerTrim[] = ["XLT", "Limited", "Wildtrak", "Platinum", "MS-RT"];
const NOT_MSRT: RangerTrim[] = ["XLT", "Limited", "Wildtrak", "Platinum"];
const TOW_PREP = "An upgrade with the trailer tow prep pack";

export const RANGER_OPTIONS: RangerOption[] = [
  // Colour & trim (Ranger list page 16, SVO page 17; Raptor list page 11)
  { id: "PN4GM", code: "PN4GM", name: "Agate Black", exVat: 600, incVat: 720, group: "paint", trims: ALL5 },
  { id: "PN4HJ", code: "PN4HJ", name: "Iconic Silver", exVat: 600, incVat: 720, group: "paint", trims: ALL5 },
  { id: "PN4JA", code: "PN4JA", name: "Carbonised Grey", exVat: 600, incVat: 720, group: "paint", trims: ALL5 },
  { id: "PN4E3", code: "PN4E3", name: "Blue Lightning", exVat: 600, incVat: 720, group: "paint", trims: ["XLT", "Limited"] },
  { id: "PMYH5", code: "PMYH5", name: "Command Grey", exVat: 600, incVat: 720, group: "paint", trims: ["Limited", "MS-RT"] },
  { id: "PN4HQ", code: "PN4HQ", name: "Lucid Red", exVat: 600, incVat: 720, group: "paint", trims: ["XLT", "Limited", "Platinum"] },
  { id: "PN3MC", code: "PN3MC", name: "Ignite Orange", exVat: 600, incVat: 720, group: "paint", trims: ["Wildtrak"] },
  { id: "PASC9", code: "PASC9", name: "Acacia Green", exVat: 600, incVat: 720, group: "paint", trims: ["Platinum"] },
  { id: "PSTDQ", code: "PSTDQ", name: "Fast Blue", exVat: 625, incVat: 750, group: "paint", trims: ["MS-RT"] },
  { id: "PSTRP", code: "PSTRP", name: "Yellow Green", exVat: 625, incVat: 750, group: "paint", trims: ["MS-RT"] },
  { id: "PSVGF", code: "PSVGF", name: "Turini Purple", exVat: 625, incVat: 750, group: "paint", trims: ["MS-RT"] },
  { id: "AB7AB", code: "AB7AB", name: "Special order paint (50 vehicle minimum)", exVat: 1000, incVat: 1200, group: "paint", trims: ["XLT", "Limited"] },
  { id: "PNZAT", code: "PNZAT", name: "Absolute Black", exVat: 600, incVat: 720, group: "paint", trims: ["Raptor"] },
  { id: "PN4E3-R", code: "PN4E3", name: "Blue Lightning", exVat: 600, incVat: 720, group: "paint", trims: ["Raptor"] },
  { id: "PMYHR", code: "PMYHR", name: "Meteor Grey", exVat: 600, incVat: 720, group: "paint", trims: ["Raptor"] },
  { id: "PMYH5-R", code: "PMYH5", name: "Command Grey", exVat: 600, incVat: 720, group: "paint", trims: ["Raptor"] },
  { id: "PN4JP", code: "PN4JP", name: "Code Orange", exVat: 600, incVat: 720, group: "paint", trims: ["Raptor"] },

  // Wheel packs (page 11): by trim and engine
  { id: "J4YAS", code: "J4YAS", name: "All terrain tyres (Wheel Pack 17)", exVat: 300, incVat: 360, group: "wheels", trims: ["XLT"], fuels: ["diesel"] },
  { id: "J4YB4-XLT", code: "J4YB4", name: "All terrain tyres and spare wheel (Wheel Pack 72)", exVat: 800, incVat: 960, group: "wheels", trims: ["XLT"], fuels: ["phev"] },
  { id: "J4YB4", code: "J4YB4", name: "All terrain tyres and spare wheel (Wheel Pack 72)", exVat: 300, incVat: 360, group: "wheels", trims: ["Limited", "Wildtrak"], fuels: ["phev"] },
  { id: "J4YBQ", code: "J4YBQ", name: "All terrain tyres (Wheel Pack 39)", exVat: 300, incVat: 360, group: "wheels", trims: ["Wildtrak"], fuels: ["diesel"] },
  { id: "J4YAW", code: "J4YAW", name: "20 inch alloy wheels (Wheel Pack 21)", exVat: 750, incVat: 900, group: "wheels", trims: ["Wildtrak"], fuels: ["diesel"] },
  { id: "J4YBS", code: "J4YBS", name: "All terrain tyres and spare wheel (Wheel Pack 41)", exVat: 300, incVat: 360, group: "wheels", trims: ["Platinum"], fuels: ["phev"] },

  // Styling packs (page 10)
  { id: "AACD7", code: "AACD7", name: "Adjustable sports bar styling pack", exVat: 1600, incVat: 1920, group: "styling", trims: ["Wildtrak"] },
  { id: "AACE2", code: "AACE2", name: "Adjustable sports bar styling pack", exVat: 1600, incVat: 1920, group: "styling", trims: ["Platinum"] },

  // Load covers (pages 12 and 13)
  { id: "A9BAC", code: "A9BAC", name: "Hardtop canopy (black, white or grey)", exVat: 2250, incVat: 2700, group: "cover", trims: NOT_MSRT },
  { id: "A9BAH", code: "A9BAH", name: "Hardtop canopy, Frozen White, gullwing doors", exVat: 2000, incVat: 2400, group: "cover", trims: NOT_MSRT },
  { id: "A9BAF", code: "A9BAF", name: "Hardtop canopy, matt black, gullwing doors", exVat: 2000, incVat: 2400, group: "cover", trims: NOT_MSRT },
  { id: "A5BAC", code: "A5BAC", name: "Load bars and manual roller shutter", exVat: 1750, incVat: 2100, group: "cover", trims: ALL5 },
  { id: "CHBAN", code: "CHBAN", name: "Manual roller shutter", exVat: 1500, incVat: 1800, group: "cover", trims: ALL5 },
  { id: "CHBAP", code: "CHBAP", name: "Power roller shutter", exVat: 2000, incVat: 2400, group: "cover", trims: ["Limited", "Wildtrak", "Platinum", "MS-RT"] },
  { id: "CHBAM", code: "CHBAM", name: "Soft tonneau cover", exVat: 750, incVat: 900, group: "cover", trims: ["XLT", "Limited"], fuels: ["phev"] },

  // Load box packs (page 12)
  { id: "ADQAG", code: "ADQAG", name: "Cargo convenience pack", exVat: 150, incVat: 180, group: "loadbox", trims: NOT_MSRT },
  { id: "ADQAH", code: "ADQAH", name: "Cargo pack with 2.3kW Pro Power Onboard", exVat: 1200, incVat: 1440, group: "loadbox", trims: NOT_MSRT, fuels: ["phev"] },
  { id: "ADQAJ", code: "ADQAJ", name: "Cargo pack with 6.9kW Pro Power Onboard", exVat: 1750, incVat: 2100, group: "loadbox", trims: NOT_MSRT, fuels: ["phev"] },
  { id: "ADQAN", code: "ADQAN", name: "Bed utility pack", exVat: 350, incVat: 420, group: "loadbox", trims: ALL5, fuels: ["diesel"] },
  { id: "A9SAG", code: "A9SAG", name: "Spray-in load box bedliner", exVat: 500, incVat: 600, group: "loadbox", trims: ["XLT", "Wildtrak", "Platinum", "MS-RT"], fuels: ["diesel"] },

  // Towing (page 14)
  { id: "C1CAU", code: "C1CAU", name: "Towing pack 5 (wiring)", exVat: 550, incVat: 660, group: "towing", trims: ["XLT", "Limited"] },
  { id: "C1CAH", code: "C1CAH", name: "Trailer tow prep pack", exVat: 400, incVat: 480, group: "towing", trims: ALL5 },

  // Driver assistance upgrades (pages 14 and 15)
  { id: "DBCAR-LTD", code: "DBCAR", name: "Driver assistance pack #13", exVat: 550, incVat: 660, group: "assist", trims: ["Limited"], note: TOW_PREP },
  { id: "DBCBD-LTD", code: "DBCBD", name: "Driver assistance pack #9T, with BlueCruise", exVat: 650, incVat: 780, group: "assist", trims: ["Limited"], fuels: ["phev"], note: TOW_PREP },
  { id: "DBCBD-WT", code: "DBCBD", name: "Driver assistance pack #9T, with BlueCruise", exVat: 100, incVat: 120, group: "assist", trims: ["Wildtrak"], fuels: ["phev"], note: TOW_PREP },

  // Everything else (pages 9, 12 to 15; Raptor list page 10)
  { id: "ICFEL", code: "ICFEL", name: "ICE feature pack 117, 8 speakers", exVat: 625, incVat: 750, group: "other", trims: ["Limited", "Wildtrak", "MS-RT"] },
  { id: "A9IAE", code: "A9IAE", name: "Black tubular sports bar", exVat: 500, incVat: 600, group: "other", trims: ["XLT"] },
  { id: "AALB0", code: "AALB0", name: "Body protection pack 1", exVat: 500, incVat: 600, group: "other", trims: ["XLT", "Limited", "Platinum"] },
  { id: "A2YAC", code: "A2YAC", name: "Underbody wax protection", exVat: 250, incVat: 300, group: "other", trims: NOT_MSRT },
  { id: "J4KAB", code: "J4KAB", name: "Winter pack 1", exVat: 500, incVat: 600, group: "other", trims: ["XLT"] },
  { id: "AAXAH", code: "AAXAH", name: "Raptor pack: roll bar and power roll top cover", exVat: 2000, incVat: 2400, group: "other", trims: ["Raptor"] },
  { id: "A5GC2", code: "A5GC2", name: "Raptor decal pack", exVat: 500, incVat: 600, group: "other", trims: ["Raptor"] },
];

/** The options Ford lists, with a charge, for this trim and engine. */
export const optionsFor = (v: RangerVersion) => RANGER_OPTIONS.filter((o) => o.trims.includes(v.trim) && (!o.fuels || o.fuels.includes(v.fuel)));
export const optionById = (id: string) => RANGER_OPTIONS.find((o) => o.id === id);
/** The colour that costs nothing. */
export const freeColour = (v: RangerVersion) => (v.trim === "Raptor" ? "Arctic White" : "Frozen White");

/** One line of a P11D value's options: its name and list price incl. VAT. */
export interface OptionLine { name: string; incVat: number }

// ─── The tax year's rates ──────────────────────────────────────────────────

export interface TaxYearRates {
  label: string;
  /** First and last day, ISO. */
  starts: string;
  ends: string;
  /** Cars above 50 g/km: lower bound of each band (inclusive) and its percentage. */
  carBands: { from: number; pct: number }[];
  zeroEmissionPct: number;
  /** Cars of 1 to 50 g/km, by electric range (miles), highest range first. */
  rangeBands: { minMiles: number; pct: number }[];
  maxPct: number;
  dieselSupplementPct: number;
  /** Flat, £ a year. */
  vanBenefit: number;
  vanFuelBenefit: number;
  /** £; the car fuel benefit is this × the car's percentage. */
  carFuelMultiplier: number;
  class1APct: number;
  /** Share of a car's lease rentals not allowed for tax, cars over `lowEmissionCo2`. */
  leaseRestrictionPct: number;
  lowEmissionCo2: number;
  vatPct: number;
  /** Share of the VAT on a leased car's rentals that can't be reclaimed where it's available for private use. */
  leasedCarVatBlockPct: number;
  /** Capital allowances, % a year. */
  specialRatePct: number;
  mainRatePct: number;
  sources: { label: string; detail: string }[];
}

/** 2026/27, every figure from HMRC (checked 2026-11-04). */
export const RATES_2026_27: TaxYearRates = {
  label: "2026/27",
  starts: "2026-04-06",
  ends: "2027-04-05",
  carBands: [
    { from: 51, pct: 17 }, { from: 55, pct: 18 }, { from: 60, pct: 19 }, { from: 65, pct: 20 }, { from: 70, pct: 21 },
    { from: 75, pct: 21 }, { from: 80, pct: 22 }, { from: 85, pct: 23 }, { from: 90, pct: 24 }, { from: 95, pct: 25 },
    { from: 100, pct: 26 }, { from: 105, pct: 27 }, { from: 110, pct: 28 }, { from: 115, pct: 29 }, { from: 120, pct: 30 },
    { from: 125, pct: 31 }, { from: 130, pct: 32 }, { from: 135, pct: 33 }, { from: 140, pct: 34 }, { from: 145, pct: 35 },
    { from: 150, pct: 36 }, { from: 155, pct: 37 },
  ],
  zeroEmissionPct: 4,
  rangeBands: [{ minMiles: 130, pct: 4 }, { minMiles: 70, pct: 7 }, { minMiles: 40, pct: 10 }, { minMiles: 30, pct: 14 }, { minMiles: 0, pct: 16 }],
  maxPct: 37,
  dieselSupplementPct: 4,
  vanBenefit: 4170,
  vanFuelBenefit: 798,
  carFuelMultiplier: 29200,
  class1APct: 15,
  leaseRestrictionPct: 15,
  lowEmissionCo2: 50,
  vatPct: 20,
  leasedCarVatBlockPct: 50,
  specialRatePct: 6,
  mainRatePct: 14,
  sources: [
    { label: "Company car percentages", detail: "HMRC Employment Income Manual EIM24705, 2026 to 2027" },
    { label: "Van and van fuel benefit", detail: "GOV.UK, company vans: £4,170 and £798" },
    { label: "Car fuel benefit", detail: "HMRC EIM25580: £29,200 for 2026 to 2027" },
    { label: "Employer's NI", detail: "Class 1A at 15%, HMRC rates and thresholds 2026 to 2027" },
    { label: "Double cab pick-ups", detail: "HMRC EIM23151 and CA23511, from 6 April 2025" },
    { label: "Lease restriction", detail: "HMRC BIM47714 and BIM47740: 15% over 50 g/km, VAT that can't be reclaimed included" },
    { label: "VAT", detail: "HMRC Notice 700/64: 50% of leased car VAT blocked; payload of one tonne or more not a car" },
    { label: "Capital allowances", detail: "GOV.UK business cars: special rate 6% over 50 g/km" },
  ],
};

export const TAX_YEARS: TaxYearRates[] = [RATES_2026_27];

/** The rates for the tax year a date falls in, or the latest held if that year hasn't been added yet. */
export function ratesFor(isoDate: string): { rates: TaxYearRates; current: boolean } {
  const hit = TAX_YEARS.find((y) => isoDate >= y.starts && isoDate <= y.ends);
  if (hit) return { rates: hit, current: true };
  const latest = [...TAX_YEARS].sort((a, b) => b.starts.localeCompare(a.starts))[0];
  return { rates: latest, current: false };
}

/**
 * A company car's appropriate percentage. A diesel's 4% supplement is added
 * unless it meets RDE2, never above the maximum. Every diesel Ranger is in
 * the top band, so it is 37% either way.
 */
export function carPercentage(co2: number, electricRangeMiles: number | null, rates: TaxYearRates, dieselSupplement = false): number {
  const g = Math.floor(co2);
  let pct: number;
  if (g <= 0) pct = rates.zeroEmissionPct;
  else if (g <= 50) pct = rates.rangeBands.find((b) => (electricRangeMiles ?? 0) >= b.minMiles)!.pct;
  else pct = [...rates.carBands].reverse().find((b) => g >= b.from)!.pct;
  return Math.min(rates.maxPct, pct + (dieselSupplement ? rates.dieselSupplementPct : 0));
}

/** "155 g/km and over", "70 to 74 g/km": the band a CO2 figure sits in. */
export function bandText(co2: number, rates: TaxYearRates): string {
  const g = Math.floor(co2);
  if (g <= 0) return "zero emission";
  if (g <= 50) return "1 to 50 g/km";
  const bands = rates.carBands;
  const i = bands.length - 1 - [...bands].reverse().findIndex((b) => g >= b.from);
  const next = bands[i + 1];
  return next ? `${bands[i].from} to ${next.from - 1} g/km` : `${bands[i].from} g/km and over`;
}

// ─── Assessing one Ranger ──────────────────────────────────────────────────

export type TaxClass = "car" | "van";
export type Funding = "hire" | "buy";

export interface Settings {
  /** The driver's income tax rate, %. */
  incomeTaxPct: number;
  fuelCard: boolean;
  /** Commuting only: a van carries no benefit charge. A car is taxed either way. */
  privateUse: "full" | "commuting";
  funding: Funding;
  /** Corporation tax (or the owner's income tax), %. */
  businessTaxPct: number;
  vatRegistered: boolean;
  termMonths: number;
}

export interface VehicleInput {
  version: RangerVersion;
  seats: Seats;
  /** Options at list price incl. VAT, each a line: part of a car's P11D value. */
  options: OptionLine[];
  /** Contract hire: the monthly rental, ex VAT, without any maintenance charge shown separately. */
  monthlyRental: number | null;
  /** Bought: the price paid, ex VAT. Null uses the list price. */
  pricePaidExVat: number | null;
}

export interface VehicleResult {
  input: VehicleInput;
  name: string;
  taxClass: TaxClass;
  /** For VAT, the Raptor is a car; every other Ranger is a commercial vehicle. */
  vatClass: "car" | "commercial";
  /** The options' total, incl. VAT. */
  optionsIncVat: number;
  p11d: number;
  /** Car percentage, or null for a van. */
  pct: number | null;
  benefit: number;
  fuelBenefit: number;
  driver: { benefitTax: number; fuelTax: number; annual: number; monthly: number };
  business: {
    nic: number;
    /** Contract hire with every rental entered; otherwise null. */
    lease: { rentals: number; vat: number; vatBlocked: number; disallowed: number; restrictionTax: number } | null;
    relief: number;
    annual: number;
    monthly: number;
  };
  /** Driver plus business; the month is the two months added, so the printed figures add up. */
  together: { annual: number; monthly: number; overTerm: number };
  purchase: { price: number; vat: number; vatReclaimed: boolean; base: number; allowancePct: number; yearOneAllowance: number; yearOneRelief: number } | null;
}

/** Round to the penny. */
export const r2 = (n: number) => Math.round(n * 100 + (n >= 0 ? 1e-7 : -1e-7)) / 100;
const pctOf = (amount: number, pct: number) => r2((amount * pct) / 100);

export function classify(v: RangerVersion, seats: Seats): { taxClass: TaxClass; vatClass: "car" | "commercial" } {
  const twoSeat = seats === 2 && v.twoSeat;
  return { taxClass: twoSeat ? "van" : "car", vatClass: v.payloadUnderTonne ? "car" : "commercial" };
}

/** P11D value: the list price incl. VAT, delivery and number plates, plus options. Not road tax or the registration fee. */
export const p11dOf = (v: RangerVersion, optionsIncVat = 0) => r2(v.basicIncVat + OTR_ITEMS.deliveryIncVat + OTR_ITEMS.platesIncVat + Math.max(0, optionsIncVat));

/** List price ex VAT incl. delivery and plates: the default price paid. */
export const listExVatOf = (v: RangerVersion, optionsIncVat = 0) => r2(p11dOf(v, optionsIncVat) / 1.2);

export function assess(input: VehicleInput, s: Settings, rates: TaxYearRates, leaseComplete: boolean): VehicleResult {
  const v = input.version;
  const seats: Seats = input.seats === 2 && v.twoSeat ? 2 : 5;
  const { taxClass, vatClass } = classify(v, seats);
  const optionsIncVat = r2(input.options.reduce((n, o) => n + Math.max(0, o.incVat || 0), 0));
  const p11d = p11dOf(v, optionsIncVat);
  const commuting = taxClass === "van" && s.privateUse === "commuting";

  const pct = taxClass === "car" ? carPercentage(v.co2, v.electricRangeMiles, rates, v.fuel === "diesel") : null;
  const benefit = pct != null ? pctOf(p11d, pct) : commuting ? 0 : rates.vanBenefit;
  const fuelBenefit = !s.fuelCard ? 0 : pct != null ? pctOf(rates.carFuelMultiplier, pct) : commuting ? 0 : rates.vanFuelBenefit;

  const benefitTax = pctOf(benefit, s.incomeTaxPct);
  const fuelTax = pctOf(fuelBenefit, s.incomeTaxPct);
  const driverAnnual = r2(benefitTax + fuelTax);

  const nic = pctOf(benefit + fuelBenefit, rates.class1APct);
  let lease: VehicleResult["business"]["lease"] = null;
  if (s.funding === "hire" && leaseComplete && input.monthlyRental && input.monthlyRental > 0) {
    const rentals = r2(input.monthlyRental * 12);
    const vat = pctOf(rentals, rates.vatPct);
    const blockedShare = !s.vatRegistered ? 100 : vatClass === "car" ? rates.leasedCarVatBlockPct : 0;
    const vatBlocked = pctOf(vat, blockedShare);
    const restricted = taxClass === "car" && v.co2 > rates.lowEmissionCo2;
    const disallowed = restricted ? pctOf(rentals + vatBlocked, rates.leaseRestrictionPct) : 0;
    lease = { rentals, vat, vatBlocked, disallowed, restrictionTax: pctOf(disallowed, s.businessTaxPct) };
  }
  // Relief on the NI and the VAT that can't be reclaimed; the restricted share of that VAT is put back in restrictionTax.
  const relief = pctOf(nic + (lease?.vatBlocked ?? 0), s.businessTaxPct);
  const businessAnnual = r2(nic + (lease?.vatBlocked ?? 0) + (lease?.restrictionTax ?? 0) - relief);

  let purchase: VehicleResult["purchase"] = null;
  if (s.funding === "buy") {
    const price = r2(input.pricePaidExVat != null && input.pricePaidExVat > 0 ? input.pricePaidExVat : listExVatOf(v, optionsIncVat));
    const vat = pctOf(price, rates.vatPct);
    const vatReclaimed = s.vatRegistered && vatClass === "commercial";
    const base = vatReclaimed ? price : r2(price + vat);
    const allowancePct = taxClass === "van" ? 100 : v.co2 === 0 ? 100 : v.co2 <= rates.lowEmissionCo2 ? rates.mainRatePct : rates.specialRatePct;
    const yearOneAllowance = pctOf(base, allowancePct);
    purchase = { price, vat, vatReclaimed, base, allowancePct, yearOneAllowance, yearOneRelief: pctOf(yearOneAllowance, s.businessTaxPct) };
  }

  const driverMonthly = r2(driverAnnual / 12);
  const businessMonthly = r2(businessAnnual / 12);
  const togetherAnnual = r2(driverAnnual + businessAnnual);
  return {
    input: { ...input, seats },
    name: rangerName(v, seats),
    taxClass, vatClass, optionsIncVat, p11d, pct, benefit, fuelBenefit,
    driver: { benefitTax, fuelTax, annual: driverAnnual, monthly: driverMonthly },
    business: { nic, lease, relief, annual: businessAnnual, monthly: businessMonthly },
    together: { annual: togetherAnnual, monthly: r2(driverMonthly + businessMonthly), overTerm: r2((togetherAnnual * s.termMonths) / 12) },
    purchase,
  };
}

// ─── Comparing them ────────────────────────────────────────────────────────

export interface Comparison {
  vehicles: VehicleResult[];
  /** Every rental is in, so the lease restriction and VAT are counted for all of them. */
  leaseComplete: boolean;
  /** Against the first: positive saves, negative costs more (£ a year). */
  savings: number[];
  /** The same a month: the difference of the monthly figures, so the printed months add up. */
  savingsMonthly: number[];
  /** Who saves what against the first: the driver and the business, a year and a month. */
  split: { driver: { annual: number; monthly: number }; business: { annual: number; monthly: number } }[];
  /** The alternative saving the most against the first, or null if none saves. */
  best: number | null;
  tone: "saving" | "level";
  headline: string;
}

export function compareRangers(inputs: VehicleInput[], s: Settings, rates: TaxYearRates): Comparison {
  const leaseComplete = s.funding === "hire" && inputs.length > 0 && inputs.every((i) => (i.monthlyRental ?? 0) > 0);
  const vehicles = inputs.map((i) => assess(i, s, rates, leaseComplete));
  const savings = vehicles.map((v) => r2(vehicles[0].together.annual - v.together.annual));
  const savingsMonthly = vehicles.map((v) => r2(vehicles[0].together.monthly - v.together.monthly));
  const f = vehicles[0];
  const split = vehicles.map((v) => ({
    driver: { annual: r2(f.driver.annual - v.driver.annual), monthly: r2(f.driver.monthly - v.driver.monthly) },
    business: { annual: r2(f.business.annual - v.business.annual), monthly: r2(f.business.monthly - v.business.monthly) },
  }));
  let best: number | null = null;
  savings.forEach((x, i) => { if (i > 0 && x >= 0.5 && (best == null || x > savings[best])) best = i; });
  const b = best as number | null;
  return {
    vehicles, leaseComplete, savings, savingsMonthly, split, best: b,
    tone: b != null ? "saving" : "level",
    headline: b != null
      ? `The ${vehicles[b].name} saves ${pounds(savings[b])} a year in tax, ${pounds(savingsMonthly[b])} a month`
      : vehicles.length > 1 ? `The ${vehicles[0].name} already pays the least tax here` : "Add a Ranger to compare",
  };
}

// ─── Saying it ─────────────────────────────────────────────────────────────

/**
 * Whether VAT is worth mentioning. Every Ranger but the Raptor is a commercial
 * vehicle for VAT, so a VAT-registered business reclaims it all and it's the
 * same whichever is chosen (user, 2026-11-04: only talk VAT with a Raptor).
 */
export const showsVat = (c: Comparison, s: Settings) => !s.vatRegistered || c.vehicles.some((v) => v.vatClass === "car");

/** The rates and their sources, without VAT where it doesn't come into it. */
export function sourcesFor(c: Comparison, s: Settings, rates: TaxYearRates) {
  if (showsVat(c, s)) return rates.sources;
  return rates.sources
    .filter((x) => x.label !== "VAT")
    .map((x) => (x.label === "Lease restriction" ? { ...x, detail: "HMRC BIM47714 and BIM47740: 15% of the rentals on a car over 50 g/km" } : x));
}

const n2 = (n: number, dp = 2) => Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
/** "£21,174.73", "−£1,394.20". */
export const money = (n: number) => `${n < -0.004 ? "−" : ""}£${n2(n)}`;
/** "£14,857": whole pounds. */
export const pounds = (n: number) => `${n < -0.5 ? "−" : ""}£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;
const pc = (n: number) => `${Number.isInteger(n) ? n : n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;

/** "Saves £14,135.50", "£2,077.99 more", "The same". */
const against = (n: number) => (n >= 0.005 ? `Saves ${money(n)}` : n <= -0.005 ? `${money(-n)} more` : "The same");

export interface BreakdownRow { label: string; values: string[]; strong?: boolean; hint?: string }
export interface BreakdownSection { title: string; rows: BreakdownRow[] }

/** The full picture, one column per Ranger. The page and the PDF print the same rows. */
export function breakdown(c: Comparison, s: Settings, rates: TaxYearRates): BreakdownSection[] {
  const vs = c.vehicles;
  const vat = showsVat(c, s);
  const col = (f: (v: VehicleResult, i: number) => string) => vs.map(f);
  const sections: BreakdownSection[] = [
    {
      title: "The Ranger",
      rows: [
        { label: "Taxed as", values: col((v) => (v.taxClass === "car" ? "A car" : "A van")) },
        { label: "Options at list price", values: col((v) => (v.optionsIncVat > 0 ? money(v.optionsIncVat) : v.taxClass === "van" ? "Not used" : "None")) },
        { label: "P11D value", values: col((v) => (v.taxClass === "van" ? "Not used" : money(v.p11d))) },
        { label: "CO₂", values: col((v) => (v.taxClass === "van" ? "Not used" : `${v.input.version.co2} g/km`)) },
        { label: "Benefit in kind", values: col((v) => (v.pct != null ? `${v.pct}% of P11D` : v.benefit > 0 ? "Flat van charge" : "None, commuting only")) },
        { label: "Taxable benefit, a year", values: col((v) => money(v.benefit)) },
      ],
    },
    {
      title: `The driver, at ${pc(s.incomeTaxPct)}`,
      rows: [
        { label: "Tax on the Ranger", values: col((v) => money(v.driver.benefitTax)) },
        ...(s.fuelCard ? [{ label: "Tax on private fuel", values: col((v) => money(v.driver.fuelTax)) }] : []),
        { label: "Driver's tax, a year", values: col((v) => money(v.driver.annual)), strong: true },
        { label: "Driver's tax, a month", values: col((v) => money(v.driver.monthly)) },
      ],
    },
    {
      title: "The business, a year",
      rows: [
        { label: "Employer's NI (Class 1A)", values: col((v) => money(v.business.nic)) },
        ...(c.leaseComplete && vat ? [{ label: "VAT it can't reclaim", values: col((v) => money(v.business.lease!.vatBlocked)) }] : []),
        ...(c.leaseComplete ? [{ label: "Tax lost to the lease restriction", values: col((v) => money(v.business.lease!.restrictionTax)) }] : []),
        { label: `Less tax relief at ${pc(s.businessTaxPct)}`, values: col((v) => money(-v.business.relief)) },
        { label: "Business tax, a year", values: col((v) => money(v.business.annual)), strong: true },
        { label: "Business tax, a month", values: col((v) => money(v.business.monthly)) },
      ],
    },
    {
      title: "Together",
      rows: [
        { label: "Tax a year", values: col((v) => money(v.together.annual)), strong: true },
        { label: "Tax a month", values: col((v) => money(v.together.monthly)) },
        { label: `Over ${s.termMonths} months`, values: col((v) => money(v.together.overTerm)), hint: `at ${rates.label} rates` },
      ],
    },
  ];
  if (vs.length > 1) {
    const vsFirst = (f: (i: number) => number) => col((_, i) => (i === 0 ? "Their choice" : against(f(i))));
    sections.push({
      title: "Saving against their choice",
      rows: [
        { label: "The driver, a year", values: vsFirst((i) => c.split[i].driver.annual) },
        { label: "The driver, a month", values: vsFirst((i) => c.split[i].driver.monthly) },
        { label: "The business, a year", values: vsFirst((i) => c.split[i].business.annual) },
        { label: "The business, a month", values: vsFirst((i) => c.split[i].business.monthly) },
        { label: "Together, a year", values: vsFirst((i) => c.savings[i]), strong: true },
        { label: "Together, a month", values: vsFirst((i) => c.savingsMonthly[i]), strong: true },
      ],
    });
  }
  if (s.funding === "buy") {
    sections.push({
      title: "Buying it",
      rows: [
        { label: "Price paid, ex VAT", values: col((v) => money(v.purchase!.price)) },
        ...(vat ? [{ label: "VAT on the purchase", values: col((v) => (v.purchase!.vatReclaimed ? "Reclaimed" : `Can't reclaim ${money(v.purchase!.vat)}`)) }] : []),
        { label: "Capital allowances", values: col((v) => (v.purchase!.allowancePct === 100 ? "100% in year one" : `${v.purchase!.allowancePct}% a year`)) },
        { label: "Tax relief in year one", values: col((v) => money(v.purchase!.yearOneRelief)), strong: true },
      ],
    });
  }
  return sections;
}

/** Why each Ranger in the comparison is taxed the way it is. Only the cases present. */
export function rulesFor(c: Comparison, rates: TaxYearRates): { title: string; text: string }[] {
  const has = (f: (v: VehicleResult) => boolean) => c.vehicles.some(f);
  const out: { title: string; text: string }[] = [];
  if (has((v) => v.taxClass === "car" && !v.input.version.payloadUnderTonne)) {
    out.push({ title: "A 5-seat Ranger is a car", text: "Since 6 April 2025 HMRC treats a double cab pick-up as a car for benefit in kind, capital allowances and the lease restriction, whatever its payload. It is taxed on its P11D value and CO₂, like any company car." });
  }
  if (has((v) => v.taxClass === "van")) {
    out.push({ title: "The 2-Seat is a van", text: `No second row of seats, so it stays a van: a flat ${pounds(rates.vanBenefit)} benefit whatever its price, options or CO₂, ${pounds(rates.vanFuelBenefit)} for private fuel, and nothing at all if private use is limited to commuting. The conversion is £0 on Ford's list, so the list price is the 5-seat's.` });
  }
  if (has((v) => v.input.version.payloadUnderTonne)) {
    out.push({ title: "The Raptor is a car for VAT too", text: "Its payload is under one tonne, so it is a car for VAT as well as for tax: half the VAT on a lease and all of the VAT on a purchase can't be reclaimed. A VAT-registered business reclaims the VAT on every other Ranger." });
  }
  out.push({ title: "Rangers already on the fleet", text: "A Ranger bought, leased or ordered before 6 April 2025 keeps van treatment until it is sold, its lease ends, or 5 April 2029, whichever comes first. Its replacement is taxed as a car unless it's a 2-Seat." });
  return out;
}

// ─── The workings ──────────────────────────────────────────────────────────

export interface WorkingsStep { title: string; lines: string[] }

/** Every step from the price list to the answer, so it can be checked by hand. */
export function workings(c: Comparison, s: Settings, rates: TaxYearRates, numbers?: number[]): WorkingsStep[] {
  const vat = showsVat(c, s);
  const steps: WorkingsStep[] = c.vehicles.map((r, i) => {
    const v = r.input.version;
    const lines: string[] = [];
    const opts = r.optionsIncVat;
    const chosen = r.input.options.filter((o) => o.incVat > 0);
    // A van's tax is flat, so its P11D value and options don't come into it.
    if (r.pct != null) {
      if (chosen.length) lines.push(`Options: ${chosen.map((o) => `${o.name} ${money(o.incVat)}`).join(" + ")} = ${money(opts)}`);
      lines.push(`P11D: ${money(v.basicIncVat)} list + ${money(OTR_ITEMS.deliveryIncVat)} delivery + ${money(OTR_ITEMS.platesIncVat)} plates${opts ? ` + ${money(opts)} options` : ""} = ${money(r.p11d)}`);
      lines.push(`${v.co2} g/km, ${bandText(v.co2, rates)}: ${r.pct}%${r.pct === rates.maxPct ? ", the maximum" : ""}`);
      lines.push(`Benefit: ${money(r.p11d)} × ${r.pct}% = ${money(r.benefit)}`);
      if (s.fuelCard) lines.push(`Fuel: ${money(rates.carFuelMultiplier)} × ${r.pct}% = ${money(r.fuelBenefit)}`);
    } else if (r.benefit > 0) {
      lines.push(`A van: the flat ${rates.label} van benefit, ${money(r.benefit)}`);
      if (s.fuelCard) lines.push(`Fuel: the flat van fuel benefit, ${money(r.fuelBenefit)}`);
    } else {
      lines.push("A van used only for commuting: no benefit, and no fuel benefit");
    }
    const base = r2(r.benefit + r.fuelBenefit);
    lines.push(s.fuelCard
      ? `Driver: (${money(r.benefit)} + ${money(r.fuelBenefit)}) × ${pc(s.incomeTaxPct)} = ${money(r.driver.annual)}, ${money(r.driver.monthly)} a month`
      : `Driver: ${money(r.benefit)} × ${pc(s.incomeTaxPct)} = ${money(r.driver.annual)}, ${money(r.driver.monthly)} a month`);
    lines.push(`Employer's NI: ${money(base)} × ${pc(rates.class1APct)} = ${money(r.business.nic)}`);
    const l = r.business.lease;
    if (l) {
      lines.push(`Rentals: ${money(r.input.monthlyRental!)} × 12 = ${money(l.rentals)} ex VAT`);
      if (vat) {
        if (!s.vatRegistered) lines.push(`VAT: ${money(l.rentals)} × ${pc(rates.vatPct)} = ${money(l.vat)}, none reclaimed as not VAT registered`);
        else if (l.vatBlocked > 0) lines.push(`VAT: ${money(l.rentals)} × ${pc(rates.vatPct)} = ${money(l.vat)}, ${pc(rates.leasedCarVatBlockPct)} can't be reclaimed = ${money(l.vatBlocked)}`);
        else lines.push("VAT on the rentals: reclaimed in full, a commercial vehicle for VAT");
      }
      const hireCost = vat ? `(${money(l.rentals)} + ${money(l.vatBlocked)})` : money(l.rentals);
      lines.push(l.disallowed > 0
        ? `Lease restriction: ${hireCost} × ${pc(rates.leaseRestrictionPct)} = ${money(l.disallowed)}, × ${pc(s.businessTaxPct)} = ${money(l.restrictionTax)}`
        : `Lease restriction: none for a ${r.taxClass === "van" ? "van" : `car of ${rates.lowEmissionCo2} g/km or less`}`);
    }
    const vatBlocked = l?.vatBlocked ?? 0;
    lines.push(vat && l
      ? `Relief: (${money(r.business.nic)} + ${money(vatBlocked)}) × ${pc(s.businessTaxPct)} = ${money(r.business.relief)}`
      : `Relief: ${money(r.business.nic)} × ${pc(s.businessTaxPct)} = ${money(r.business.relief)}`);
    const parts = [money(r.business.nic), ...(l && vat ? [money(l.vatBlocked)] : []), ...(l ? [money(l.restrictionTax)] : [])];
    lines.push(`Business: ${parts.join(" + ")} − ${money(r.business.relief)} = ${money(r.business.annual)}, ${money(r.business.monthly)} a month`);
    lines.push(`Together: ${money(r.driver.annual)} + ${money(r.business.annual)} = ${money(r.together.annual)} a year`);
    lines.push(`  a month: ${money(r.driver.monthly)} + ${money(r.business.monthly)} = ${money(r.together.monthly)}`);
    const p = r.purchase;
    if (p) {
      lines.push(p.vatReclaimed
        ? `Bought: ${money(p.price)} ex VAT${vat ? ", VAT reclaimed" : ""}`
        : `Bought: ${money(p.price)} + ${money(p.vat)} VAT kept = ${money(p.base)}`);
      lines.push(`Allowances: ${money(p.base)} × ${p.allowancePct}% = ${money(p.yearOneAllowance)}, × ${pc(s.businessTaxPct)} = ${money(p.yearOneRelief)} in year one`);
    }
    return { title: `${numbers?.[i] ?? i + 1}. ${r.name}`, lines };
  });
  if (c.vehicles.length > 1) {
    const first = c.vehicles[0];
    steps.push({
      title: "The difference",
      lines: c.vehicles.slice(1).flatMap((r, j) => {
        const i = j + 1;
        const d = c.savings[i];
        const sp = c.split[i];
        const lm = (n: number, per: string) => `${money(Math.abs(n))} ${per} ${n >= 0 ? "less" : "more"}`;
        return [
          `${r.name}: ${money(first.together.annual)} − ${money(r.together.annual)} = ${lm(d, "a year")}, ${money(Math.abs(r2((d * s.termMonths) / 12)))} over ${s.termMonths} months`,
          `  a month: ${money(first.together.monthly)} − ${money(r.together.monthly)} = ${lm(c.savingsMonthly[i], "a month")}`,
          `  driver: ${money(first.driver.annual)} − ${money(r.driver.annual)} = ${lm(sp.driver.annual, "a year")}; ${money(first.driver.monthly)} − ${money(r.driver.monthly)} = ${lm(sp.driver.monthly, "a month")}`,
          `  business: ${money(first.business.annual)} − ${money(r.business.annual)} = ${lm(sp.business.annual, "a year")}; ${money(first.business.monthly)} − ${money(r.business.monthly)} = ${lm(sp.business.monthly, "a month")}`,
        ];
      }),
    });
  }
  return steps;
}
