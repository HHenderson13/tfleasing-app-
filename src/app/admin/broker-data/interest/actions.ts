"use server";
import { db } from "@/db";
import { brokerInterestRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

type VehicleClass = "car" | "van" | "all";
type CustomerType = "retail" | "business";
type Route = "pcp" | "hp" | "hp_balloon";
type FinanceProgramme = "1n" | "1f";

interface CreateInput {
  label: string;
  vehicleClass: VehicleClass;
  bucket: string | null;
  customerType: CustomerType;
  financeProgramme: FinanceProgramme | null;     // null = applies to both
  fundingRoute: Route;
  termMonths: number;
  annualAprPct: number;
  depositAllowanceGbp: number | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
}

function trim(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function createInterestRateAction(input: CreateInput) {
  await requireAdmin();
  const label = input.label.trim();
  if (!label) return { ok: false as const, error: "Label is required." };
  if (!["car", "van", "all"].includes(input.vehicleClass)) return { ok: false as const, error: "Pick a vehicle class." };
  if (!["retail", "business"].includes(input.customerType)) return { ok: false as const, error: "Pick a customer type." };
  if (input.financeProgramme !== null && !["1n", "1f"].includes(input.financeProgramme)) return { ok: false as const, error: "Pick a finance programme or leave it as Both." };
  if (!["pcp", "hp", "hp_balloon"].includes(input.fundingRoute)) return { ok: false as const, error: "Pick a funding route." };
  if (!Number.isFinite(input.termMonths) || input.termMonths <= 0) return { ok: false as const, error: "Term must be a positive number of months." };
  if (!Number.isFinite(input.annualAprPct) || input.annualAprPct < 0) return { ok: false as const, error: "APR must be a non-negative number." };

  const id = randomUUID();
  const now = new Date();
  await db.insert(brokerInterestRates).values({
    id,
    label,
    vehicleClass: input.vehicleClass,
    bucket: trim(input.bucket),
    customerType: input.customerType,
    financeProgramme: input.financeProgramme,
    fundingRoute: input.fundingRoute,
    termMonths: input.termMonths,
    annualAprPct: input.annualAprPct,
    depositAllowanceGbp:
      input.depositAllowanceGbp !== null && Number.isFinite(input.depositAllowanceGbp)
        ? input.depositAllowanceGbp
        : null,
    validFrom: parseDate(input.validFrom),
    validUntil: parseDate(input.validUntil),
    notes: trim(input.notes),
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/broker-data/interest");
  return { ok: true as const, id };
}

export async function updateInterestRateAction(
  id: string,
  patch: Partial<Pick<CreateInput, "annualAprPct" | "depositAllowanceGbp" | "notes">>,
) {
  await requireAdmin();
  const clean: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.annualAprPct === "number" && Number.isFinite(patch.annualAprPct) && patch.annualAprPct >= 0) {
    clean.annualAprPct = patch.annualAprPct;
  }
  if (patch.depositAllowanceGbp === null) clean.depositAllowanceGbp = null;
  else if (typeof patch.depositAllowanceGbp === "number" && Number.isFinite(patch.depositAllowanceGbp)) {
    clean.depositAllowanceGbp = patch.depositAllowanceGbp;
  }
  if (patch.notes !== undefined) clean.notes = trim(patch.notes);
  if (Object.keys(clean).length === 1) return { ok: true as const };
  await db.update(brokerInterestRates).set(clean).where(eq(brokerInterestRates.id, id));
  revalidatePath("/admin/broker-data/interest");
  return { ok: true as const };
}

export async function setInterestRateActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(brokerInterestRates).set({ active, updatedAt: new Date() }).where(eq(brokerInterestRates.id, id));
  revalidatePath("/admin/broker-data/interest");
  return { ok: true as const };
}

export async function deleteInterestRateAction(id: string) {
  await requireAdmin();
  await db.delete(brokerInterestRates).where(eq(brokerInterestRates.id, id));
  revalidatePath("/admin/broker-data/interest");
  return { ok: true as const };
}
