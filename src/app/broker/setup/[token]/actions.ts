"use server";
import { db } from "@/db";
import { brokerUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  checkPassword,
  createBrokerSession,
  hashPassword,
  setBrokerSessionCookie,
} from "@/lib/broker-auth";

export async function completeBrokerSetupAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { error: "Setup link is missing." };
  if (password !== confirm) return { error: "Passwords don't match." };
  const pw = checkPassword(password);
  if (!pw.ok) return { error: "Password doesn't meet the requirements." };
  const [u] = await db.select().from(brokerUsers).where(eq(brokerUsers.setupToken, token)).limit(1);
  if (!u) return { error: "This setup link is invalid or already used." };
  if (u.setupTokenExpiresAt && u.setupTokenExpiresAt.getTime() < Date.now()) {
    return { error: "This setup link has expired. Ask your broker administrator for a new one." };
  }
  await db.update(brokerUsers).set({
    passwordHash: await hashPassword(password),
    setupToken: null,
    setupTokenExpiresAt: null,
    updatedAt: new Date(),
  }).where(eq(brokerUsers.id, u.id));
  const sid = await createBrokerSession(u.id);
  await setBrokerSessionCookie(sid);
  redirect("/broker");
}
