import "server-only";
import { db } from "@/db";
import {
  vehicleMaster,
  vehicleOptions,
  marginBuckets,
  marginBucketRules,
  brokerSettings,
  carRflBands,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export type FuelType = "ice" | "phev" | "bev";
export type ProfitMode = "gbp" | "pct";

export interface VehicleKey {
  modelYear: string;
  model: string;
  bodystyle: string;
  derivative: string;
  engine: string;
  drive: string;
  transmission: string;
}

// Strict-match against the seven-attribute WERS identifier. Returns null
// if admin hasn't added pricing for this exact spec yet — the broker
// quote form falls back to a "no pricing" warning in that case.
export async function findVehicleMaster(key: VehicleKey) {
  const rows = await db
    .select()
    .from(vehicleMaster)
    .where(and(
      eq(vehicleMaster.modelYear, key.modelYear),
      eq(vehicleMaster.model, key.model),
      eq(vehicleMaster.bodystyle, key.bodystyle),
      eq(vehicleMaster.derivative, key.derivative),
      eq(vehicleMaster.engine, key.engine),
      eq(vehicleMaster.drive, key.drive),
      eq(vehicleMaster.transmission, key.transmission),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function listVehicleMaster() {
  return db.select().from(vehicleMaster).orderBy(
    asc(vehicleMaster.model),
    asc(vehicleMaster.modelYear),
    asc(vehicleMaster.derivative),
    asc(vehicleMaster.engine),
    asc(vehicleMaster.transmission),
  );
}

export async function listVehicleOptions(vehicleId: string) {
  return db.select().from(vehicleOptions)
    .where(eq(vehicleOptions.vehicleId, vehicleId))
    .orderBy(asc(vehicleOptions.sortOrder), asc(vehicleOptions.label));
}

export async function listMarginBuckets() {
  return db.select().from(marginBuckets).orderBy(asc(marginBuckets.name));
}

export async function listMarginBucketRules(bucketId: string) {
  return db.select().from(marginBucketRules)
    .where(eq(marginBucketRules.bucketId, bucketId))
    .orderBy(asc(marginBucketRules.sortOrder), asc(marginBucketRules.label));
}

// Cross-bucket fetch — used by the bucket list page to show "X rules"
// per row without N+1 queries.
export async function listAllMarginRules() {
  return db.select().from(marginBucketRules).orderBy(
    asc(marginBucketRules.bucketId),
    asc(marginBucketRules.sortOrder),
  );
}

export async function getBrokerSettings() {
  const [row] = await db.select().from(brokerSettings).where(eq(brokerSettings.id, 1)).limit(1);
  // ensure-schema seeds row 1; if it's somehow missing, return sensible
  // defaults so the page can still render.
  return row ?? {
    id: 1,
    firstRegFeeGbp: 55,
    pdiPlatesGbp: 135,
    cvRflIcePhevGbp: 335,
    cvRflBevGbp: 0,
    updatedAt: new Date(),
  };
}

export async function listCarRflBands() {
  return db.select().from(carRflBands).orderBy(asc(carRflBands.co2From));
}

// Lookup RFL for a CO2 value against the bands. Returns 0 if no band
// matches — admin will see vehicles fall through, prompting them to
// extend the matrix.
export function findCarRfl(bands: { co2From: number; co2To: number; rflGbp: number }[], co2: number): number {
  for (const b of bands) {
    if (co2 >= b.co2From && co2 <= b.co2To) return b.rflGbp;
  }
  return 0;
}
