"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  BROKER_CHALLENGE_COOKIE,
  clearBrokerChallengeCookie,
  createBrokerSession,
  enrolBrokerTotp,
  pendingChallengeUser,
  setBrokerSessionCookie,
} from "@/lib/broker-auth";

// The secret travels through the form rather than being stashed server-side
// between the two requests. It is not a credential until a code proves the
// broker actually scanned it — an abandoned enrolment leaves nothing behind
// to clean up, and a refresh simply mints a new one.
export async function enrolBrokerTotpAction(_prev: unknown, formData: FormData) {
  const jar = await cookies();
  const challengeId = jar.get(BROKER_CHALLENGE_COOKIE)?.value;
  const user = await pendingChallengeUser(challengeId);
  if (!user) return { error: "That sign-in has expired. Please sign in again." };
  if (user.totpSecret) return { error: "Two-factor authentication is already set up. Please sign in again." };

  const secret = String(formData.get("secret") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^[A-Z2-7]{32}$/.test(secret)) return { error: "Something went wrong. Please refresh and try again." };

  const ok = await enrolBrokerTotp(user.id, secret, code);
  if (!ok) return { error: "That code isn't right. Check the app and try the next one." };

  await clearBrokerChallengeCookie();
  const sessionId = await createBrokerSession(user.id);
  await setBrokerSessionCookie(sessionId);
  redirect("/broker");
}
