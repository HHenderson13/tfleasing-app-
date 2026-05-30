import { db } from "@/db";
import { ratebook, vehicles, funders, funderInterestRates } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// Fallback annual interest rate when a (funder, term) pair has no entry in
// funder_interest_rates. Matches the Pricing Engine's `rate_adjuster.interest_rate` default.
const DEFAULT_ANNUAL_RATE = 0.07;

// Commission tiers (£) that produce one ratebook file each.
export const COMMISSION_TIERS = [0, 300, 500, 750] as const;
export type CommissionTier = (typeof COMMISSION_TIERS)[number];

// Initial-rental multipliers to publish in the broker ratebook.
// Stored ratebook only contains 6× — the rest are derived by re-solving for the
// same total contract cost using `followOns = term - 1`:
//   totalCost = (6 + followOns) * rentalAt6
//   rentalAtN = totalCost / (N + followOns)
// Commission is amortised across the same (N + followOns) payments.
export const IRM_OUTPUT = [1, 3, 6, 9, 12] as const;

// Row pulled from the DB — one ratebook entry joined with vehicle metadata.
export interface SourceRow {
  funderId: string;
  funderName: string;
  capCode: string;
  capId: string | null;
  termMonths: number;
  annualMileage: number;
  isMaintained: boolean;
  monthlyRental: number;
  monthlyMaintenance: number;
  excessMileage: number | null;
  model: string;
  derivative: string;
  isVan: boolean;
  fuelType: string | null;
  listPriceNet: number | null;
  manufacturer: string;
}

// One merged row per (capCode, term, mileage) slot — bare rental from cheapest
// non-maintained funder, maintenance from cheapest maintained funder.
export interface MergedSlot {
  capCode: string;
  capId: string | null;
  manufacturer: string;
  model: string;
  derivative: string;
  termMonths: number;
  annualMileage: number;
  excessMileage: number | null;  // pence/mile from the rental ratebook row
  isVan: boolean;
  fuelType: string | null;
  // Rental side
  bareRental: number;            // monthlyRental at 6× upfront
  rentalFunderId: string;
  rentalFunderName: string;
  // Maintenance side — cheapest maintenance value across maintained funders
  maintenance: number;           // 0 only when this slot is dropped upstream
  maintenanceFunderId: string;
  maintenanceFunderName: string;
}

// One output row of the broker ratebook — one per (slot × IRM × commission tier).
export interface BrokerRow {
  funderId: string;              // rental funder — for the Funder column
  funderName: string;
  capCode: string;
  capId: string | null;
  manufacturer: string;
  model: string;
  derivative: string;
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier: number;
  monthlyRental: number;         // bare rental @ IRM, with commission added
  monthlyMaintenance: number;    // unchanged across IRMs
  excessMileage: number | null;
  maintenanceFunderName: string; // maintenance source (often same as funderName)
  isVan: boolean;
  fuelType: string | null;
}

export async function loadBrokerSourceRows(): Promise<SourceRow[]> {
  const rows = await db
    .select({
      funderId: ratebook.funderId,
      funderName: funders.name,
      capCode: ratebook.capCode,
      capId: vehicles.capId,
      termMonths: ratebook.termMonths,
      annualMileage: ratebook.annualMileage,
      isMaintained: ratebook.isMaintained,
      monthlyRental: ratebook.monthlyRental,
      monthlyMaintenance: ratebook.monthlyMaintenance,
      excessMileage: ratebook.excessMileage,
      model: vehicles.model,
      derivative: vehicles.derivative,
      isVan: vehicles.isVan,
      fuelType: vehicles.fuelType,
      listPriceNet: vehicles.listPriceNet,
    })
    .from(ratebook)
    .innerJoin(vehicles, eq(vehicles.capCode, ratebook.capCode))
    .innerJoin(funders, eq(funders.id, ratebook.funderId))
    .where(
      sql`${ratebook.initialRentalMultiplier} = 6
        AND ${ratebook.isBusiness} = 1
        AND ${vehicles.model} != 'Unknown'`
    );

  return rows.map((r) => ({
    funderId: r.funderId,
    funderName: r.funderName,
    capCode: r.capCode,
    capId: r.capId,
    termMonths: r.termMonths,
    annualMileage: r.annualMileage,
    isMaintained: !!r.isMaintained,
    monthlyRental: r.monthlyRental,
    monthlyMaintenance: r.monthlyMaintenance,
    excessMileage: r.excessMileage,
    model: r.model,
    derivative: r.derivative,
    isVan: !!r.isVan,
    fuelType: r.fuelType,
    listPriceNet: r.listPriceNet,
    // Manufacturer isn't tracked explicitly; everything in this system is Ford.
    manufacturer: "Ford",
  }));
}

function groupKey(r: { capCode: string; termMonths: number; annualMileage: number }) {
  return `${r.capCode}|${r.termMonths}|${r.annualMileage}`;
}

