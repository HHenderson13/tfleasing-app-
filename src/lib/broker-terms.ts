import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { brokerTermsAcceptances } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { CurrentBrokerUser } from "./broker-auth";

// Bump when the wording below changes materially. Everyone is asked again,
// rather than us claiming they agreed to text they never saw.
export const BROKER_TERMS_VERSION = "2026-09-03";

// The clauses, as data, so the acceptance page and any paper agreement stay
// the same words. NOT LEGAL ADVICE — have these reviewed before they are
// relied on in a dispute. What they are is specific: they name the acts we
// can actually detect or prove, rather than gesturing at "misuse".
export const BROKER_TERMS: { heading: string; body: string }[] = [
  {
    heading: "This access is personal to you",
    body:
      "Your sign-in is issued to you by name. Do not share your password, let anyone else use your account, or sign in on a device other people can use unattended. TrustFord creates and removes every account on this portal.",
  },
  {
    heading: "The stock list is confidential",
    body:
      "Vehicle availability, specification and arrival dates shown here are commercially confidential to TrustFord. They are provided so you can quote your own customers — nothing more.",
  },
  {
    heading: "Do not copy it out of the portal",
    body:
      "Do not screenshot, photograph, record, print, export or re-key this stock list, and do not forward, post, publish or show it to anyone outside your own firm — including customers, other brokers, dealer groups, suppliers, or any social, messaging or trade group.",
  },
  {
    heading: "Every screen is watermarked with your identity",
    body:
      "Your name, email address, company and the time are displayed across every page and appear in any image taken of it. A screenshot, photograph or recording of this portal can be traced back to the individual who took it.",
  },
  {
    heading: "Capture attempts are recorded",
    body:
      "Attempts to screenshot, print, or remove the watermark are logged against your account and reported to TrustFord automatically.",
  },
  {
    heading: "Breach ends your access",
    body:
      "Sharing this information outside your firm is a breach of these terms and of the agreement between TrustFord and your company. TrustFord may withdraw your access, and your company's access, at any time and without notice.",
  },
];

export async function hasAcceptedCurrentTerms(brokerUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: brokerTermsAcceptances.id })
    .from(brokerTermsAcceptances)
    .where(and(
      eq(brokerTermsAcceptances.brokerUserId, brokerUserId),
      eq(brokerTermsAcceptances.version, BROKER_TERMS_VERSION),
    ))
    .limit(1);
  return !!row;
}

// Records the acceptance with the context that makes it evidence: which
// version, when, from where, on what.
export async function recordTermsAcceptance(input: {
  me: CurrentBrokerUser;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  if (await hasAcceptedCurrentTerms(input.me.id)) return;
  await db.insert(brokerTermsAcceptances).values({
    id: randomUUID(),
    brokerUserId: input.me.id,
    brokerId: input.me.brokerId,
    version: BROKER_TERMS_VERSION,
    ip: input.ip?.slice(0, 60) ?? null,
    userAgent: input.userAgent?.slice(0, 400) ?? null,
    acceptedAt: new Date(),
  });
}
