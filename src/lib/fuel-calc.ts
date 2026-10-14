// Fuel Cost Calculator: the maths. Pure and client-safe: the page runs it
// live as figures change, the PDF prints its workings, and the tests pin it.
//
// Like for like on both sides: official (WLTP) efficiency for each vehicle,
// UK national average prices, the same annual mileage.
//
//   Petrol / diesel   cost a mile = price per litre × 4.54609 ÷ MPG
//   Electric          cost a mile = blended price per kWh ÷ miles per kWh
//
// WLTP electric consumption is measured at the plug, so charging losses are
// already in the miles-per-kWh figure, so nothing is added for them.

export const LITRES_PER_UK_GALLON = 4.54609;
export const MONTHS_PER_YEAR = 12;

export type FuelType = "petrol" | "diesel";
export type Segment = "car" | "van";
export type CustomerType = "private" | "business";
export type PriceKey = "petrol" | "diesel" | "home_overnight" | "home_standard" | "depot" | "public_rapid";
export type ChargeKey = "home_overnight" | "home_standard" | "depot" | "public_rapid";

export const CHARGE_KEYS: ChargeKey[] = ["home_overnight", "home_standard", "depot", "public_rapid"];

/**
 * How each price is published, and the VAT treatment. Prices are stored
 * exactly as their source publishes them; the customer type decides what is
 * shown. A VAT-registered business reclaims VAT on fuel, depot and public
 * charging, but not on a domestic electricity bill, so home charging is the
 * same for both.
 */
export const PRICE_META: Record<PriceKey, { label: string; short: string; unit: "litre" | "kWh"; includesVat: boolean; vat: number; reclaimable: boolean }> = {
  petrol:         { label: "Petrol",                 short: "Petrol",          unit: "litre", includesVat: true,  vat: 0.20, reclaimable: true },
  diesel:         { label: "Diesel",                 short: "Diesel",          unit: "litre", includesVat: true,  vat: 0.20, reclaimable: true },
  home_overnight: { label: "Home overnight (EV tariff)", short: "Home overnight", unit: "kWh", includesVat: true,  vat: 0.05, reclaimable: false },
  home_standard:  { label: "Home daytime (standard rate)", short: "Home daytime", unit: "kWh", includesVat: true,  vat: 0.05, reclaimable: false },
  depot:          { label: "Depot or workplace",     short: "Depot",           unit: "kWh",   includesVat: false, vat: 0.20, reclaimable: true },
  public_rapid:   { label: "Public rapid charging",  short: "Public rapid",    unit: "kWh",   includesVat: true,  vat: 0.20, reclaimable: true },
};

/** A published price (pence per litre or kWh) as this customer pays it. */
export function effectivePence(key: PriceKey, published: number, customer: CustomerType): number {
  const m = PRICE_META[key];
  const exVat = m.includesVat ? published / (1 + m.vat) : published;
  const incVat = m.includesVat ? published : published * (1 + m.vat);
  return customer === "business" && m.reclaimable ? exVat : incVat;
}

/** Whether the price shown for this customer includes VAT. */
export const showsVat = (key: PriceKey, customer: CustomerType) => !(customer === "business" && PRICE_META[key].reclaimable);

// ─── CO₂ → MPG ─────────────────────────────────────────────────────────────
//
// Official fuel consumption is calculated FROM the measured CO₂ by carbon
// balance (UN R101 / EU 2017/1151), so the V5C's CO₂ figure gives back the
// official MPG. Constants per fuel and test, HC and CO left out (they move
// the answer by well under 1%):
//   L/100km = (k ÷ density) × 0.273 × CO₂,  MPG = 282.481 ÷ L/100km
// Checked: 2018 Transit Custom 2.0 130, 182 g/km NEDC → 40.9 mpg (Ford 40.9);
// Puma 1.0 EcoBoost 125 mHEV, 122 g/km WLTP → 52.3 mpg (Ford 52.3).

export type TestCycle = "wltp" | "nedc";

const MPG_PER_L100KM = 282.481;
const CO2_FACTOR: Record<TestCycle, Record<FuelType, number>> = {
  wltp: { petrol: (0.1206 / 0.743) * 0.273, diesel: (0.1165 / 0.836) * 0.273 },
  nedc: { petrol: (0.118 / 0.743) * 0.273,  diesel: (0.116 / 0.835) * 0.273 },
};

export function mpgFromCo2(co2: number, fuel: FuelType, cycle: TestCycle): number | null {
  if (!(co2 > 0)) return null;
  return MPG_PER_L100KM / (CO2_FACTOR[cycle][fuel] * co2);
}

/**
 * WLTP figures went on V5Cs for new cars from September 2018 and new vans
 * from September 2019; before that the CO₂ is NEDC, which flatters economy.
 */
