"use server";
import { db } from "@/db";
import { brokers, brokerSessions, brokerUsers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword, newSetupToken } from "@/lib/broker-auth";

// Every broker account is managed from here. Brokers have no self-service:
// they cannot invite colleagues, promote anyone, or reset their own
// password without us issuing a link. That is deliberate — the portal
// exposes our stock list, so who can see it stays a TF decision.

export async function createBrokerAction(input: { name: string }) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Name is required." };
  const id = randomUUID();
  const now = new Date();
  await db.insert(brokers).values({ id, name, active: true, createdAt: now, updatedAt: now });
  revalidatePath("/admin/brokers");
  return { ok: true as const, id };
}

export async function setBrokerActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(brokers).set({ active, updatedAt: new Date() }).where(eq(brokers.id, id));
  // Disabling a broker should also invalidate all live sessions for its
  // users so the next request kicks them out.
  if (!active) await deleteSessionsForBroker(id);
  revalidatePath("/admin/brokers");
  revalidatePath(`/admin/brokers/${id}`);
  return { ok: true as const };
}

// Permanent removal of a whole broker company: its users, their live
// sessions, and the broker row.
//
// The typed name is checked HERE rather than only in the dialog, so the
// confirmation is part of the operation instead of a UI courtesy. Disabling
// (setBrokerActiveAction) is the reversible option and locks everyone out
// just as effectively — this is for brokers we're finished with.
export async function deleteBrokerAction(input: { id: string; confirmName: string }) {
  await requireAdmin();
  const [broker] = await db.select().from(brokers).where(eq(brokers.id, input.id)).limit(1);
  if (!broker) return { ok: false as const, error: "Broker not found." };
  if (input.confirmName.trim().toLowerCase() !== broker.name.trim().toLowerCase()) {
    return { ok: false as const, error: `Type "${broker.name}" exactly to confirm.` };
  }
  await deleteSessionsForBroker(input.id);
  await db.delete(brokerUsers).where(eq(brokerUsers.brokerId, input.id));
  await db.delete(brokers).where(eq(brokers.id, input.id));
  revalidatePath("/admin/brokers");
  return { ok: true as const, name: broker.name };
}

// Creates a broker user with a randomly-generated password that's
// immediately replaced by the setup flow. The admin gets back the setup URL
// to email / paste into Teams. Same pattern as the TF admin/users flow.
export async function createBrokerUserAction(input: {
  brokerId: string;
  name: string;
  email: string;
}) {
  await requireAdmin();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) return { ok: false as const, error: "Name and email required." };
  const id = randomUUID();
  const now = new Date();
  const { token, expiresAt } = newSetupToken();
  // Random placeholder hash — the user must complete the setup flow before
  // any verifyPassword call would succeed against it.
  const placeholder = await hashPassword(randomUUID() + randomUUID());
  try {
    await db.insert(brokerUsers).values({
      id,
      brokerId: input.brokerId,
      name,
      email,
      passwordHash: placeholder,
      role: "user",
      active: true,
      setupToken: token,
      setupTokenExpiresAt: expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return { ok: false as const, error: "That email is already registered." };
  }
  revalidatePath(`/admin/brokers/${input.brokerId}`);
  return { ok: true as const, setupPath: `/broker/setup/${token}`, expiresAt: expiresAt.toISOString() };
}

export async function setBrokerUserActiveAction(input: { brokerId: string; userId: string; active: boolean }) {
  await requireAdmin();
  await db.update(brokerUsers).set({ active: input.active, updatedAt: new Date() }).where(eq(brokerUsers.id, input.userId));
  if (!input.active) {
    await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, input.userId));
  }
  revalidatePath(`/admin/brokers/${input.brokerId}`);
  return { ok: true as const };
}

// Permanent removal of one user. Disabling is the reversible option and
// keeps the row for the record; this is for people who should never have
// had an account, or who have left.
export async function deleteBrokerUserAction(input: { brokerId: string; userId: string }) {
  await requireAdmin();
  const [row] = await db.select({ name: brokerUsers.name }).from(brokerUsers).where(eq(brokerUsers.id, input.userId)).limit(1);
  if (!row) return { ok: false as const, error: "User not found." };
  await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, input.userId));
  await db.delete(brokerUsers).where(eq(brokerUsers.id, input.userId));
  revalidatePath(`/admin/brokers/${input.brokerId}`);
  revalidatePath("/admin/brokers");
  return { ok: true as const, name: row.name };
}

// Password reset. Brokers have no "forgot password" flow of their own — we
// issue the link. Mints a fresh setup token and drops every live session
// for that user, so a leaked or shared password stops working the moment
// the link is generated, not when it's used.
export async function issueBrokerPasswordResetAction(input: { brokerId: string; userId: string }) {
  await requireAdmin();
  const [row] = await db.select({ name: brokerUsers.name }).from(brokerUsers).where(eq(brokerUsers.id, input.userId)).limit(1);
  if (!row) return { ok: false as const, error: "User not found." };
  const { token, expiresAt } = newSetupToken();
  await db.update(brokerUsers).set({
    setupToken: token,
    setupTokenExpiresAt: expiresAt,
    updatedAt: new Date(),
  }).where(eq(brokerUsers.id, input.userId));
  await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, input.userId));
  revalidatePath(`/admin/brokers/${input.brokerId}`);
  return { ok: true as const, setupPath: `/broker/setup/${token}`, expiresAt: expiresAt.toISOString() };
}

// broker_sessions has no FK to broker_users, so the cascade is ours to do.
async function deleteSessionsForBroker(brokerId: string) {
  const ids = (await db.select({ id: brokerUsers.id }).from(brokerUsers).where(eq(brokerUsers.brokerId, brokerId))).map((u) => u.id);
  if (ids.length) await db.delete(brokerSessions).where(inArray(brokerSessions.brokerUserId, ids));
}
