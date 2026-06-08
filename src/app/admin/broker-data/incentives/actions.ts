"use server";
import { db } from "@/db";
import {
  brokerEvOffers,
  brokerTestDriveOffers,
  brokerTradeInOffers,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";

// Shared parsing helpers. Trim-or-null for free-text strings, ISO-or-null
// for dates so the admin can clear a window by emptying the input.

function trim(value: string | null): string | null {
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function bust() {
  revalidatePath("/admin/broker-data/incentives");
}

// ─── EV offers ──────────────────────────────────────────────────────────────

interface EvCreate {
  label: string;
  cashAlternativeGbp: number;
  wallboxLabel: string;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
}

export async function createEvOfferAction(input: EvCreate) {
  await requireAdmin();
  if (!input.label.trim()) return { ok: false as const, error: "Label is required." };
  if (!Number.isFinite(input.cashAlternativeGbp) || input.cashAlternativeGbp <= 0) {
    return { ok: false as const, error: "Cash alternative must be greater than zero." };
  }
  if (!input.wallboxLabel.trim()) return { ok: false as const, error: "Wallbox label is required." };
  const now = new Date();
  await db.insert(brokerEvOffers).values({
    id: randomUUID(),
    label: input.label.trim(),
    cashAlternativeGbp: input.cashAlternativeGbp,
    wallboxLabel: input.wallboxLabel.trim(),
    validFrom: parseDate(input.validFrom),
    validUntil: parseDate(input.validUntil),
    notes: trim(input.notes),
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  bust();
  return { ok: true as const };
}

export async function setEvOfferActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(brokerEvOffers).set({ active, updatedAt: new Date() }).where(eq(brokerEvOffers.id, id));
  bust();
  return { ok: true as const };
}

export async function deleteEvOfferAction(id: string) {
  await requireAdmin();
  await db.delete(brokerEvOffers).where(eq(brokerEvOffers.id, id));
  bust();
  return { ok: true as const };
}

// ─── Trade-in ───────────────────────────────────────────────────────────────

interface TradeInCreate {
  label: string;
  amountGbp: number;
  termsText: string;
  vehicleClass: string | null;
  bucket: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export async function createTradeInOfferAction(input: TradeInCreate) {
  await requireAdmin();
  if (!input.label.trim()) return { ok: false as const, error: "Label is required." };
  if (!Number.isFinite(input.amountGbp) || input.amountGbp <= 0) {
    return { ok: false as const, error: "Amount must be greater than zero." };
  }
  if (!input.termsText.trim()) return { ok: false as const, error: "Terms text is required — brokers must show it on the quote." };
  const now = new Date();
  await db.insert(brokerTradeInOffers).values({
    id: randomUUID(),
    label: input.label.trim(),
    amountGbp: input.amountGbp,
    termsText: input.termsText.trim(),
    vehicleClass: trim(input.vehicleClass),
    bucket: trim(input.bucket),
    validFrom: parseDate(input.validFrom),
    validUntil: parseDate(input.validUntil),
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  bust();
  return { ok: true as const };
}

export async function setTradeInOfferActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(brokerTradeInOffers).set({ active, updatedAt: new Date() }).where(eq(brokerTradeInOffers.id, id));
  bust();
  return { ok: true as const };
}

export async function deleteTradeInOfferAction(id: string) {
  await requireAdmin();
  await db.delete(brokerTradeInOffers).where(eq(brokerTradeInOffers.id, id));
  bust();
  return { ok: true as const };
}

// ─── Test drive ─────────────────────────────────────────────────────────────

interface TestDriveCreate {
  label: string;
  amountGbp: number;
  termsText: string | null;
  vehicleClass: string | null;
  bucket: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export async function createTestDriveOfferAction(input: TestDriveCreate) {
  await requireAdmin();
  if (!input.label.trim()) return { ok: false as const, error: "Label is required." };
  if (!Number.isFinite(input.amountGbp) || input.amountGbp <= 0) {
    return { ok: false as const, error: "Amount must be greater than zero." };
  }
  const now = new Date();
  await db.insert(brokerTestDriveOffers).values({
    id: randomUUID(),
    label: input.label.trim(),
    amountGbp: input.amountGbp,
    termsText: trim(input.termsText),
    vehicleClass: trim(input.vehicleClass),
    bucket: trim(input.bucket),
    validFrom: parseDate(input.validFrom),
    validUntil: parseDate(input.validUntil),
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  bust();
  return { ok: true as const };
}

export async function setTestDriveOfferActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(brokerTestDriveOffers).set({ active, updatedAt: new Date() }).where(eq(brokerTestDriveOffers.id, id));
  bust();
  return { ok: true as const };
}

export async function deleteTestDriveOfferAction(id: string) {
  await requireAdmin();
  await db.delete(brokerTestDriveOffers).where(eq(brokerTestDriveOffers.id, id));
  bust();
  return { ok: true as const };
}
