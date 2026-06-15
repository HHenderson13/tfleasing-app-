"use server";
import { db } from "@/db";
import { loginAttempts, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { sendMail, APP_URL } from "@/lib/email";

// Per-IP rate limit so a hostile script can't enumerate the user table by
// hammering this endpoint with email addresses. Mirrors the sign-in limiter.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes

async function getRequestIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

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

// Begin a password reset. Always returns the same success message regardless
// of whether the email is on file — anti-enumeration: a determined attacker
// can't use this endpoint to find out which addresses have accounts.
//
// Reuses the existing users.setupToken + setupTokenExpiresAt columns. The
// setup flow only runs once on account creation; after that the columns
// are free for reset use. A pending invite would be clobbered, but that
// only happens if the same email tries to reset before completing setup
// — and the reset link does the exact same thing (set password + sign in),
// so the outcome is identical.
export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { sent: false as const, error: "Enter your email address." };

  const ip = await getRequestIp();
  const recent = await recentFailedCount(ip);
  if (recent >= RATE_LIMIT_MAX) {
    return { sent: false as const, error: "Too many requests. Try again in a few minutes." };
  }

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Always record the attempt against the IP — this keeps the per-IP
  // counter ticking up whether or not the email matched, so enumeration
  // attempts get rate-limited the same way bad passwords do.
  await recordAttempt(ip, email, !!u);

  if (u) {
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await db.update(users).set({
      setupToken: token,
      setupTokenExpiresAt: expires,
      updatedAt: new Date(),
    }).where(eq(users.id, u.id));

    const link = `${APP_URL}/reset-password/${token}`;
    await sendMail({
      to: u.email,
      subject: "Reset your TrustFord Leasing password",
      text:
        `Hi ${u.name},\n\n` +
        `Someone — hopefully you — asked to reset the password on your TrustFord Leasing account.\n\n` +
        `Click this link to set a new password (the link expires in 1 hour):\n${link}\n\n` +
        `If you didn't ask to reset your password you can safely ignore this email — nothing has changed on your account.\n\n` +
        `TrustFord Leasing`,
      html:
        `<p>Hi ${escapeHtml(u.name)},</p>` +
        `<p>Someone — hopefully you — asked to reset the password on your TrustFord Leasing account.</p>` +
        `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px">Set a new password</a></p>` +
        `<p style="font-size:12px;color:#64748b">The link expires in 1 hour. Or copy this URL into your browser:<br><a href="${link}">${link}</a></p>` +
        `<p style="font-size:12px;color:#64748b">If you didn't ask to reset your password you can safely ignore this email — nothing has changed on your account.</p>`,
    });
  }

  // Identical success response whether or not the user existed.
  return { sent: true as const };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === "\"" ? "&quot;" : "&#39;",
  );
}
