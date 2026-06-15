"use server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  checkPassword,
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";

// Completes a password reset. Mirrors completeSetupAction exactly — the
// reset token uses the same users.setupToken column and the same expiry
// rules. On success: writes the new hash, clears the token, creates a
// session, and lands the user on the home page (signed in).
export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { error: "Reset link is missing." };
  if (password !== confirm) return { error: "Passwords don't match." };
  const pw = checkPassword(password);
  if (!pw.ok) return { error: "Password doesn't meet the requirements." };
  const [u] = await db.select().from(users).where(eq(users.setupToken, token)).limit(1);
  if (!u) return { error: "This reset link is invalid or has already been used. Request a new one." };
  if (u.setupTokenExpiresAt && u.setupTokenExpiresAt.getTime() < Date.now()) {
    return { error: "This reset link has expired. Request a new one from the sign-in page." };
  }
  await db.update(users).set({
    passwordHash: await hashPassword(password),
    setupToken: null,
    setupTokenExpiresAt: null,
    updatedAt: new Date(),
  }).where(eq(users.id, u.id));
  const sid = await createSession(u.id);
  await setSessionCookie(sid);
  redirect("/");
}
