import "server-only";

// Messages: storage. Each exec's own landline, mobile and signing email (one
// row each, theirs to change), and the bespoke offers the messages mention
// (admins keep them up to date at /profiles/offers).

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { CurrentUser } from "./auth";
import { MSG_MODELS, type MessageOffer, type Sender } from "./message-templates";

const nowSec = () => Math.floor(Date.now() / 1000);

/** Who a message is from: the exec's name, their saved numbers, and their saved email or the one they sign in with. */
export async function senderFor(user: CurrentUser): Promise<Sender> {
  const [r] = await db.all<{ landline: string; mobile: string; email: string }>(sql`
    SELECT landline, mobile, email FROM user_contact_details WHERE user_id = ${user.id}`);
  return { name: user.name || user.email, email: r?.email?.trim() || user.email, landline: r?.landline ?? "", mobile: r?.mobile ?? "" };
}

export async function saveContactDetails(userId: string, d: { landline: string; mobile: string; email: string }): Promise<void> {
  await db.run(sql`
    INSERT INTO user_contact_details (user_id, landline, mobile, email, updated_at) VALUES (${userId}, ${d.landline}, ${d.mobile}, ${d.email}, ${nowSec()})
    ON CONFLICT(user_id) DO UPDATE SET landline = excluded.landline, mobile = excluded.mobile, email = excluded.email, updated_at = excluded.updated_at
  `);
}

type Raw = {
  id: string; title: string; models: string; who: string; offer: string; details: string; valid_until: string | null;
  day1: string; day2: string; day3: string; active: number; updated_at: number; updated_by: string;
};

const KEYS = new Set(MSG_MODELS.map((m) => m.key));
const models = (s: string): string[] => {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && KEYS.has(k)) : []; } catch { return []; }
};

const fromRaw = (r: Raw): MessageOffer => ({
  id: r.id, title: r.title, models: models(r.models), who: r.who === "personal" || r.who === "business" ? r.who : "both", offer: r.offer, details: r.details,
  validUntil: r.valid_until || null, day1: r.day1, day2: r.day2, day3: r.day3, active: !!Number(r.active), updatedAt: Number(r.updated_at), updatedBy: r.updated_by,
});

/** Every offer, newest first. The builder only uses the live ones (`offersFor`). */
export async function listOffers(): Promise<MessageOffer[]> {
  const rows = await db.all<Raw>(sql`
    SELECT id, title, models, who, offer, details, valid_until, day1, day2, day3, active, updated_at, updated_by FROM message_offers ORDER BY updated_at DESC`);
  return rows.map(fromRaw);
}

export type OfferInput = Omit<MessageOffer, "id" | "updatedAt" | "updatedBy">;

export async function saveOffer(id: string | null, o: OfferInput, by: string): Promise<string> {
  const t = nowSec();
  const key = id ?? randomUUID();
  await db.run(sql`
    INSERT INTO message_offers (id, title, models, who, offer, details, valid_until, day1, day2, day3, active, created_at, updated_at, updated_by)
    VALUES (${key}, ${o.title}, ${JSON.stringify(o.models)}, ${o.who}, ${o.offer}, ${o.details}, ${o.validUntil}, ${o.day1}, ${o.day2}, ${o.day3}, ${o.active ? 1 : 0}, ${t}, ${t}, ${by})
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, models = excluded.models, who = excluded.who, offer = excluded.offer, details = excluded.details,
      valid_until = excluded.valid_until, day1 = excluded.day1, day2 = excluded.day2, day3 = excluded.day3, active = excluded.active,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `);
  return key;
}

export async function deleteOffer(id: string): Promise<void> {
  await db.run(sql`DELETE FROM message_offers WHERE id = ${id}`);
}