// One row per (capCode, term, mileage):
//   • bareRental = cheapest monthlyRental from non-maintained funders.
//     Falls back to cheapest maintained rental only if non-maintained is missing.
//   • maintenance = cheapest monthlyMaintenance (>0) from any maintained funder.
//   • Slots with no maintained funder at all are dropped (per spec).
export function mergePerSlot(rows: SourceRow[]): MergedSlot[] {
  type Acc = {
    base: SourceRow;
    bestNonMaintained: SourceRow | null;
    bestMaintained: SourceRow | null;          // by rental
    cheapestMaintenanceFunder: SourceRow | null; // by maintenance value
  };
  const groups = new Map<string, Acc>();

  for (const r of rows) {
    const k = groupKey(r);
    const cur = groups.get(k);
    const acc: Acc = cur ?? {
      base: r,
      bestNonMaintained: null,
      bestMaintained: null,
      cheapestMaintenanceFunder: null,
    };
    if (r.isMaintained) {
      if (!acc.bestMaintained || r.monthlyRental < acc.bestMaintained.monthlyRental) {
        acc.bestMaintained = r;
      }
      // Cheapest maintenance pays only attention to the maintenance figure.
      // A funder selling maintenance for £30 wins over one selling at £50
      // even if their rentals differ.
      if (
        r.monthlyMaintenance > 0 &&
        (!acc.cheapestMaintenanceFunder || r.monthlyMaintenance < acc.cheapestMaintenanceFunder.monthlyMaintenance)
      ) {
        acc.cheapestMaintenanceFunder = r;
      }
    } else {
      if (!acc.bestNonMaintained || r.monthlyRental < acc.bestNonMaintained.monthlyRental) {
        acc.bestNonMaintained = r;
      }
    }
    groups.set(k, acc);
  }

  const out: MergedSlot[] = [];
  for (const acc of groups.values()) {
    // Drop slots without any maintained funder — the spec says skip when no
    // maintenance value is available.
    if (!acc.cheapestMaintenanceFunder) continue;

    const rentalSource = acc.bestNonMaintained ?? acc.bestMaintained;
    if (!rentalSource) continue; // shouldn't happen — maintained implies a row exists

    const m = acc.cheapestMaintenanceFunder;
    out.push({
      capCode: rentalSource.capCode,
      capId: rentalSource.capId,
      manufacturer: rentalSource.manufacturer,
      model: rentalSource.model,
      derivative: rentalSource.derivative,
      termMonths: rentalSource.termMonths,
      annualMileage: rentalSource.annualMileage,
      excessMileage: rentalSource.excessMileage,
      isVan: rentalSource.isVan,
      fuelType: rentalSource.fuelType,
      bareRental: rentalSource.monthlyRental,
      rentalFunderId: rentalSource.funderId,
      rentalFunderName: rentalSource.funderName,
      maintenance: m.monthlyMaintenance,
      maintenanceFunderId: m.funderId,
      maintenanceFunderName: m.funderName,
    });
  }
  return out;
}

// Maps (funderId, termFollowOns) → annualRate. Populated from
// funder_interest_rates; unknown pairs fall back to DEFAULT_ANNUAL_RATE.
export type InterestRateMap = Map<string, number>;

function rateKey(funderId: string, termFollowOns: number) {
  return `${funderId}|${termFollowOns}`;
}

export async function loadInterestRates(): Promise<InterestRateMap> {
  const rows = await db.select().from(funderInterestRates);
  const map: InterestRateMap = new Map();
  for (const r of rows) map.set(rateKey(r.funderId, r.termFollowOns), r.annualRate);
  return map;
}

function lookupAnnualRate(rates: InterestRateMap, funderId: string, termFollowOns: number): number {
  return rates.get(rateKey(funderId, termFollowOns)) ?? DEFAULT_ANNUAL_RATE;
}

// Annuity-due (payments at start of period) PMT — the periodic payment that
// fully amortises a present-value loan `pv` over `nper` periods at periodic
// `rate`. Matches numpy_financial.pmt(rate, nper, pv, when='begin') with a sign
// flip (we want positive outflow). Falls back to flat split when rate = 0.
function pmtDue(rate: number, nper: number, pv: number): number {
  if (pv === 0 || nper === 0) return 0;
  if (rate === 0) return pv / nper;
  const f = Math.pow(1 + rate, nper);
  return (pv * rate * f) / ((f - 1) * (1 + rate));
}

// Standard annuity factor — present value of N unit payments at periodic
// rate r, paid at end of each period. When r = 0 this collapses to N, so the
// NPV-equivalence formula below reduces to the flat split at zero rate.
function annuityFactor(rate: number, nper: number): number {
  if (rate === 0 || nper === 0) return nper;
  return (1 - Math.pow(1 + rate, -nper)) / rate;
}

