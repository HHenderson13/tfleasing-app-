"use server";
import { getQuote, listDerivatives, listModels, type QuoteInput, type QuoteResult } from "@/lib/quote";
import { createProposal, type CreateProposalInput } from "@/lib/proposals";
import { db } from "@/db";
import { groupSites, salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getModelsAction() {
  return listModels();
}
export async function getDerivativesAction(model: string) {
  if (!model) return [];
  return listDerivatives(model);
}
export async function quoteAction(input: QuoteInput): Promise<QuoteResult> {
  return getQuote(input);
}

export async function listSalesExecsAction() {
  const rows = await db.select().from(salesExecs).orderBy(asc(salesExecs.name));
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email }));
}

export async function listGroupSitesAction() {
  const rows = await db.select().from(groupSites).orderBy(asc(groupSites.name));
  return rows.map((r) => ({ id: r.id, name: r.name, kind: (r.kind === "cv" ? "cv" : "car") as "car" | "cv" }));
}

export async function saveProposalAction(input: CreateProposalInput) {
  try {
    const res = await createProposal(input);
    revalidatePath("/proposals");
    revalidatePath(`/customers/${res.customerId}`);
    return { ok: true as const, ...res };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to save proposal" };
  }
}
