"use server";
import { db } from "@/db";
import { vehicleMaster, vehicleOptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import type { FuelType, ProfitMode } from "@/lib/vehicle-master";

interface VehicleInput {
  modelYear: string;
  model: string;
  bodystyle: string;
  derivative: string;
  engine: string;
  drive: string;
  transmission: string;
  capCode: string | null;
  capId: string | null;
  basicListPriceGbp: number;
  manufacturerDeliveryGbp: number;
  fuelType: FuelType;
  isVan: boolean;
  co2GKm: number | null;
  pivgGrantGbp: number;
  olevGrantGbp: number;
  oneFDiscountPct: number;
  marginBucketId: string | null;
  profitMode: ProfitMode;
  profitValue: number;
  notes: string | null;
}

function trim(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

const FUEL_TYPES: FuelType[] = ["ice", "phev", "bev"];
const PROFIT_MODES: ProfitMode[] = ["gbp", "pct"];

export async function createVehicleMasterAction(input: VehicleInput) {
  await requireAdmin();
  const required: (keyof VehicleInput)[] = ["modelYear", "model", "bodystyle", "derivative", "engine", "drive", "transmission"];
  for (const k of required) {
    const v = input[k];
    if (typeof v !== "string" || !v.trim()) return { ok: false as const, error: `${k} is required.` };
  }
  if (!FUEL_TYPES.includes(input.fuelType)) return { ok: false as const, error: "Pick a fuel type." };
  if (!PROFIT_MODES.includes(input.profitMode)) return { ok: false as const, error: "Pick a profit mode." };
  if (!Number.isFinite(input.basicListPriceGbp) || input.basicListPriceGbp <= 0) return { ok: false as const, error: "Basic list price must be > 0." };
  if (input.profitValue < 0 || !Number.isFinite(input.profitValue)) return { ok: false as const, error: "Profit must be ≥ 0." };

  const id = randomUUID();
  const now = new Date();
  await db.insert(vehicleMaster).values({
    id,
    modelYear: input.modelYear.trim(),
    model: input.model.trim(),
    bodystyle: input.bodystyle.trim(),
    derivative: input.derivative.trim(),
    engine: input.engine.trim(),
    drive: input.drive.trim(),
    transmission: input.transmission.trim(),
    capCode: trim(input.capCode),
    capId: trim(input.capId),
    basicListPriceGbp: input.basicListPriceGbp,
    manufacturerDeliveryGbp: input.manufacturerDeliveryGbp,
    fuelType: input.fuelType,
    isVan: input.isVan,
    co2GKm: input.co2GKm,
    pivgGrantGbp: input.pivgGrantGbp,
    olevGrantGbp: input.olevGrantGbp,
    oneFDiscountPct: input.oneFDiscountPct,
    marginBucketId: trim(input.marginBucketId),
    profitMode: input.profitMode,
    profitValue: input.profitValue,
    notes: trim(input.notes),
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/vehicles");
  return { ok: true as const, id };
}

const NUMERIC_FIELDS: (keyof VehicleInput)[] = [
  "basicListPriceGbp", "manufacturerDeliveryGbp", "co2GKm",
  "pivgGrantGbp", "olevGrantGbp", "oneFDiscountPct", "profitValue",
];
const STRING_FIELDS: (keyof VehicleInput)[] = [
  "modelYear", "model", "bodystyle", "derivative", "engine", "drive", "transmission",
];

export async function updateVehicleMasterAction(id: string, patch: Partial<VehicleInput>) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of NUMERIC_FIELDS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null) clean[k] = null;
    else if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[k] = v;
  }
  for (const k of STRING_FIELDS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  }
  if (patch.capCode !== undefined) clean.capCode = trim(patch.capCode);
  if (patch.capId !== undefined) clean.capId = trim(patch.capId);
  if (patch.notes !== undefined) clean.notes = trim(patch.notes);
  if (patch.fuelType !== undefined && FUEL_TYPES.includes(patch.fuelType)) clean.fuelType = patch.fuelType;
  if (patch.isVan !== undefined) clean.isVan = !!patch.isVan;
  if (patch.profitMode !== undefined && PROFIT_MODES.includes(patch.profitMode)) clean.profitMode = patch.profitMode;
  if (patch.marginBucketId !== undefined) clean.marginBucketId = trim(patch.marginBucketId);
  if (Object.keys(clean).length === 1) return { ok: true as const };
  await db.update(vehicleMaster).set(clean).where(eq(vehicleMaster.id, id));
  revalidatePath("/admin/broker-data/vehicles");
  return { ok: true as const };
}

export async function deleteVehicleMasterAction(id: string) {
  await requireAdmin();
  // Drop options first so we don't leave orphans.
  await db.delete(vehicleOptions).where(eq(vehicleOptions.vehicleId, id));
  await db.delete(vehicleMaster).where(eq(vehicleMaster.id, id));
  revalidatePath("/admin/broker-data/vehicles");
  return { ok: true as const };
}

interface OptionInput {
  vehicleId: string;
  optionCode: string | null;
  label: string;
  priceGbp: number;
}

export async function createVehicleOptionAction(input: OptionInput) {
  await requireAdmin();
  if (!input.label.trim()) return { ok: false as const, error: "Option label is required." };
  if (!Number.isFinite(input.priceGbp) || input.priceGbp < 0) return { ok: false as const, error: "Price must be ≥ 0." };
  const existing = await db.select().from(vehicleOptions).where(eq(vehicleOptions.vehicleId, input.vehicleId));
  const sortOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;
  const id = randomUUID();
  const now = new Date();
  await db.insert(vehicleOptions).values({
    id,
    vehicleId: input.vehicleId,
    optionCode: trim(input.optionCode),
    label: input.label.trim(),
    priceGbp: input.priceGbp,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/vehicles");
  return { ok: true as const, id };
}

export async function updateVehicleOptionAction(id: string, patch: { optionCode?: string | null; label?: string; priceGbp?: number }) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label !== undefined && patch.label.trim()) clean.label = patch.label.trim();
  if (patch.optionCode !== undefined) clean.optionCode = trim(patch.optionCode);
  if (typeof patch.priceGbp === "number" && Number.isFinite(patch.priceGbp) && patch.priceGbp >= 0) clean.priceGbp = patch.priceGbp;
  if (Object.keys(clean).length === 1) return { ok: true as const };
  await db.update(vehicleOptions).set(clean).where(eq(vehicleOptions.id, id));
  revalidatePath("/admin/broker-data/vehicles");
  return { ok: true as const };
}

export async function deleteVehicleOptionAction(id: string) {
  await requireAdmin();
  await db.delete(vehicleOptions).where(eq(vehicleOptions.id, id));
  revalidatePath("/admin/broker-data/vehicles");
  return { ok: true as const };
}
