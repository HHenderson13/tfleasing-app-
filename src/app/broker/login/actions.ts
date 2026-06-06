"use server";
import { db } from "@/db";
import { brokers, brokerUsers, loginAttempts } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import {
  BROKER_SESSION_COOKIE,
  clearBrokerSessionCookie,
  createBrokerSession,
  deleteBrokerSession,
  setBrokerSessionCookie,
  verifyPassword,
} from "@/lib/broker-auth";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function getRequestIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

// Re-using the existing login_attempts table — the broker login flow logs
// failures with a synthetic ip-prefix so admins can audit them separately
// if needed (search "broker:" in the table).
async function recentFailedCount(ip: string): Promise<number> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const rows = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.ip, `broker:${ip}`),
      eq(loginAttempts.success, false),
      gt(loginAttempts.attemptedAt, cutoff),
    ));
  return rows.length;
}

async function recordAttempt(ip: string, email: string | null, success: boolean): Promise<void> {
  await db.insert(loginAttempts).values({
    ip: `broker:${ip}`,
    email,
    success,
    attemptedAt: new Date(),
  });
}

export async function brokerSignInAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const ip = await getRequestIp();
  const failed = await recentFailedCount(ip);
  if (failed >= RATE_LIMIT_MAX) {
    return { error: "Too many sign-in attempts. Try again in 15 minutes." };
  }

  // Same DB query joins broker so disabled brokers immediately can't sign in.
  const [row] = await db
    .select({
      id: brokerUsers.id,
      passwordHash: brokerUsers.passwordHash,
      userActive: brokerUsers.active,
      brokerActive: brokers.active,
    })
    .from(brokerUsers)
    .innerJoin(brokers, eq(brokerUsers.brokerId, brokers.id))
    .where(eq(brokerUsers.email, email))
    .limit(1);

  // Constant-time-ish error to avoid leaking which emails exist.
  const generic = "Email or password is incorrect.";
  if (!row) {
    await recordAttempt(ip, email, false);
    return { error: generic };
  }
  if (!row.userActive || !row.brokerActive) {
    await recordAttempt(ip, email, false);
    return { error: "This account is disabled. Contact your broker administrator." };
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    await recordAttempt(ip, email, false);
    return { error: generic };
  }
  await recordAttempt(ip, email, true);
  const sessionId = await createBrokerSession(row.id);
  await setBrokerSessionCookie(sessionId);
  redirect("/broker");
}

export async function brokerSignOutAction() {
  const jar = await cookies();
  const sid = jar.get(BROKER_SESSION_COOKIE)?.value;
  if (sid) await deleteBrokerSession(sid);
  await clearBrokerSessionCookie();
  redirect("/broker/login");
}
