"use server";
import { changeStatus, createProposal, setStageCheck, updateOrderFields } from "@/lib/proposals";
import type { ProposalStatus } from "@/lib/proposal-constants";
import { db } from "@/db";
import { proposalEvents, proposals, salesExecs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getQuote } from "@/lib/quote";

function revalidateForProposal(customerId: string) {
  revalidatePath("/proposals");
  revalidatePath("/orders");
  revalidatePath(`/customers/${customerId}`);
}

export async function changeStatusAction(proposalId: string, toStatus: ProposalStatus, note?: string) {
  try {
    await changeStatus(proposalId, toStatus, note);
    const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
    if (p) revalidateForProposal(p.customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateOrderFieldsAction(
  proposalId: string,
  patch: Parameters<typeof updateOrderFields>[1]
) {
  try {
    await updateOrderFields(proposalId, patch);
    const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
    if (p) revalidateForProposal(p.customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

// Re-propose to another funder after a decline. The user picks the funder and Finance Proposal Number.
export async function reproposeAction(input: {
  parentProposalId: string;
  funderId: string;
  financeProposalNumber: string;
}) {
  const [parent] = await db.select().from(proposals).where(eq(proposals.id, input.parentProposalId)).limit(1);
  if (!parent) return { ok: false as const, error: "Proposal not found" };

  const nextRank = parent.funderRank + 1;
  if (nextRank > 3) return { ok: false as const, error: "Already tried 3 funders — mark as lost sale." };

  const quote = await getQuote({
    contract: parent.contract as "PCH" | "BCH",
    maintenance: parent.maintenance as "customer" | "maintained",
    model: parent.model,
    derivative: parent.derivative,
    termMonths: parent.termMonths,
    annualMileage: parent.annualMileage,
    initialRentalMultiplier: parent.initialRentalMultiplier,
  });
  const target = quote.funders.find((f) => f.funderId === input.funderId);
  if (!target) return { ok: false as const, error: "Chosen funder has no rate for this config." };

  try {
    const res = await createProposal({
      customerName: "",
      existingCustomerId: parent.customerId,
      salesExecId: parent.salesExecId,
      isBroker: parent.isBroker,
      brokerName: parent.brokerName,
      brokerEmail: parent.brokerEmail,
      isGroupBq: parent.isGroupBq,
      groupSiteId: parent.groupSiteId,
      capCode: parent.capCode,
      model: parent.model,
      derivative: parent.derivative,
      contract: parent.contract as "PCH" | "BCH",
      maintenance: parent.maintenance as "customer" | "maintained",
      termMonths: parent.termMonths,
      annualMileage: parent.annualMileage,
      initialRentalMultiplier: parent.initialRentalMultiplier,
      funderId: target.funderId,
      funderName: target.funderName,
      funderRank: nextRank,
      monthlyRental: target.totalMonthly,
      financeProposalNumber: input.financeProposalNumber,
      parentProposalId: input.parentProposalId,
      isEv: parent.isEv,
      wallboxIncluded: parent.wallboxIncluded,
      customerSavingGbp: parent.customerSavingGbp,
    });
    revalidateForProposal(parent.customerId);
    return { ok: true as const, proposalId: res.id, customerId: res.customerId };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateSalesExecAction(proposalId: string, salesExecId: string | null) {
  try {
    const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
    if (!p) return { ok: false as const, error: "Proposal not found" };
    if (p.isGroupBq) return { ok: false as const, error: "Group BQ deals can't have a sales exec." };

    let execName: string | null = null;
    if (salesExecId) {
      const [e] = await db.select().from(salesExecs).where(eq(salesExecs.id, salesExecId)).limit(1);
      if (!e) return { ok: false as const, error: "Sales exec not found" };
      execName = e.name;
    }
    if ((p.salesExecId ?? null) === (salesExecId ?? null)) return { ok: true as const };

    const now = new Date();
    await db.update(proposals).set({ salesExecId, updatedAt: now }).where(eq(proposals.id, proposalId));
    await db.insert(proposalEvents).values({
      proposalId,
      kind: "note",
      note: execName ? `Sales exec changed to ${execName}.` : "Sales exec cleared.",
      createdAt: now,
    });
    revalidateForProposal(p.customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setStageCheckAction(proposalId: string, checkId: string, value: boolean) {
  try {
    await setStageCheck(proposalId, checkId, value);
    const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
    if (p) revalidateForProposal(p.customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function listFundersForConfigAction(proposalId: string) {
  const [parent] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!parent) return [];
  const quote = await getQuote({
    contract: parent.contract as "PCH" | "BCH",
    maintenance: parent.maintenance as "customer" | "maintained",
    model: parent.model,
    derivative: parent.derivative,
    termMonths: parent.termMonths,
    annualMileage: parent.annualMileage,
    initialRentalMultiplier: parent.initialRentalMultiplier,
  });
  return quote.funders.map((f) => ({ id: f.funderId, name: f.funderName, rank: f.rank, monthly: f.totalMonthly }));
}
