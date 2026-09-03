"use server";
import { db } from "@/db";
import { preRegVehicles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { STOCK_VEHICLES_TAG } from "@/lib/stock-list";
import { normaliseReg, parseRegNumbers } from "@/lib/reg-numbers";

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
  const regInput = String(form.get("regNumbers") ?? "");
  const registered = clean(form.get("registeredAt"));

  if (!bucket) return { ok: false as const, error: "Model is required." };
  if (!colour) return { ok: false as const, error: "Colour is required." };
  const { regs, duplicates } = parseRegNumbers(regInput);
  if (regs.length === 0) return { ok: false as const, error: "Enter at least one registration number." };
  if (!registered) return { ok: false as const, error: "Date of registration is required." };
  const registeredAt = new Date(`${registered}T12:00:00`);
  if (isNaN(registeredAt.getTime())) return { ok: false as const, error: "That date isn't valid." };
  // Midday rather than midnight: a date-only value parsed at midnight can
  // land on the previous day once a timezone is applied, and a registration
  // date that moves is a registration date nobody trusts.

  // Twenty identical vans is one spec and twenty plates, so everything above
  // is shared and only the reg differs per row.
  const spec = {
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
    registeredAt,
    // A VIN belongs to ONE vehicle, so it is only meaningful on a single
    // entry. Attaching the same one to twenty rows would be a lie.
    vin: regs.length === 1 ? (clean(form.get("vin"))?.toUpperCase() ?? null) : null,
    notes: clean(form.get("notes")),
    updatedAt: new Date(),
  };

  if (id) {
    await db.update(preRegVehicles).set({ ...spec, regNumber: regs[0] }).where(eq(preRegVehicles.id, id));
    reval();
    return { ok: true as const, created: 1, skipped: [] as string[], duplicates };
  }

  // Skip plates already on the system rather than failing the whole paste.
  // Re-pasting an overlapping range is the obvious way to end up with the
  // same car twice, and a plate identifies exactly one car.
  const existing = new Set(
    (await db.select({ regNumber: preRegVehicles.regNumber }).from(preRegVehicles))
      .map((r) => normaliseReg(r.regNumber)),
  );
  const fresh = regs.filter((r) => !existing.has(normaliseReg(r)));
  const skipped = regs.filter((r) => existing.has(normaliseReg(r)));

  if (fresh.length === 0) {
    return { ok: false as const, error: `Already on the system: ${skipped.join(", ")}.` };
  }

  const now = new Date();
  await db.insert(preRegVehicles).values(
    fresh.map((regNumber) => ({
      id: randomUUID(),
      ...spec,
      regNumber,
      status: "available",
      soldAt: null,
      createdAt: now,
    })),
  );
  reval();
  return { ok: true as const, created: fresh.length, skipped, duplicates };
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