export function testCycleFor(segment: Segment, firstRegistered: string | null): TestCycle {
  if (!firstRegistered) return "wltp";
  return firstRegistered >= (segment === "van" ? "2019-09" : "2018-09") ? "wltp" : "nedc";
}

// ─── Charging mix ──────────────────────────────────────────────────────────

export type ChargeMix = Record<ChargeKey, number>;

export const DEFAULT_MIX: Record<Segment, ChargeMix> = {
  car: { home_overnight: 80, home_standard: 10, depot: 0, public_rapid: 10 },
  van: { home_overnight: 80, home_standard: 10, depot: 0, public_rapid: 10 },
};

/** Shares as fractions of 1. A mix that doesn't add to 100 is scaled to it; all zero is treated as all overnight. */
export function normaliseMix(mix: ChargeMix): { shares: ChargeMix; total: number } {
  const total = CHARGE_KEYS.reduce((n, k) => n + Math.max(0, mix[k] || 0), 0);
  if (total <= 0) return { shares: { home_overnight: 1, home_standard: 0, depot: 0, public_rapid: 0 }, total: 0 };
  const shares = Object.fromEntries(CHARGE_KEYS.map((k) => [k, Math.max(0, mix[k] || 0) / total])) as ChargeMix;
  return { shares, total };
}

// ─── The comparison ────────────────────────────────────────────────────────

export interface ComparisonInput {
  annualMiles: number;
  termMonths: number;
  customer: CustomerType;
  ice: { fuel: FuelType; mpg: number; pricePence: number };
  ev: { milesPerKwh: number; mix: ChargeMix; pricesPence: Record<ChargeKey, number> };
}

export interface SideResult {
  /** Pence a mile, as this customer pays. */
  pencePerMile: number;
  monthly: number;   // £
  annual: number;    // £
  overTerm: number;  // £
}

export interface ComparisonResult {
  valid: boolean;
  monthlyMiles: number;
  ice: SideResult & { litresPerMile: number; effectivePrice: number };
  ev: SideResult & { kwhPerMile: number; blendedPence: number; shares: ChargeMix; effectivePrices: Record<ChargeKey, number>; mixTotal: number };
  /** Positive: electric is cheaper by this much (£). Negative: electric costs more. */
  saving: { monthly: number; annual: number; overTerm: number; pencePerMile: number };
}

const side = (pencePerMile: number, annualMiles: number, termMonths: number): SideResult => {
  const annual = (pencePerMile * annualMiles) / 100;
  return { pencePerMile, annual, monthly: annual / MONTHS_PER_YEAR, overTerm: (annual / MONTHS_PER_YEAR) * termMonths };
};

export function compare(input: ComparisonInput): ComparisonResult {
  const miles = Math.max(0, input.annualMiles || 0);
  const term = Math.max(0, input.termMonths || 0);

  const icePrice = effectivePence(input.ice.fuel, input.ice.pricePence, input.customer);
  const litresPerMile = input.ice.mpg > 0 ? LITRES_PER_UK_GALLON / input.ice.mpg : NaN;
  const icePpm = litresPerMile * icePrice;

  const { shares, total } = normaliseMix(input.ev.mix);
  const effectivePrices = Object.fromEntries(CHARGE_KEYS.map((k) => [k, effectivePence(k, input.ev.pricesPence[k] || 0, input.customer)])) as Record<ChargeKey, number>;
  const blendedPence = CHARGE_KEYS.reduce((n, k) => n + shares[k] * effectivePrices[k], 0);
  const kwhPerMile = input.ev.milesPerKwh > 0 ? 1 / input.ev.milesPerKwh : NaN;
  const evPpm = kwhPerMile * blendedPence;

  const ice = side(icePpm, miles, term);
  const ev = side(evPpm, miles, term);
  const valid = Number.isFinite(icePpm) && Number.isFinite(evPpm) && miles > 0;
  return {
    valid,
    monthlyMiles: miles / MONTHS_PER_YEAR,
    ice: { ...ice, litresPerMile, effectivePrice: icePrice },
    ev: { ...ev, kwhPerMile, blendedPence, shares, effectivePrices, mixTotal: total },
    saving: {
      monthly: ice.monthly - ev.monthly,
      annual: ice.annual - ev.annual,
      overTerm: ice.overTerm - ev.overTerm,
      pencePerMile: icePpm - evPpm,
    },
  };
}

// ─── Saying it plainly ─────────────────────────────────────────────────────

const pounds = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;

