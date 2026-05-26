"use server";
import { db } from "@/db";
import { customers, funders, proposalEvents, proposals, salesExecs } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

// Back-loaded deal entry comes straight from a form; treat as untrusted.
// VIN must be exactly 11 alphanumeric chars (Ford convention used elsewhere).
const createAwaitingSchema = z
  .object({
    customerName: z.string().trim().min(1, "Customer name required").max(200),
    businessName: z.string().trim().max(200).nullable().optional(),
    model: z.string().trim().min(1, "Model required").max(120),
    derivative: z.string().trim().min(1, "Derivative required").max(200),
    vin: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{11}$/, "VIN must be 11 letters/numbers"))
      .nullable()
      .optional(),
    orderNumber: z.string().trim().max(40).nullable().optional(),
    salesExecId: z.string().min(1, "Sales exec required"),
  })
  .refine((d) => !!d.vin || !!d.orderNumber, {
    message: "VIN or order number required",
    path: ["vin"],
  });

export async function updateManualEtaAction(
  proposalId: string,
  patch: { manualEtaAt?: string | null; manualLocation?: string | null }
) {
  try {
    const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
    if (!p) return { ok: false as const, error: "Proposal not found" };

    const now = new Date();
    const clean: Record<string, unknown> = { updatedAt: now, manualEtaUpdatedAt: now };
    const notes: string[] = [];

    if (patch.manualEtaAt !== undefined) {
      const v = patch.manualEtaAt ? new Date(patch.manualEtaAt) : null;
      if (v && Number.isNaN(v.getTime())) return { ok: false as const, error: "Bad ETA date" };
      clean.manualEtaAt = v;
      notes.push(`Manual ETA ${v ? v.toISOString().slice(0, 10) : "cleared"}`);
    }
    if (patch.manualLocation !== undefined) {
      const v = patch.manualLocation?.trim() || null;
      clean.manualLocation = v;
      notes.push(`Location ${v ?? "cleared"}`);
    }

    await db.update(proposals).set(clean).where(eq(proposals.id, proposalId));
    if (notes.length) {
      await db.insert(proposalEvents).values({
        proposalId,
        kind: "note",
        note: notes.join(" · "),
        createdAt: now,
      });
    }
    revalidatePath("/orders/awaiting");
    revalidatePath(`/customers/${p.customerId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function createAwaitingDealAction(input: {
  customerName: string;
  businessName?: string | null;
  model: string;
  derivative: string;
  vin?: string | null;
  orderNumber?: string | null;
  salesExecId: string;
}) {
  try {
    await requireAdmin();
    const parsed = createAwaitingSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { customerName: name, businessName, model, derivative, vin, orderNumber, salesExecId } = parsed.data;
    const vinClean = vin ?? null;
    const orderClean = orderNumber ?? null;

    const [exec] = await db.select().from(salesExecs).where(eq(salesExecs.id, salesExecId)).limit(1);
    if (!exec) return { ok: false as const, error: "Exec not found" };

    // Pick any funder as a placeholder — back-loaded deals are excluded from
    // reports so the funder/term/rental fields are display-only.
    const [funder] = await db.select().from(funders).orderBy(asc(funders.name)).limit(1);
    if (!funder) return { ok: false as const, error: "No funders configured" };

    const now = new Date();
    const customerId = randomUUID();
    await db.insert(customers).values({
      id: customerId,
      name,
      businessName: businessName ?? null,
      createdAt: now,
    });

    const id = randomUUID();
    await db.insert(proposals).values({
      id,
      customerId,
      salesExecId: exec.id,
      isBroker: false,
      isGroupBq: false,
      capCode: "",
      model,
      derivative,
      contract: "BCH",
      maintenance: "customer",
      termMonths: 0,
      annualMileage: 0,
      initialRentalMultiplier: 0,
      funderId: funder.id,
      funderName: funder.name,
      funderRank: 1,
      monthlyRental: 0,
      status: "awaiting_delivery",
      acceptedAt: now,
      chipConfirmed: true,
      motorCompleteSigned: true,
      financeAgreementSigned: true,
      orderNumber: orderClean,
      vin: vinClean,
      backLoaded: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(proposalEvents).values({
      proposalId: id,
      kind: "created",
      toStatus: "awaiting_delivery",
      note: `Back-loaded into awaiting delivery by admin (allocated to ${exec.name}).`,
      createdAt: now,
    });
    revalidatePath("/orders/awaiting");
    return { ok: true as const, proposalId: id, customerId };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}
