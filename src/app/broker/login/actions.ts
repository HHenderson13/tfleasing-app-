"use server";
import { db } from "@/db";
import { brokers, brokerUsers, loginAttempts } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import {
  BROKER_SESSION_COOKIE,
  clearBrokerChallengeCookie,
  clearBrokerSessionCookie,
  createBrokerChallenge,
  deleteBrokerSession,
  setBrokerChallengeCookie,
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

  // One message for every failure, so none of them reveals whether the
  // address is one of ours.
  const generic = "Email or password is incorrect.";
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
      totpSecret: brokerUsers.totpSecret,
    })
    .from(brokerUsers)
    .innerJoin(brokers, eq(brokerUsers.brokerId, brokers.id))
    .where(eq(brokerUsers.email, email))
    .limit(1);

  if (!row) {
    await recordAttempt(ip, email, false);
    return { error: generic };
  }
  if (!row.userActive || !row.brokerActive) {
    // Deliberately the same message as a wrong password. Saying "this
    // account is disabled" confirms the address exists, which is a free
    // list of valid logins for anyone guessing.
    await recordAttempt(ip, email, false);
    return { error: generic };
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    await recordAttempt(ip, email, false);
    return { error: generic };
  }
  // Password accepted — but that is only the first factor. No session is
  // created here: the challenge record below grants access to nothing, and
  // only /broker/verify (or /broker/enrol, first time) can turn it into a
  // session. See lib/broker-auth.ts.
  await recordAttempt(ip, email, true);
  const challengeId = await createBrokerChallenge(row.id);
  await setBrokerChallengeCookie(challengeId);
  redirect(row.totpSecret ? "/broker/verify" : "/broker/enrol");
}

export async function brokerSignOutAction() {
  const jar = await cookies();
  const sid = jar.get(BROKER_SESSION_COOKIE)?.value;
  if (sid) await deleteBrokerSession(sid);
  await clearBrokerSessionCookie();
  // Also clear any half-finished sign-in, or a stale challenge cookie
  // survives the sign-out and confuses the next one.
  await clearBrokerChallengeCookie();
  redirect("/broker/login");
}
