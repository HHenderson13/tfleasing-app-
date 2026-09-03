"use server";
import { db } from "@/db";
import { preRegVehicles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { STOCK_VEHICLES_TAG } from "@/lib/stock-list";

// Pre-reg vehicles are merged into the mapped-stock cache, so every write
// here has to bust it or the change does not show for up to five minutes and
// looks like it failed.
function reval() {
  updateTag(STOCK_VEHICLES_TAG);
  revalidatePath("/admin/pre-reg");
  revalidatePath("/stock");
}

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function savePreRegVehicleAction(form: FormData) {
  await requireAdmin();
  const id = clean(form.get("id"));
  const bucket = clean(form.get("bucket"));
  const colour = clean(form.get("colour"));
  const regNumber = clean(form.get("regNumber"));
  const registered = clean(form.get("registeredAt"));

  if (!bucket) return { ok: false as const, error: "Model is required." };
  if (!colour) return { ok: false as const, error: "Colour is required." };
  if (!regNumber) return { ok: false as const, error: "Reg number is required." };
  if (!registered) return { ok: false as const, error: "Date of registration is required." };
  const registeredAt = new Date(`${registered}T12:00:00`);
  if (isNaN(registeredAt.getTime())) return { ok: false as const, error: "That date isn't valid." };
  // Midday rather than midnight: a date-only value parsed at midnight can
  // land on the previous day once a timezone is applied, and a registration
  // date that moves is a registration date nobody trusts.

  const row = {
    bucket,
    variant: clean(form.get("variant")),
    derivative: clean(form.get("derivative")),
    bodyStyle: clean(form.get("bodyStyle")),
    engine: clean(form.get("engine")),
    transmission: clean(form.get("transmission")),
    drive: clean(form.get("drive")),
    colour,
    modelYear: clean(form.get("modelYear")),
    options: clean(form.get("options")),
    dealer: clean(form.get("dealer")),
    destination: clean(form.get("destination")),
    regNumber: regNumber.toUpperCase(),
    registeredAt,
    vin: clean(form.get("vin"))?.toUpperCase() ?? null,
    notes: clean(form.get("notes")),
    updatedAt: new Date(),
  };

  if (id) {
    await db.update(preRegVehicles).set(row).where(eq(preRegVehicles.id, id));
  } else {
    await db.insert(preRegVehicles).values({
      id: randomUUID(),
      ...row,
      status: "available",
      soldAt: null,
      createdAt: new Date(),
    });
  }
  reval();
  return { ok: true as const };
}

// Off both stock lists, but the row stays: sales fall through, and the
// vehicle needs to be able to come back without being retyped.
export async function markPreRegSoldAction(id: string) {
  await requireAdmin();
  await db.update(preRegVehicles)
    .set({ status: "sold", soldAt: new Date(), updatedAt: new Date() })
    .where(eq(preRegVehicles.id, id));
  reval();
  return { ok: true as const };
}

export async function markPreRegAvailableAction(id: string) {
  await requireAdmin();
  await db.update(preRegVehicles)
    .set({ status: "available", soldAt: null, updatedAt: new Date() })
    .where(eq(preRegVehicles.id, id));
  reval();
  return { ok: true as const };
}

// Invoiced. The only irreversible step, and deliberately so — by this point
// the money has moved and there is nothing to put back.
export async function deletePreRegVehicleAction(id: string) {
  await requireAdmin();
  await db.delete(preRegVehicles).where(eq(preRegVehicles.id, id));
  reval();
  return { ok: true as const };
}
