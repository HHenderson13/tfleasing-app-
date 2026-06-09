"use server";
import { db } from "@/db";
import { brokerSettings, carRflBands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

interface SettingsPatch {
  firstRegFeeGbp?: number;
  pdiPlatesGbp?: number;
  cvRflIcePhevGbp?: number;
  cvRflBevGbp?: number;
}

export async function updateBrokerSettingsAction(patch: SettingsPatch) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["firstRegFeeGbp", "pdiPlatesGbp", "cvRflIcePhevGbp", "cvRflBevGbp"] as const) {
    const v = patch[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[k] = v;
  }
  if (Object.keys(clean).length === 1) return { ok: true as const };
  await db.update(brokerSettings).set(clean).where(eq(brokerSettings.id, 1));
  revalidatePath("/admin/broker-data/settings");
  return { ok: true as const };
}

interface CarRflBandInput {
  co2From: number;
  co2To: number;
  rflGbp: number;
}

export async function createCarRflBandAction(input: CarRflBandInput) {
  await requireAdmin();
  if (!Number.isFinite(input.co2From) || input.co2From < 0) return { ok: false as const, error: "CO2 from must be ≥ 0." };
  if (!Number.isFinite(input.co2To) || input.co2To < input.co2From) return { ok: false as const, error: "CO2 to must be ≥ CO2 from." };
  if (!Number.isFinite(input.rflGbp) || input.rflGbp < 0) return { ok: false as const, error: "RFL must be ≥ 0." };
  const id = randomUUID();
  const now = new Date();
  await db.insert(carRflBands).values({
    id,
    co2From: input.co2From,
    co2To: input.co2To,
    rflGbp: input.rflGbp,
    sortOrder: input.co2From,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/settings");
  return { ok: true as const, id };
}

export async function updateCarRflBandAction(id: string, patch: Partial<CarRflBandInput>) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.co2From === "number" && Number.isFinite(patch.co2From) && patch.co2From >= 0) {
    clean.co2From = patch.co2From;
    clean.sortOrder = patch.co2From;
  }
  if (typeof patch.co2To === "number" && Number.isFinite(patch.co2To) && patch.co2To >= 0) {
    clean.co2To = patch.co2To;
  }
  if (typeof patch.rflGbp === "number" && Number.isFinite(patch.rflGbp) && patch.rflGbp >= 0) {
    clean.rflGbp = patch.rflGbp;
  }
  if (Object.keys(clean).length === 1) return { ok: true as const };
  await db.update(carRflBands).set(clean).where(eq(carRflBands.id, id));
  revalidatePath("/admin/broker-data/settings");
  return { ok: true as const };
}

export async function deleteCarRflBandAction(id: string) {
  await requireAdmin();
  await db.delete(carRflBands).where(eq(carRflBands.id, id));
  revalidatePath("/admin/broker-data/settings");
  return { ok: true as const };
}
