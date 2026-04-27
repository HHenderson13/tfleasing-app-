"use server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
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
import { cookies } from "next/headers";

export async function signInAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) return { error: "Invalid email or password." };
  const ok = await verifyPassword(password, u.passwordHash);
  if (!ok) return { error: "Invalid email or password." };
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