/** The headline, honest either way: electric saves, or electric costs more. */
export function verdict(r: ComparisonResult, iceFuel: FuelType): { tone: "saving" | "cost" | "level"; headline: string } {
  if (!r.valid) return { tone: "level", headline: "Fill in both vehicles to compare" };
  const m = r.saving.monthly;
  if (Math.abs(m) < 0.5) return { tone: "level", headline: `Electric costs about the same as ${iceFuel} each month` };
  return m > 0
    ? { tone: "saving", headline: `Electric saves ${pounds(m)} a month` }
    : { tone: "cost", headline: `Electric costs ${pounds(m)} a month more than ${iceFuel}` };
}

export const fmtPounds = (n: number, dp = 0) =>
  `${n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const fmtPence = (n: number, dp = 1) => `${n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}p`;

// ─── The workings ──────────────────────────────────────────────────────────
//
// Every step from inputs to answer, with the numbers. Shown on the page and
// printed on the PDF, so the figure can be checked by hand.

export interface WorkingsLabels { iceFuel: FuelType; chargeLabels: Record<ChargeKey, string> }

const n2 = (n: number, dp = 2) => n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
// Enough places that each line multiplies out to the next by hand.
const miles = (n: number) => n2(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);
/** Miles per kWh as published: "2.9", or "4.78" where the figure has two places. */
export const fmtMilesPerKwh = (n: number) => n2(n, Math.abs(n * 10 - Math.round(n * 10)) < 1e-9 ? 1 : 2);

export function workings(input: ComparisonInput, r: ComparisonResult, labels: WorkingsLabels): { title: string; lines: string[] }[] {
  if (!r.valid) return [];
  const fuel = labels.iceFuel === "petrol" ? "Petrol" : "Diesel";
  const vatNote = (key: PriceKey) => {
    const m = PRICE_META[key];
    if (input.customer === "business" && m.reclaimable) return m.includesVat ? ` (${Math.round(m.vat * 100)}% VAT reclaimed)` : " (ex VAT)";
    if (!m.includesVat) return ` (+${Math.round(m.vat * 100)}% VAT)`;
    return " (incl. VAT)";
  };
  const used = CHARGE_KEYS.filter((k) => r.ev.shares[k] > 0);
  return [
    {
      title: "Miles",
      lines: [`${input.annualMiles.toLocaleString("en-GB")} miles a year ÷ 12 = ${miles(r.monthlyMiles)} miles a month`],
    },
    {
      title: fuel,
      lines: [
        `${LITRES_PER_UK_GALLON} litres a gallon ÷ ${n2(input.ice.mpg, 1)} MPG = ${n2(r.ice.litresPerMile, 5)} litres a mile`,
        `${fuel} at ${n2(r.ice.effectivePrice)}p a litre${vatNote(labels.iceFuel)}`,
        `${n2(r.ice.litresPerMile, 5)} × ${n2(r.ice.effectivePrice)}p = ${n2(r.ice.pencePerMile, 3)}p a mile`,
      ],
    },
    {
      title: "Electric",
      lines: [
        `Blended price: ${used.map((k) => `${Math.round(r.ev.shares[k] * 100)}% × ${n2(r.ev.effectivePrices[k])}p`).join(" + ")} = ${n2(r.ev.blendedPence, 3)}p a kWh`,
        ...used.map((k) => `  ${labels.chargeLabels[k]}: ${n2(r.ev.effectivePrices[k])}p a kWh${vatNote(k)}`),
        ...(r.ev.mixTotal > 0 && Math.abs(r.ev.mixTotal - 100) > 0.01 ? [`  The charging shares added to ${n2(r.ev.mixTotal, 0)}%, so they were scaled to 100%`] : []),
        `${n2(r.ev.blendedPence, 3)}p ÷ ${fmtMilesPerKwh(input.ev.milesPerKwh)} miles per kWh = ${n2(r.ev.pencePerMile, 3)}p a mile`,
      ],
    },
    {
      title: "Cost",
      lines: [
        `${fuel}: ${miles(r.monthlyMiles)} miles × ${n2(r.ice.pencePerMile, 3)}p = £${n2(r.ice.monthly)} a month, £${n2(r.ice.annual)} a year`,
        `Electric: ${miles(r.monthlyMiles)} miles × ${n2(r.ev.pencePerMile, 3)}p = £${n2(r.ev.monthly)} a month, £${n2(r.ev.annual)} a year`,
        `Difference: £${n2(Math.abs(r.saving.monthly))} a month, £${n2(Math.abs(r.saving.annual))} a year and £${n2(Math.abs(r.saving.overTerm))} over ${input.termMonths} months, ${r.saving.monthly >= 0 ? "in favour of electric" : `in favour of ${labels.iceFuel}`}`,
      ],
    },
  ];
}

// ─── Living with it: charging ──────────────────────────────────────────────
//
// What a week of the customer's mileage means in charging, from the
// official figures alone. Energy is at the plug (the WLTP consumption), so
// hours on a charger are energy ÷ the charger's power with nothing added.

/** The most a single-phase UK home charger delivers. */
export const HOME_CHARGER_KW = 7.4;
/** Three-phase AC at a depot or workplace: the most these vehicles take on AC. */
export const DEPOT_CHARGER_KW = 11;
export const WEEKS_PER_YEAR = 52;
/** Rapid charging is quoted 10 to 80%: 70% of the battery, so 70% of the range. */
export const RAPID_SHARE = 0.7;

export interface EvRange {
  batteryKwh: number | null;
  rangeMiles: number | null;
  motorwayMiles: number | null;
  dcKw: number | null;
  dcMinutes: number | null;
}

export interface ChargingInsight {
  weeklyMiles: number;
  /** At the plug. */
  weeklyKwh: number;
  /** A week's miles over the official range: full charges' worth. */
  chargesPerWeek: number | null;
  motorwayChargesPerWeek: number | null;
  homeHours: number;
  depotHours: number;
  rapid: { stopsPerWeek: number; minutes: number; kw: number | null; milesAdded: number } | null;
}

export function chargingInsight(annualMiles: number, milesPerKwh: number, ev: EvRange): ChargingInsight | null {
  if (!(annualMiles > 0) || !(milesPerKwh > 0)) return null;
  const weeklyMiles = annualMiles / WEEKS_PER_YEAR;
  const weeklyKwh = weeklyMiles / milesPerKwh;
  const range = ev.rangeMiles != null && ev.rangeMiles > 0 ? ev.rangeMiles : null;
  const motorway = ev.motorwayMiles != null && ev.motorwayMiles > 0 ? ev.motorwayMiles : null;
  return {
    weeklyMiles,
    weeklyKwh,
    chargesPerWeek: range ? weeklyMiles / range : null,
    motorwayChargesPerWeek: motorway ? weeklyMiles / motorway : null,
    homeHours: weeklyKwh / HOME_CHARGER_KW,
    depotHours: weeklyKwh / DEPOT_CHARGER_KW,
    rapid: range && ev.dcMinutes
      ? { stopsPerWeek: weeklyMiles / (range * RAPID_SHARE), minutes: ev.dcMinutes, kw: ev.dcKw, milesAdded: range * RAPID_SHARE }
      : null,
  };
}

/** "About once a week", "About twice a week", "Every week or two", "About once every 3 weeks". */
export function howOften(perWeek: number): string {
  if (!(perWeek > 0)) return "";
  if (perWeek >= 0.75) {
    const n = Math.round(perWeek);
    return n === 1 ? "About once a week" : n === 2 ? "About twice a week" : `About ${n} times a week`;
  }
  if (perWeek >= 0.55) return "Every week or two";
  return `About once every ${Math.round(1 / perWeek)} weeks`;
}

/** Hours as "6h 30m", to the nearest 5 minutes; "45m" under an hour. */
export function hoursText(h: number): string {
  const mins = Math.max(5, Math.round((h * 60) / 5) * 5);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return hh ? `${hh}h${mm ? ` ${mm}m` : ""}` : `${mm}m`;
}

/** The charging figures' own workings, step by step, like the cost's. */
export function chargingWorkings(annualMiles: number, milesPerKwh: number, ev: EvRange, c: ChargingInsight): string[] {
  const d1 = (n: number) => n2(n, 1);
  const lines = [
    `${annualMiles.toLocaleString("en-GB")} miles a year ÷ ${WEEKS_PER_YEAR} = ${d1(c.weeklyMiles)} miles a week`,
    `${d1(c.weeklyMiles)} miles ÷ ${fmtMilesPerKwh(milesPerKwh)} miles per kWh = ${d1(c.weeklyKwh)} kWh a week, at the plug`,
    `Home: ${d1(c.weeklyKwh)} kWh ÷ ${HOME_CHARGER_KW} kW = ${n2(c.homeHours)} hours a week`,
    `Depot: ${d1(c.weeklyKwh)} kWh ÷ ${DEPOT_CHARGER_KW} kW = ${n2(c.depotHours)} hours a week`,
  ];
  if (c.chargesPerWeek != null && ev.rangeMiles) lines.push(`Full charges: ${d1(c.weeklyMiles)} miles ÷ ${n2(ev.rangeMiles, 0)}-mile range = ${n2(c.chargesPerWeek)} a week`);
  if (c.rapid && ev.rangeMiles) lines.push(`Rapid, 10 to 80%: ${Math.round(RAPID_SHARE * 100)}% of ${n2(ev.rangeMiles, 0)} miles = ${d1(c.rapid.milesAdded)} miles a stop, ${n2(c.rapid.stopsPerWeek)} stops a week`);
  return lines;
}
