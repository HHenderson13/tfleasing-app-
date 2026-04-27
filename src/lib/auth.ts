import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

export const ROLES = ["admin", "exec", "quote", "stock"] as const;
export type Role = (typeof ROLES)[number];

export const SESSION_COOKIE = "tf_session";
const SESSION_DAYS = 14;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  salesExecId: string | null;
}

export interface PasswordPolicyResult {
  ok: boolean;
  failures: string[];
  checks: { label: string; passed: boolean }[];
}

export function checkPassword(pw: string): PasswordPolicyResult {
  const checks = [
    { label: "At least 12 characters", passed: pw.length >= 12 },
    { label: "An uppercase letter (A–Z)", passed: /[A-Z]/.test(pw) },
    { label: "A lowercase letter (a–z)", passed: /[a-z]/.test(pw) },
    { label: "A number (0–9)", passed: /[0-9]/.test(pw) },
    { label: "A special character (e.g. ! @ # $ %)", passed: /[^A-Za-z0-9]/.test(pw) },
  ];
  const failures = checks.filter((c) => !c.passed).map((c) => c.label);
  return { ok: failures.length === 0, failures, checks };
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pw, hash);
}

export function newSetupToken(): { token: string; expiresAt: Date } {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  return { token, expiresAt };
}

function parseRoles(json: string): Role[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((r): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r));
  } catch {
    return [];
  }
}

export function serializeRoles(roles: Role[]): string {
  return JSON.stringify(Array.from(new Set(roles)));
}

export async function userCount(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id, userId, expiresAt, createdAt: now });
  return id;
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function setSessionCookie(sessionId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const now = new Date();
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      roles: users.roles,
      salesExecId: users.salesExecId,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roles: parseRoles(row.roles),
    salesExecId: row.salesExecId,
  };
}

export function isAdmin(u: CurrentUser | null): boolean {
  return !!u && u.roles.includes("admin");
}
export function isExec(u: CurrentUser | null): boolean {
  return !!u && (u.roles.includes("exec") || isAdmin(u));
}
export function canQuote(u: CurrentUser | null): boolean {
  return !!u && (isAdmin(u) || isExec(u) || u.roles.includes("quote"));
}
export function canStock(u: CurrentUser | null): boolean {
  return !!u && (isAdmin(u) || isExec(u) || u.roles.includes("stock"));
}
export function canSeeProposals(u: CurrentUser | null): boolean {
  return isAdmin(u) || isExec(u);
}
export function canSeeOrders(u: CurrentUser | null): boolean {
  return isAdmin(u) || isExec(u);
}

export interface SectionAccess {
  quote: boolean;
  stock: boolean;
  proposals: boolean;
  orders: boolean;
  reports: boolean;
  admin: boolean;
}

export function sectionAccess(u: CurrentUser | null): SectionAccess {
  return {
    quote: canQuote(u),
    stock: canStock(u),
    proposals: canSeeProposals(u),
    orders: canSeeOrders(u),
    reports: isAdmin(u),
    admin: isAdmin(u),
  };
}
