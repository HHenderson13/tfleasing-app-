"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { requireUser } from "@/lib/auth-guard";
import { logError } from "@/lib/logger";
import { MSG_MODELS, isUkMobile, isUkPhone, offerProblems, type MessageOffer } from "@/lib/message-templates";
import { deleteOffer, listOffers, saveContactDetails, saveOffer, senderFor } from "@/lib/message-store";

const text = (v: unknown, n: number) => String(v ?? "").replace(/[ \t]+/g, " ").trim().slice(0, n);
const KEYS = new Set(MSG_MODELS.map((m) => m.key));
const UUID = /^[0-9a-f-]{36}$/;

/** An exec's own numbers and signing email. Only ever their own. */
export async function saveMyDetailsAction(input: { landline: string; mobile: string; email: string }) {
  const user = await requireUser();
  const landline = text(input.landline, 30);
  const mobile = text(input.mobile, 30);
  const email = text(input.email, 120);
  const errors: Record<string, string> = {};
  if (landline && !isUkPhone(landline)) errors.landline = "That doesn't look like a UK number.";
  if (mobile && !isUkMobile(mobile)) errors.mobile = "That doesn't look like a UK mobile. It should start 07.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "That doesn't look like an email address.";
  if (Object.keys(errors).length) return { ok: false as const, errors };
  try {
    await saveContactDetails(user.id, { landline, mobile, email: email.toLowerCase() === user.email.toLowerCase() ? "" : email });
    return { ok: true as const, sender: await senderFor(user) };
  } catch (e) {
    logError("messages/details", e);
    return { ok: false as const, errors: { form: "Couldn't save your details. Please try again." } };
  }
}

/** Add or change an offer. Admins only: the page hiding the button is not the control. */
export async function saveOfferAction(id: string | null, input: Partial<MessageOffer>) {
  const user = await requireUser();
  if (!isAdmin(user)) return { ok: false as const, errors: ["Only a manager can change offers."] };
  if (id != null && !UUID.test(id)) return { ok: false as const, errors: ["That offer wasn't found."] };
  const o = {
    title: text(input.title, 120),
    models: Array.isArray(input.models) ? [...new Set(input.models.filter((k) => typeof k === "string" && KEYS.has(k)))] : [],
    who: input.who === "personal" || input.who === "business" ? input.who : ("both" as const),
    offer: text(input.offer, 400),
    details: String(input.details ?? "").trim().slice(0, 2000),
    validUntil: typeof input.validUntil === "string" && input.validUntil ? input.validUntil.slice(0, 10) : null,
    day1: text(input.day1, 600),
    day2: text(input.day2, 600),
    day3: text(input.day3, 600),
    active: input.active !== false,
  };
  const problems = offerProblems(o);
  if (problems.length) return { ok: false as const, errors: problems };
  try {
    const key = await saveOffer(id, o, user.name || user.email);
    revalidatePath("/profiles/offers");
    return { ok: true as const, id: key, offers: await listOffers() };
  } catch (e) {
    logError("messages/offer-save", e);
    return { ok: false as const, errors: ["Couldn't save the offer. Please try again."] };
  }
}

export async function deleteOfferAction(id: string) {
  const user = await requireUser();
  if (!isAdmin(user) || !UUID.test(String(id))) return { ok: false as const };
  await deleteOffer(id);
  revalidatePath("/profiles/offers");
  return { ok: true as const, offers: await listOffers() };
}
