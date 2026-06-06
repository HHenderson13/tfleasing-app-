"use server";
import { db } from "@/db";
import { brokerSessions, brokerUsers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hashPassword, newSetupToken } from "@/lib/broker-auth";
import { requireBrokerOwner } from "@/lib/auth-guard";

// Broker-owner self-service. Every action re-resolves the current owner
// and scopes its write to their broker_id — a crafted user_id from
// another broker silently no-ops.

async function ownedUser(userId: string) {
  const me = await requireBrokerOwner();
  const [row] = await db
    .select()
    .from(brokerUsers)
    .where(and(eq(brokerUsers.id, userId), eq(brokerUsers.brokerId, me.brokerId)))
    .limit(1);
  return { me, row };
}

export async function createTeamUserAction(input: { name: string; email: string; role: "owner" | "user" }) {
  const me = await requireBrokerOwner();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) return { ok: false as const, error: "Name and email required." };
  const role = input.role === "owner" ? "owner" : "user";
  const id = randomUUID();
  const now = new Date();
  const { token, expiresAt } = newSetupToken();
  const placeholder = await hashPassword(randomUUID() + randomUUID());
  try {
    await db.insert(brokerUsers).values({
      id,
      brokerId: me.brokerId,
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
  revalidatePath("/broker/users");
  return { ok: true as const, setupPath: `/broker/setup/${token}`, expiresAt: expiresAt.toISOString() };
}

export async function setTeamUserActiveAction(userId: string, active: boolean) {
  const { me, row } = await ownedUser(userId);
  if (!row) return { ok: false as const, error: "User not found." };
  if (row.id === me.id) return { ok: false as const, error: "You can't disable yourself." };
  await db.update(brokerUsers).set({ active, updatedAt: new Date() }).where(eq(brokerUsers.id, userId));
  if (!active) {
    await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, userId));
  }
  revalidatePath("/broker/users");
  return { ok: true as const };
}

export async function setTeamUserRoleAction(userId: string, role: "owner" | "user") {
  const { me, row } = await ownedUser(userId);
  if (!row) return { ok: false as const, error: "User not found." };
  if (row.id === me.id && role !== "owner") return { ok: false as const, error: "You can't demote yourself." };
  await db.update(brokerUsers).set({ role, updatedAt: new Date() }).where(eq(brokerUsers.id, userId));
  revalidatePath("/broker/users");
  return { ok: true as const };
}

export async function resetTeamUserSetupTokenAction(userId: string) {
  const { row } = await ownedUser(userId);
  if (!row) return { ok: false as const, error: "User not found." };
  const { token, expiresAt } = newSetupToken();
  await db.update(brokerUsers).set({
    setupToken: token,
    setupTokenExpiresAt: expiresAt,
    updatedAt: new Date(),
  }).where(eq(brokerUsers.id, userId));
  await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, userId));
  revalidatePath("/broker/users");
  return { ok: true as const, setupPath: `/broker/setup/${token}`, expiresAt: expiresAt.toISOString() };
}
