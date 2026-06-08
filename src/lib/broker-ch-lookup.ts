import "server-only";
import { db } from "@/db";
import { funders, ratebook } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

// Contract Hire pricing lives in the existing TF `ratebook` table, keyed
// on cap_code. The broker portal bridges to it via the cap_code column
// admins set on each broker_vehicle_cash_values row.
//
// Each lookup tuple is (capCode × IRM × term × mileage × isBusiness ×
// isMaintained) — multiple funders may have rentals for the same tuple,
// so we return them all and let the form rank by cheapest monthly.

export interface ContractHireQuery {
  capCode: string;
  termMonths: number;
  annualMileage: number;
  isBusiness: boolean;
  isMaintained: boolean;
}

export interface ContractHireOption {
  funderId: string;
  funderName: string;
  initialRentalMultiplier: number;
  monthlyRentalGbp: number;
  monthlyMaintenanceGbp: number;
  excessMileagePence: number | null;
}

// Returns every IRM × funder combination available for the requested
// spec, sorted cheapest monthly first. IRMs typically come in 1, 3, 6,
// 9, 12 — the form groups them so the broker can compare "low upfront,
// high monthly" vs "high upfront, low monthly".
export async function findContractHireOptions(q: ContractHireQuery): Promise<ContractHireOption[]> {
  const rows = await db
    .select({
      funderId: ratebook.funderId,
      funderName: funders.name,
      irm: ratebook.initialRentalMultiplier,
      monthlyRental: ratebook.monthlyRental,
      monthlyMaintenance: ratebook.monthlyMaintenance,
      excessMileage: ratebook.excessMileage,
    })
    .from(ratebook)
    .innerJoin(funders, eq(funders.id, ratebook.funderId))
    .where(and(
      eq(ratebook.capCode, q.capCode),
      eq(ratebook.termMonths, q.termMonths),
      eq(ratebook.annualMileage, q.annualMileage),
      eq(ratebook.isBusiness, q.isBusiness),
      eq(ratebook.isMaintained, q.isMaintained),
    ))
    .orderBy(asc(ratebook.initialRentalMultiplier), asc(ratebook.monthlyRental));

  return rows.map((r) => ({
    funderId: r.funderId,
    funderName: r.funderName,
    initialRentalMultiplier: r.irm,
    monthlyRentalGbp: r.monthlyRental,
    monthlyMaintenanceGbp: r.monthlyMaintenance,
    excessMileagePence: r.excessMileage,
  }));
}

// What term/mileage/IRM combinations the ratebook covers for a given
// cap_code — drives the form's pickers so brokers only see options
// that'll actually return a rental.
export async function findContractHireAvailability(capCode: string, isBusiness: boolean, isMaintained: boolean) {
  const rows = await db
    .select({
      irm: ratebook.initialRentalMultiplier,
      term: ratebook.termMonths,
      mileage: ratebook.annualMileage,
    })
    .from(ratebook)
    .where(and(
      eq(ratebook.capCode, capCode),
      eq(ratebook.isBusiness, isBusiness),
      eq(ratebook.isMaintained, isMaintained),
    ));
  const irms = new Set<number>();
  const terms = new Set<number>();
  const mileages = new Set<number>();
  for (const r of rows) {
    irms.add(r.irm);
    terms.add(r.term);
    mileages.add(r.mileage);
  }
  return {
    irms: [...irms].sort((a, b) => a - b),
    terms: [...terms].sort((a, b) => a - b),
    mileages: [...mileages].sort((a, b) => a - b),
  };
}
