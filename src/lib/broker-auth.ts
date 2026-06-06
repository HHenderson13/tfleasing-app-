import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { db } from "@/db";
import { brokers, brokerSessions, brokerUsers } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { ensureAppSchema } from "@/db/ensure-schema";
import { checkPassword as checkPasswordPolicy, hashPassword, verifyPassword } from "./auth";

// Parallel auth system for the broker portal. Mirrors lib/auth.ts but uses
// its own cookie name, session table, and user table — strict separation
// of TF leasing-app sessions from broker-portal sessions. Middleware
// enforces that broker cookies cannot satisfy a TF route guard and vice
// versa (see src/middleware.ts).

export const BROKER_SESSION_COOKIE = "tf_broker_session";
const SESSION_DAYS = 14;

export type BrokerRole = "owner" | "user";

export interface CurrentBrokerUser {
  id: string;
  brokerId: string;
  brokerName: string;
  brokerActive: boolean;
  name: string;
  email: string;
  role: BrokerRole;
}

export function isBrokerOwner(u: CurrentBrokerUser | null): boolean {
  return !!u && u.role === "owner";
}

// Re-export the shared password policy so the broker setup flow uses the
// exact same rules as the leasing-app flow — no duplicate policy code.
export { checkPasswordPolicy as checkPassword, hashPassword, verifyPassword };

export function newSetupToken(): { token: string; expiresAt: Date } {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  return { token, expiresAt };
}

export async function createBrokerSession(brokerUserId: string): Promise<string> {
  const id = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(brokerSessions).values({ id, brokerUserId, expiresAt, createdAt: now });
  return id;
}

export async function deleteBrokerSession(id: string): Promise<void> {
  await db.delete(brokerSessions).where(eq(brokerSessions.id, id));
}

export async function setBrokerSessionCookie(sessionId: string) {
  const jar = await cookies();
  jar.set(BROKER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Scoped to /broker only — even if a broker cookie leaks somewhere it
    // physically cannot be sent to non-broker paths.
    path: "/broker",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearBrokerSessionCookie() {
  const jar = await cookies();
  jar.delete(BROKER_SESSION_COOKIE);
}

// React-cache wrapped per the same logic as getCurrentUser — repeated
// calls within a single request share the DB lookup.
export const getCurrentBrokerUser = cache(async function getCurrentBrokerUser(): Promise<CurrentBrokerUser | null> {
  await ensureAppSchema();
  const jar = await cookies();
  const sid = jar.get(BROKER_SESSION_COOKIE)?.value;
  if (!sid) return null;
  const now = new Date();
  const [row] = await db
    .select({
      id: brokerUsers.id,
      brokerId: brokerUsers.brokerId,
      brokerName: brokers.name,
      brokerActive: brokers.active,
      name: brokerUsers.name,
      email: brokerUsers.email,
      role: brokerUsers.role,
      userActive: brokerUsers.active,
    })
    .from(brokerSessions)
    .innerJoin(brokerUsers, eq(brokerSessions.brokerUserId, brokerUsers.id))
    .innerJoin(brokers, eq(brokerUsers.brokerId, brokers.id))
    .where(and(eq(brokerSessions.id, sid), gt(brokerSessions.expiresAt, now)))
    .limit(1);
  if (!row || !row.userActive || !row.brokerActive) return null;
  return {
    id: row.id,
    brokerId: row.brokerId,
    brokerName: row.brokerName,
    brokerActive: row.brokerActive,
    name: row.name,
    email: row.email,
    role: row.role === "owner" ? "owner" : "user",
  };
});

export async function brokerUserCount(brokerId: string): Promise<number> {
  const rows = await db
    .select({ id: brokerUsers.id })
    .from(brokerUsers)
    .where(eq(brokerUsers.brokerId, brokerId));
  return rows.length;
}
