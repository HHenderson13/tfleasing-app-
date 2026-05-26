"use server";
import { db } from "@/db";
import { loginAttempts, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import {
  checkPassword,
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  serializeRoles,
  setSessionCookie,
  userCount,
  verifyPassword,
  SESSION_COOKIE,
} from "@/lib/auth";
import { cookies, headers } from "next/headers";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function getRequestIp(): Promise<string> {
  // x-forwarded-for is set by Vercel's edge; fall back gracefully so local
  // dev (no proxy) still gets some value.
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

// Counts FAILED attempts from this IP in the last 15 minutes. A successful
// sign-in doesn't reset the counter — the row records success: true and is
// simply excluded from the count so a legitimate user isn't blocked by a
// burst of bad guesses immediately before they got the password right.
async function recentFailedCount(ip: string): Promise<number> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const rows = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.ip, ip),
      eq(loginAttempts.success, false),
      gt(loginAttempts.attemptedAt, cutoff),
    ));
  return rows.length;
}

async function recordAttempt(ip: string, email: string | null, success: boolean): Promise<void> {
  await db.insert(loginAttempts).values({
    ip,
    email,
    success,
    attemptedAt: new Date(),
  });
}

export async function signInAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const ip = await getRequestIp();
  const recent = await recentFailedCount(ip);
  if (recent >= RATE_LIMIT_MAX) {
    // Don't say "we're rate-limiting you" verbatim — keep the surface area
    // tight. The message is generic; ops can read login_attempts to see why.
    return { error: "Too many sign-in attempts. Try again in a few minutes." };
  }

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    await recordAttempt(ip, email, false);
    return { error: "Invalid email or password." };
  }
  const ok = await verifyPassword(password, u.passwordHash);
  if (!ok) {
    await recordAttempt(ip, email, false);
    return { error: "Invalid email or password." };
  }
  await recordAttempt(ip, email, true);
  const sid = await createSession(u.id);
  await setSessionCookie(sid);
  redirect("/");
}

export async function bootstrapAdminAction(_prev: unknown, formData: FormData) {
  if ((await userCount()) > 0) return { error: "Setup already completed. Please sign in." };
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email) return { error: "Name and email are required." };
  const pw = checkPassword(password);
  if (!pw.ok) return { error: "Password doesn't meet the requirements." };
  const now = new Date();
  const id = randomUUID();
  await db.insert(users).values({
    id,
    name,
    email,
    passwordHash: await hashPassword(password),
    roles: serializeRoles(["admin"]),
    salesExecId: null,
    createdAt: now,
    updatedAt: now,
  });
  const sid = await createSession(id);
  await setSessionCookie(sid);
  redirect("/");
}

export async function signOutAction() {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await deleteSession(sid);
  await clearSessionCookie();
  redirect("/login");
}
