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

// One output row of the broker ratebook — keyed by slot + IRM, with the cheapest
// funder selected per (capCode, term, mileage, maintenance).
export interface BrokerRow {
  funderId: string;
  funderName: string;
  capCode: string;
  manufacturer: string;
  model: string;
  derivative: string;
  termMonths: number;
  annualMileage: number;
  isMaintained: boolean;
  initialRentalMultiplier: number;
  monthlyRental: number;        // includes commission
  monthlyMaintenance: number;   // unchanged across IRMs
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

function slotKey(r: { capCode: string; termMonths: number; annualMileage: number; isMaintained: boolean }) {
  return `${r.capCode}|${r.termMonths}|${r.annualMileage}|${r.isMaintained ? 1 : 0}`;
}

// Pick the cheapest funder per (capCode, term, mileage, maintenance) slot.
// "Cheapest" = monthlyRental + monthlyMaintenance.
export function bestPerSlot(rows: SourceRow[]): SourceRow[] {
  const best = new Map<string, SourceRow>();
  for (const r of rows) {
    const k = slotKey(r);
    const cur = best.get(k);
    const myTotal = r.monthlyRental + r.monthlyMaintenance;
    const curTotal = cur ? cur.monthlyRental + cur.monthlyMaintenance : Infinity;
    if (myTotal < curTotal) best.set(k, r);
  }
  return Array.from(best.values());
}

// Convert one 6×-IRM source row into N rows — one per IRM in IRM_OUTPUT — with
// the requested commission amortised across the payments.
//
// Math:
//   followOns = term - 1
//   totalCost = (6 + followOns) * baseRental
//   rentalAtN = (totalCost + commission) / (N + followOns)
//             = baseRental * (6 + followOns)/(N + followOns) + commission/(N + followOns)
//
// NOTE: when interest is introduced later, the conversion will need to spread
// interest across the (N + followOns) payments rather than treat them as flat.
export function expandIrms(row: SourceRow, commissionGbp: number): BrokerRow[] {
  const followOns = row.termMonths - 1;
  const totalContractCost = (6 + followOns) * row.monthlyRental;
  const out: BrokerRow[] = [];
  for (const n of IRM_OUTPUT) {
    const denom = n + followOns;
    const rentalAtN = (totalContractCost + commissionGbp) / denom;
    out.push({
      funderId: row.funderId,
      funderName: row.funderName,
      capCode: row.capCode,
      manufacturer: row.manufacturer,
      model: row.model,
      derivative: row.derivative,
      termMonths: row.termMonths,
      annualMileage: row.annualMileage,
      isMaintained: row.isMaintained,
      initialRentalMultiplier: n,
      monthlyRental: round2(rentalAtN),
      monthlyMaintenance: round2(row.monthlyMaintenance),
      isVan: row.isVan,
      fuelType: row.fuelType,
    });
  }
  return out;
}

export function buildBrokerRows(source: SourceRow[], commissionGbp: number): BrokerRow[] {
  const best = bestPerSlot(source);
  const out: BrokerRow[] = [];
  for (const r of best) out.push(...expandIrms(r, commissionGbp));
  // Sort for stable, readable output.
  out.sort((a, b) =>
    a.manufacturer.localeCompare(b.manufacturer) ||
    a.model.localeCompare(b.model) ||
    a.derivative.localeCompare(b.derivative) ||
    a.capCode.localeCompare(b.capCode) ||
    Number(a.isMaintained) - Number(b.isMaintained) ||
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
