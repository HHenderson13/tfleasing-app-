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
  /** Factory options at list price, incl. VAT: part of a car's P11D value. */
  optionsIncVat: number;
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
  };
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
  const p11d = p11dOf(v, input.optionsIncVat);
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
    const price = r2(input.pricePaidExVat != null && input.pricePaidExVat > 0 ? input.pricePaidExVat : listExVatOf(v, input.optionsIncVat));
    const vat = pctOf(price, rates.vatPct);
    const vatReclaimed = s.vatRegistered && vatClass === "commercial";
    const base = vatReclaimed ? price : r2(price + vat);
    const allowancePct = taxClass === "van" ? 100 : v.co2 === 0 ? 100 : v.co2 <= rates.lowEmissionCo2 ? rates.mainRatePct : rates.specialRatePct;
    const yearOneAllowance = pctOf(base, allowancePct);
    purchase = { price, vat, vatReclaimed, base, allowancePct, yearOneAllowance, yearOneRelief: pctOf(yearOneAllowance, s.businessTaxPct) };
  }

  const togetherAnnual = r2(driverAnnual + businessAnnual);
  return {
    input: { ...input, seats },
    name: rangerName(v, seats),
    taxClass, vatClass, p11d, pct, benefit, fuelBenefit,
    driver: { benefitTax, fuelTax, annual: driverAnnual, monthly: r2(driverAnnual / 12) },
    business: { nic, lease, relief, annual: businessAnnual },
    together: { annual: togetherAnnual, monthly: r2(togetherAnnual / 12), overTerm: r2((togetherAnnual * s.termMonths) / 12) },
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
  let best: number | null = null;
  savings.forEach((x, i) => { if (i > 0 && x >= 0.5 && (best == null || x > savings[best])) best = i; });
  const b = best as number | null;
  return {
    vehicles, leaseComplete, savings, savingsMonthly, best: b,
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
export const sourcesFor = (c: Comparison, s: Settings, rates: TaxYearRates) => rates.sources.filter((x) => x.label !== "VAT" || showsVat(c, s));

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
        { label: "P11D value", values: col((v) => money(v.p11d)) },
        { label: "CO₂", values: col((v) => `${v.input.version.co2} g/km`) },
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
      ],
    },
    {
      title: "Together",
      rows: [
        { label: "Tax a year", values: col((v) => money(v.together.annual)), strong: true },
        { label: "Tax a month", values: col((v) => money(v.together.monthly)) },
        { label: `Over ${s.termMonths} months`, values: col((v) => money(v.together.overTerm)), hint: `at ${rates.label} rates` },
        { label: "Against their choice, a year", strong: true, values: col((_, i) => (i === 0 ? "Their choice" : against(c.savings[i]))) },
        { label: "Against their choice, a month", strong: true, values: col((_, i) => (i === 0 ? "Their choice" : against(c.savingsMonthly[i]))) },
      ],
    },
  ];
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
    out.push({ title: "The 2-Seat is a van", text: `No second row of seats, so it stays a van: a flat ${pounds(rates.vanBenefit)} benefit whatever its price, options or CO₂, ${pounds(rates.vanFuelBenefit)} for private fuel, and nothing at all if private use is limited to commuting. Same list price and CO₂ as the 5-seat.` });
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
export function workings(c: Comparison, s: Settings, rates: TaxYearRates): WorkingsStep[] {
  const vat = showsVat(c, s);
  const steps: WorkingsStep[] = c.vehicles.map((r, i) => {
    const v = r.input.version;
    const lines: string[] = [];
    const opts = Math.max(0, r.input.optionsIncVat);
    lines.push(`P11D: ${money(v.basicIncVat)} list + ${money(OTR_ITEMS.deliveryIncVat)} delivery + ${money(OTR_ITEMS.platesIncVat)} plates${opts ? ` + ${money(opts)} options` : ""} = ${money(r.p11d)}`);
    if (r.pct != null) {
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
    lines.push(`Business: ${parts.join(" + ")} − ${money(r.business.relief)} = ${money(r.business.annual)}`);
    lines.push(`Together: ${money(r.driver.annual)} + ${money(r.business.annual)} = ${money(r.together.annual)} a year, ÷ 12 = ${money(r.together.monthly)} a month`);
    const p = r.purchase;
    if (p) {
      lines.push(p.vatReclaimed
        ? `Bought: ${money(p.price)} ex VAT${vat ? ", VAT reclaimed" : ""}`
        : `Bought: ${money(p.price)} + ${money(p.vat)} VAT kept = ${money(p.base)}`);
      lines.push(`Allowances: ${money(p.base)} × ${p.allowancePct}% = ${money(p.yearOneAllowance)}, × ${pc(s.businessTaxPct)} = ${money(p.yearOneRelief)} in year one`);
    }
    return { title: `${i + 1}. ${r.name}`, lines };
  });
  if (c.vehicles.length > 1) {
    const first = c.vehicles[0];
    steps.push({
      title: "The difference",
      lines: c.vehicles.slice(1).flatMap((r, j) => {
        const d = c.savings[j + 1];
        const m = c.savingsMonthly[j + 1];
        return [
          `${r.name}: ${money(first.together.annual)} − ${money(r.together.annual)} = ${money(Math.abs(d))} a year ${d >= 0 ? "less" : "more"}, ${money(Math.abs(r2((d * s.termMonths) / 12)))} over ${s.termMonths} months`,
          `  a month: ${money(first.together.monthly)} − ${money(r.together.monthly)} = ${money(Math.abs(m))} ${m >= 0 ? "less" : "more"}`,
        ];
      }),
    });
  }
  return steps;
}
