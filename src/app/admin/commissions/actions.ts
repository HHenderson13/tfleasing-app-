"use server";
import { db } from "@/db";
import { funderCommission } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { FUNDER_COMMISSION_TAG } from "@/lib/cache-tags";

export async function updateCommission(input: {
  funderId: string;
  contract: "PCH" | "BCH";
  maintenance: "customer" | "maintained";
  commissionGbp: number;
}) {
  const where = and(
    eq(funderCommission.funderId, input.funderId),
    eq(funderCommission.contract, input.contract),
    eq(funderCommission.maintenance, input.maintenance),
  );
  const existing = await db.select().from(funderCommission).where(where).limit(1);
  if (existing.length) {
    await db.update(funderCommission).set({ commissionGbp: input.commissionGbp }).where(where);
  } else {
    await db.insert(funderCommission).values(input);
  }
  // Cross-request commissions cache → bust so quote requests see the
  // new commission immediately instead of waiting on the TTL.
  updateTag(FUNDER_COMMISSION_TAG);
  revalidatePath("/admin/commissions");
}
