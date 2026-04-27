"use server";
import { db } from "@/db";
import { salesExecs, sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  ROLES,
  type Role,
  newSetupToken,
  serializeRoles,
} from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";

function rolesFromForm(formData: FormData): Role[] {
  const out: Role[] = [];
  for (const r of ROLES) {
    if (formData.get(`role_${r}`) === "on") out.push(r);
  }
  return out;
}

async function resolveSalesExecId(formData: FormData, fallbackName: string, fallbackEmail: string): Promise<string | null> {
  const raw = String(formData.get("salesExecId") ?? "").trim();
  if (raw === "" || raw === "__none__") return null;
  if (raw === "__new__") {
    const id = randomUUID();
    await db.insert(salesExecs).values({
      id,
      name: fallbackName,
      email: fallbackEmail,
      createdAt: new Date(),
    });
    return id;
  }
  return raw;
}

export async function createUserAction(_prev: unknown, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roles = rolesFromForm(formData);
  if (!name || !email) return { error: "Name and email are required." };
  if (roles.length === 0) return { error: "Pick at least one role." };
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return { error: "A user with that email already exists." };
  const salesExecId = await resolveSalesExecId(formData, name, email);
  const now = new Date();
  const { token, expiresAt } = newSetupToken();
  const id = randomUUID();
  await db.insert(users).values({
    id,
    name,
    email,
    passwordHash: "",
    roles: serializeRoles(roles),
    salesExecId,
    setupToken: token,
    setupTokenExpiresAt: expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/admin/users");
  return { ok: true as const, setupToken: token };
}

export async function updateUserAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return;
  const roles = rolesFromForm(formData);
  const salesExecId = await resolveSalesExecId(formData, target.name, target.email);
  await db.update(users).set({
    roles: serializeRoles(roles),
    salesExecId,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
  revalidatePath("/admin/users");
}

export async function regenerateInviteAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { token, expiresAt } = newSetupToken();
  await db.update(users).set({
    passwordHash: "",
    setupToken: token,
    setupTokenExpiresAt: expiresAt,
    updatedAt: new Date(),
  }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === me.id) return;
  const target = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (target[0]?.roles.includes("admin")) {
    const allAdmins = await db.select().from(users);
    const adminCount = allAdmins.filter((u) => u.roles.includes("admin")).length;
    if (adminCount <= 1) return;
  }
  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/admin/users");
}
