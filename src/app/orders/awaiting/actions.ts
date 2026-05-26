"use server";
import { db } from "@/db";
import { customers, funders, proposalEvents, proposals, salesExecs } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-guard";

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
    const name = input.customerName.trim();
    if (!name) return { ok: false as const, error: "Customer name required" };
    if (!input.model.trim() || !input.derivative.trim()) return { ok: false as const, error: "Model and derivative required" };
    const vinClean = input.vin?.trim().toUpperCase() || null;
    const orderClean = input.orderNumber?.trim() || null;
    if (!vinClean && !orderClean) return { ok: false as const, error: "VIN or order number required" };

    const [exec] = await db.select().from(salesExecs).where(eq(salesExecs.id, input.salesExecId)).limit(1);
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
      businessName: input.businessName?.trim() || null,
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
      model: input.model.trim(),
      derivative: input.derivative.trim(),
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
