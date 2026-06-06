"use server";
import { db } from "@/db";
import { brokerQuotes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBrokerUser } from "@/lib/auth-guard";

// All quote mutations re-resolve the current broker user and scope on
// broker_id, never on broker_user_id — so any user at the broker can
// edit/delete a quote (per spec) but no broker can ever reach another
// broker's quotes via a crafted id.

export async function deleteBrokerQuoteAction(id: string) {
  const me = await requireBrokerUser();
  await db.delete(brokerQuotes).where(and(eq(brokerQuotes.id, id), eq(brokerQuotes.brokerId, me.brokerId)));
  revalidatePath("/broker/quotes");
  redirect("/broker/quotes");
}
