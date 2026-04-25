"use server";
import { db } from "@/db";
import { funderCommission } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
  revalidatePath("/admin/commissions");
}
