"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireBrokerUser } from "@/lib/auth-guard";
import { recordTermsAcceptance } from "@/lib/broker-terms";

export async function acceptBrokerTermsAction() {
  const me = await requireBrokerUser();
  const h = await headers();
  await recordTermsAcceptance({
    me,
    ip: h.get("x-forwarded-for") ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  });
  redirect("/broker/stock");
}