// Convert one merged 6×-IRM slot into N rows — one per IRM in IRM_OUTPUT —
// applying interest in BOTH directions: positive when going to lower upfront
// (less pre-paid → more financed → higher rental) and negative when going to
// higher upfront (more pre-paid → less financed → lower rental).
//
// Bare-rental upfront conversion (NPV-equivalence):
//   followOns  = termMonths - 1
//   monthlyRate = annualRate / 12         (looked up by rental funder + term)
//   ann        = annuityFactor(monthlyRate, followOns)
//   npv@6      = bareRental × (6 + ann)   ← implied NPV of the 6× lease
//   bareAtN    = npv@6 / (N + ann)        ← same NPV, different payment shape
//
// This is the standard finance industry formula and reproduces the Novuna
// ratebook calc output exactly: at 8% APR on a 48-month lease, a 288.84
// rental at 6× upfront yields 323.83 at 1× / 308.83 at 3× / 271.20 at 9× /
// 255.58 at 12× — all within £0.05 of the funder's published numbers.
//
// Commission addition (annuity-due PMT — amortised on top):
//   commissionPmt = pmtDue(monthlyRate, N + followOns, commissionGbp)
//   rental@N      = bareAtN + commissionPmt
//
// Net effect: smaller deposit → both bare AND commission contributions rise
// (more capital under interest); larger deposit → both fall. At rate = 0
// the entire formula collapses to the flat math we had previously, so the
// behaviour at the £0-commission / 0-rate corner is unchanged.
export function expandIrms(
  slot: MergedSlot,
  commissionGbp: number,
  rates: InterestRateMap,
): BrokerRow[] {
  const followOns = slot.termMonths - 1;
  // Bare rental side — rate is the rental funder's.
  const annualRate = lookupAnnualRate(rates, slot.rentalFunderId, followOns);
  const monthlyRate = annualRate / 12;
  const ann = annuityFactor(monthlyRate, followOns);
  // Implied NPV of the source (6×) lease — held constant when re-spreading
  // to other upfronts. With rate = 0, ann = followOns and npvAt6 reduces to
  // (6 + followOns) × bareRental — the old flat "total contract cost".
  const npvAt6 = slot.bareRental * (6 + ann);
  // Maintenance side — its own funder might differ from the rental funder
  // (mergePerSlot picks each independently for the cheapest offer). Use the
  // maintenance funder's rate so the NPV conservation matches how that
  // funder finances the service contract. When maintenance is zero this
  // loop is a no-op.
  const hasMaint = slot.maintenance > 0;
  const maintAnnualRate = hasMaint ? lookupAnnualRate(rates, slot.maintenanceFunderId, followOns) : 0;
  const maintMonthlyRate = maintAnnualRate / 12;
  const maintAnn = hasMaint ? annuityFactor(maintMonthlyRate, followOns) : followOns;
  const maintNpvAt6 = slot.maintenance * (6 + maintAnn);
  const out: BrokerRow[] = [];
  for (const n of IRM_OUTPUT) {
    const denom = n + followOns;
    const bareAtN = npvAt6 / (n + ann);
    const commissionPmt = pmtDue(monthlyRate, denom, commissionGbp);
    const rentalAtN = bareAtN + commissionPmt;
    const maintAtN = hasMaint ? maintNpvAt6 / (n + maintAnn) : 0;
    out.push({
      funderId: slot.rentalFunderId,
      funderName: slot.rentalFunderName,
      capCode: slot.capCode,
      capId: slot.capId,
      manufacturer: slot.manufacturer,
      model: slot.model,
      derivative: slot.derivative,
      termMonths: slot.termMonths,
      annualMileage: slot.annualMileage,
      initialRentalMultiplier: n,
      monthlyRental: round2(rentalAtN),
      monthlyMaintenance: round2(maintAtN),
      excessMileage: slot.excessMileage,
      maintenanceFunderName: slot.maintenanceFunderName,
      isVan: slot.isVan,
      fuelType: slot.fuelType,
    });
  }
  return out;
}

export function buildBrokerRows(
  source: SourceRow[],
  commissionGbp: number,
  rates: InterestRateMap,
): BrokerRow[] {
  const slots = mergePerSlot(source);
  const out: BrokerRow[] = [];
  for (const s of slots) out.push(...expandIrms(s, commissionGbp, rates));
  // Sort for stable, readable output.
  out.sort((a, b) =>
    a.manufacturer.localeCompare(b.manufacturer) ||
    a.model.localeCompare(b.model) ||
    a.derivative.localeCompare(b.derivative) ||
    a.capCode.localeCompare(b.capCode) ||
    a.termMonths - b.termMonths ||
    a.annualMileage - b.annualMileage ||
    a.initialRentalMultiplier - b.initialRentalMultiplier
  );
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function commissionFileLabel(c: number): string {
  return `£${c} Commission`;
}

export function commissionSheetLabel(c: number): string {
  return `£${c} Comms`;
}
