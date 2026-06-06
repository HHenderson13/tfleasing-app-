"use server";
import { db } from "@/db";
import { brokers, brokerSessions, brokerUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword, newSetupToken } from "@/lib/broker-auth";

// Server actions for the TF-admin side of the broker portal. The broker
// owners' parallel "manage my own team" actions live in
// src/app/broker/users/actions.ts.

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
  if (!active) {
    const userRows = await db.select({ id: brokerUsers.id }).from(brokerUsers).where(eq(brokerUsers.brokerId, id));
    for (const u of userRows) {
      await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, u.id));
    }
  }
  revalidatePath("/admin/brokers");
  revalidatePath(`/admin/brokers/${id}`);
  return { ok: true as const };
}

// Creates a broker user with a randomly-generated password that's
// immediately replaced by the setup flow. The admin gets back the
// setup URL to email / paste into Teams. Same pattern as the TF
// admin/users new-user flow.
export async function createBrokerUserAction(input: {
  brokerId: string;
  name: string;
  email: string;
  role: "owner" | "user";
}) {
  await requireAdmin();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) return { ok: false as const, error: "Name and email required." };
  const role = input.role === "owner" ? "owner" : "user";
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
      role,
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

export async function setBrokerUserRoleAction(input: { brokerId: string; userId: string; role: "owner" | "user" }) {
  await requireAdmin();
  await db.update(brokerUsers).set({ role: input.role, updatedAt: new Date() }).where(eq(brokerUsers.id, input.userId));
  revalidatePath(`/admin/brokers/${input.brokerId}`);
  return { ok: true as const };
}

export async function resetBrokerUserSetupTokenAction(input: { brokerId: string; userId: string }) {
  await requireAdmin();
  const { token, expiresAt } = newSetupToken();
  await db.update(brokerUsers).set({
    setupToken: token,
    setupTokenExpiresAt: expiresAt,
    updatedAt: new Date(),
  }).where(eq(brokerUsers.id, input.userId));
  // Invalidate live sessions so the user must re-authenticate via setup.
  await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, input.userId));
  revalidatePath(`/admin/brokers/${input.brokerId}`);
  return { ok: true as const, setupPath: `/broker/setup/${token}`, expiresAt: expiresAt.toISOString() };
}
