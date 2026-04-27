"use server";
import { db } from "@/db";
import { customers, funders, proposalEvents, proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

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
  model: string;
  derivative: string;
  funderId: string;
  monthlyRental: number;
  termMonths: number;
  annualMileage: number;
  contract: "PCH" | "BCH";
  maintenance: "customer" | "maintained";
  vin?: string | null;
  orderNumber?: string | null;
  financeProposalNumber?: string | null;
  manualEtaAt?: string | null;
  manualLocation?: string | null;
}) {
  try {
    const name = input.customerName.trim();
    if (!name) return { ok: false as const, error: "Customer name required" };
    if (!input.model.trim() || !input.derivative.trim()) return { ok: false as const, error: "Model and derivative required" };

    const [funder] = await db.select().from(funders).where(eq(funders.id, input.funderId)).limit(1);
    if (!funder) return { ok: false as const, error: "Funder not found" };

    const now = new Date();
    const customerId = randomUUID();
    await db.insert(customers).values({ id: customerId, name, createdAt: now });

    const id = randomUUID();
    const eta = input.manualEtaAt ? new Date(input.manualEtaAt) : null;
    if (eta && Number.isNaN(eta.getTime())) return { ok: false as const, error: "Bad ETA date" };

    await db.insert(proposals).values({
      id,
      customerId,
      salesExecId: null,
      isBroker: false,
      isGroupBq: false,
      capCode: "",
      model: input.model.trim(),
      derivative: input.derivative.trim(),
      contract: input.contract,
      maintenance: input.maintenance,
      termMonths: input.termMonths,
      annualMileage: input.annualMileage,
      initialRentalMultiplier: 6,
      funderId: input.funderId,
      funderName: funder.name,
      funderRank: 1,
      financeProposalNumber: input.financeProposalNumber?.trim() || null,
      monthlyRental: input.monthlyRental,
      status: "awaiting_delivery",
      acceptedAt: now,
      chipConfirmed: true,
      motorCompleteSigned: true,
      financeAgreementSigned: true,
      orderNumber: input.orderNumber?.trim() || null,
      vin: input.vin?.trim() || null,
      manualEtaAt: eta,
      manualLocation: input.manualLocation?.trim() || null,
      manualEtaUpdatedAt: eta || input.manualLocation ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(proposalEvents).values({
      proposalId: id,
      kind: "created",
      toStatus: "awaiting_delivery",
      note: `Back-loaded into awaiting delivery (${funder.name}, £${input.monthlyRental.toFixed(2)}/mo).`,
      createdAt: now,
    });
    revalidatePath("/orders/awaiting");
    return { ok: true as const, proposalId: id, customerId };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}
