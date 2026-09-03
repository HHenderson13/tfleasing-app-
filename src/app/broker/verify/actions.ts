"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  BROKER_CHALLENGE_COOKIE,
  clearBrokerChallengeCookie,
  createBrokerSession,
  setBrokerSessionCookie,
  verifyBrokerChallenge,
} from "@/lib/broker-auth";

const MESSAGES: Record<string, string> = {
  missing: "That sign-in has expired. Please sign in again.",
  expired: "That sign-in has expired. Please sign in again.",
  "too-many": "Too many incorrect codes. Please sign in again.",
  "not-enrolled": "Two-factor authentication isn't set up on this account yet.",
  wrong: "That code isn't right. Check your authenticator app and try again.",
};

export async function verifyBrokerCodeAction(_prev: unknown, formData: FormData) {
  const jar = await cookies();
  const challengeId = jar.get(BROKER_CHALLENGE_COOKIE)?.value;
  if (!challengeId) return { error: MESSAGES.missing };

  const code = String(formData.get("code") ?? "");
  const res = await verifyBrokerChallenge(challengeId, code);
  if (!res.ok) {
    // A dead challenge takes its cookie with it, so the next attempt starts
    // cleanly at the login form rather than retrying against nothing.
    if (res.reason !== "wrong") await clearBrokerChallengeCookie();
    return { error: MESSAGES[res.reason] ?? MESSAGES.wrong };
  }

  await clearBrokerChallengeCookie();
  const sessionId = await createBrokerSession(res.brokerUserId);
  await setBrokerSessionCookie(sessionId);
  redirect("/broker");
}
