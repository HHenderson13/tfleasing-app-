import { db } from "@/db";
import { ratebook, vehicles, funders } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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
  termMonths: number;
  annualMileage: number;
  isMaintained: boolean;
  monthlyRental: number;
  monthlyMaintenance: number;
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
  manufacturer: string;
  model: string;
  derivative: string;
  termMonths: number;
  annualMileage: number;
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
  manufacturer: string;
  model: string;
  derivative: string;
  termMonths: number;
  annualMileage: number;
  initialRentalMultiplier: number;
  monthlyRental: number;         // bare rental @ IRM, with commission added
  monthlyMaintenance: number;    // unchanged across IRMs
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
      termMonths: ratebook.termMonths,
      annualMileage: ratebook.annualMileage,
      isMaintained: ratebook.isMaintained,
      monthlyRental: ratebook.monthlyRental,
      monthlyMaintenance: ratebook.monthlyMaintenance,
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
    termMonths: r.termMonths,
    annualMileage: r.annualMileage,
    isMaintained: !!r.isMaintained,
    monthlyRental: r.monthlyRental,
    monthlyMaintenance: r.monthlyMaintenance,
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
      manufacturer: rentalSource.manufacturer,
      model: rentalSource.model,
      derivative: rentalSource.derivative,
      termMonths: rentalSource.termMonths,
      annualMileage: rentalSource.annualMileage,
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

// Convert one merged 6×-IRM slot into N rows — one per IRM in IRM_OUTPUT — with
// the requested commission amortised across the payments.
//
// Math:
//   followOns = term - 1
//   totalCost = (6 + followOns) * bareRental
//   rentalAtN = (totalCost + commission) / (N + followOns)
//             = bareRental * (6 + followOns)/(N + followOns) + commission/(N + followOns)
//
// NOTE: when interest is introduced later, the conversion will need to spread
// interest across the (N + followOns) payments rather than treat them as flat.
export function expandIrms(slot: MergedSlot, commissionGbp: number): BrokerRow[] {
  const followOns = slot.termMonths - 1;
  const totalContractCost = (6 + followOns) * slot.bareRental;
  const out: BrokerRow[] = [];
  for (const n of IRM_OUTPUT) {
    const denom = n + followOns;
    const rentalAtN = (totalContractCost + commissionGbp) / denom;
    out.push({
      funderId: slot.rentalFunderId,
      funderName: slot.rentalFunderName,
      capCode: slot.capCode,
      manufacturer: slot.manufacturer,
      model: slot.model,
      derivative: slot.derivative,
      termMonths: slot.termMonths,
      annualMileage: slot.annualMileage,
      initialRentalMultiplier: n,
      monthlyRental: round2(rentalAtN),
      monthlyMaintenance: round2(slot.maintenance),
      maintenanceFunderName: slot.maintenanceFunderName,
      isVan: slot.isVan,
      fuelType: slot.fuelType,
    });
  }
  return out;
}

export function buildBrokerRows(source: SourceRow[], commissionGbp: number): BrokerRow[] {
  const slots = mergePerSlot(source);
  const out: BrokerRow[] = [];
  for (const s of slots) out.push(...expandIrms(s, commissionGbp));
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
