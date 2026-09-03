import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { db } from "@/db";
import { brokerLoginChallenges, brokers, brokerSessions, brokerUsers } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { ensureAppSchema } from "@/db/ensure-schema";
import { checkPassword as checkPasswordPolicy, hashPassword, verifyPassword } from "./auth";
import { verifyTotp } from "./totp";
import { BROKER_COOKIE_PATH } from "./broker-endpoints";
import { logWarn } from "./logger";

// Parallel auth system for the broker portal. Mirrors lib/auth.ts but uses
// its own cookie name, session table, and user table — strict separation
// of TF leasing-app sessions from broker-portal sessions. Middleware
// enforces that broker cookies cannot satisfy a TF route guard and vice
// versa (see src/middleware.ts).

export const BROKER_SESSION_COOKIE = "tf_broker_session";
export const BROKER_CHALLENGE_COOKIE = "tf_broker_challenge";

// ─── How long a broker stays signed in ─────────────────────────────────────
//
// Two clocks, because they answer different questions.
//
// ABSOLUTE (12h) is the ceiling. However busy they are, the session dies and
// they sign in again — which, with a code emailed every time, is the thing
// that actually makes a shared login painful. Set to 12 rather than 24 so a
// morning sign-in does not still work that evening from someone else's desk.
//
// IDLE (30m) is the unattended-screen clock. The stock list is confidential
// and brokers work on laptops in shared offices; a screen left open at lunch
// should not still be showing it.
//
// Both are enforced server-side in getCurrentBrokerUser. The client-side
// timer in broker/idle-timeout.tsx only makes the browser act on it — never
// trust it to be the control.
export const SESSION_ABSOLUTE_HOURS = 12;
export const SESSION_IDLE_MINUTES = 30;

// Writing lastSeenAt on every request would mean a DB write per page view
// for no benefit. A minute of granularity is invisible against a 30-minute
// idle window.
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;


// Broker users have no privilege tiers. TF adds and removes every one of
// them from /admin/brokers, so a signed-in broker user is simply a broker
// user. The broker_users.role column still exists (schema changes here are
// additive only) but nothing reads it — see the note in db/schema.ts.
export interface CurrentBrokerUser {
  id: string;
  brokerId: string;
  brokerName: string;
  brokerActive: boolean;
  name: string;
  email: string;
}

// Re-export the shared password policy so the broker setup flow uses the
// exact same rules as the leasing-app flow — no duplicate policy code.
export { checkPasswordPolicy as checkPassword, hashPassword, verifyPassword };

export function newSetupToken(): { token: string; expiresAt: Date } {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  return { token, expiresAt };
}

// Counterpart to newSetupToken — "is this link still good?" lives next to
// the code that decides how long it's good for, rather than being inlined
// as a date comparison in the setup page.
export function isSetupTokenExpired(expiresAt: Date | null | undefined): boolean {
  return !!expiresAt && expiresAt.getTime() < Date.now();
}

// ONE live session per broker user. Signing in anywhere signs you out
// everywhere else.
//
// This is the strongest anti-sharing control here, stronger than the second
// factor: a shared TOTP secret still lets two people in, but two people
// cannot hold a session at the same time — they boot each other out all day
// until one of them asks for their own login. It is also the honest reading
// of "log out of elsewhere": there is no other device left to log out.
//
// The cost is real and falls on honest users too: a broker on a laptop and a
// phone is signed out of one when they use the other. For a single-page
// stock list that is a fair trade; it would not be for a tool people keep
// open on two screens.
export async function createBrokerSession(brokerUserId: string): Promise<string> {
  // Logged because "I keep getting signed out" is otherwise unanswerable:
  // eviction and idle expiry look identical from the outside, and only the
  // server knows which happened.
  const evicted = await db.select({ id: brokerSessions.id }).from(brokerSessions).where(eq(brokerSessions.brokerUserId, brokerUserId));
  if (evicted.length) {
    logWarn("broker.session.evicted", "new sign-in displaced existing session(s)", {
      brokerUserId, evictedCount: evicted.length,
    });
  }
  await db.delete(brokerSessions).where(eq(brokerSessions.brokerUserId, brokerUserId));
  const id = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_HOURS * 3_600_000);
  await db.insert(brokerSessions).values({ id, brokerUserId, expiresAt, lastSeenAt: now, createdAt: now });
  return id;
}

// Heartbeat, called by broker/idle-timeout.tsx. Answers two questions the
// page cannot answer for itself.
//
// The first is whether the session still exists — a broker displaced by a
// sign-in elsewhere would otherwise sit looking at stock until they next
// navigated, which on this page could be never.
//
// The second is subtler and was a genuine bug: the stock list filters
// entirely in the browser, so someone can work for half an hour without
// making a single request. lastSeenAt would go stale while they were busy
// and the server would idle them out mid-use. The client knows about real
// activity (pointer, keys, scroll) and passes it here, which is the only
// thing that keeps the server's idle clock honest.
//
// `active` must come from real input. A heartbeat that always bumped would
// keep an abandoned screen signed in for as long as the tab stayed open,
// which is precisely what the idle timeout exists to prevent.
export type HeartbeatResult = "ok" | "idle" | "gone";

export async function brokerSessionHeartbeat(active: boolean): Promise<HeartbeatResult> {
  const jar = await cookies();
  const sid = jar.get(BROKER_SESSION_COOKIE)?.value;
  if (!sid) return "gone";
  const now = new Date();
  const [row] = await db
    .select({ lastSeenAt: brokerSessions.lastSeenAt, createdAt: brokerSessions.createdAt })
    .from(brokerSessions)
    .where(and(eq(brokerSessions.id, sid), gt(brokerSessions.expiresAt, now)))
    .limit(1);
  if (!row) {
    // The row is gone or past its absolute expiry. Almost always means the
    // session was evicted by a sign-in elsewhere.
    logWarn("broker.session.not-found", "heartbeat on a session that no longer exists", {});
    return "gone";
  }
  const lastSeen = row.lastSeenAt ?? row.createdAt;
  const idleFor = now.getTime() - lastSeen.getTime();
  if (idleFor > SESSION_IDLE_MINUTES * 60_000) {
    logWarn("broker.session.idle-expired", "heartbeat found an idle session", {
      idleMinutes: Math.round(idleFor / 60_000), limit: SESSION_IDLE_MINUTES, via: "heartbeat",
    });
    await db.delete(brokerSessions).where(eq(brokerSessions.id, sid));
    // Distinct from "gone": this broker idled out, they were not displaced.
    // Reporting both the same way told idled-out users they had signed in on
    // another device, which is both wrong and alarming.
    return "idle";
  }
  if (active) {
    await db.update(brokerSessions).set({ lastSeenAt: now }).where(eq(brokerSessions.id, sid));
  }
  return "ok";
}

// ─── Second factor ─────────────────────────────────────────────────────────
//
// TOTP — the rotating six-digit code in Microsoft Authenticator, Google
// Authenticator, 1Password or Authy. Required on EVERY sign-in, and the code
// changes every 30 seconds, so it is never the same twice.
//
// The pending record below is what sits between "password was right" and "you
// are signed in". It is deliberately a separate table from broker_sessions:
// until the code comes back this is NOT a session and must not be able to
// become one by accident. It grants access to nothing.
const CHALLENGE_TTL_MINUTES = 10;
const CHALLENGE_MAX_ATTEMPTS = 5;

export async function createBrokerChallenge(brokerUserId: string): Promise<string> {
  // One outstanding attempt per user — starting a new sign-in must retire the
  // old record rather than leaving a queue of live ones.
  await db.delete(brokerLoginChallenges).where(eq(brokerLoginChallenges.brokerUserId, brokerUserId));
  const id = randomBytes(24).toString("base64url");
  const now = new Date();
  await db.insert(brokerLoginChallenges).values({
    id,
    brokerUserId,
    attempts: 0,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MINUTES * 60_000),
    createdAt: now,
  });
  return id;
}

export type ChallengeResult =
  | { ok: true; brokerUserId: string }
  | { ok: false; reason: "missing" | "expired" | "too-many" | "wrong" | "not-enrolled" };

// Verifies the code against the user's enrolled secret and burns the pending
// record on success. Attempts are counted so a six-digit space cannot be
// walked through — five tries and the sign-in has to start again.
export async function verifyBrokerChallenge(challengeId: string, code: string): Promise<ChallengeResult> {
  const [row] = await db.select().from(brokerLoginChallenges).where(eq(brokerLoginChallenges.id, challengeId)).limit(1);
  if (!row) return { ok: false, reason: "missing" };
  const drop = () => db.delete(brokerLoginChallenges).where(eq(brokerLoginChallenges.id, challengeId));
  if (row.expiresAt.getTime() < Date.now()) { await drop(); return { ok: false, reason: "expired" }; }
  if (row.attempts >= CHALLENGE_MAX_ATTEMPTS) { await drop(); return { ok: false, reason: "too-many" }; }

  const [user] = await db
    .select({ secret: brokerUsers.totpSecret })
    .from(brokerUsers)
    .where(eq(brokerUsers.id, row.brokerUserId))
    .limit(1);
  if (!user?.secret) return { ok: false, reason: "not-enrolled" };

  if (!verifyTotp(user.secret, code)) {
    await db.update(brokerLoginChallenges)
      .set({ attempts: row.attempts + 1 })
      .where(eq(brokerLoginChallenges.id, challengeId));
    return { ok: false, reason: "wrong" };
  }
  await drop();
  return { ok: true, brokerUserId: row.brokerUserId };
}

// Reads the pending record without consuming it — the enrolment and verify
// pages need to know who is half-signed-in in order to render.
export async function pendingChallengeUser(challengeId: string | undefined | null) {
  if (!challengeId) return null;
  const [row] = await db.select().from(brokerLoginChallenges).where(eq(brokerLoginChallenges.id, challengeId)).limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  const [user] = await db
    .select({
      id: brokerUsers.id,
      name: brokerUsers.name,
      email: brokerUsers.email,
      totpSecret: brokerUsers.totpSecret,
      brokerName: brokers.name,
    })
    .from(brokerUsers)
    .innerJoin(brokers, eq(brokerUsers.brokerId, brokers.id))
    .where(eq(brokerUsers.id, row.brokerUserId))
    .limit(1);
  return user ?? null;
}

// Enrolment. The secret is written only once the broker has proved they can
// read a code from it — otherwise a mistyped scan locks them out of an
// account they can no longer sign in to.
export async function enrolBrokerTotp(brokerUserId: string, secret: string, code: string): Promise<boolean> {
  if (!verifyTotp(secret, code)) return false;
  await db.update(brokerUsers)
    .set({ totpSecret: secret, totpEnrolledAt: new Date(), updatedAt: new Date() })
    .where(eq(brokerUsers.id, brokerUserId));
  return true;
}

export async function setBrokerChallengeCookie(challengeId: string) {
  const jar = await cookies();
  jar.set(BROKER_CHALLENGE_COOKIE, challengeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: BROKER_COOKIE_PATH,
    maxAge: CHALLENGE_TTL_MINUTES * 60,
  });
}

export async function clearBrokerChallengeCookie() {
  const jar = await cookies();
  // Path matters: a cookie is identified by name AND path, so delete(name)
  // alone targets Path=/ and leaves the /broker-scoped one sitting there.
  jar.set(BROKER_CHALLENGE_COOKIE, "", { path: BROKER_COOKIE_PATH, maxAge: 0 });
}

export async function deleteBrokerSession(id: string): Promise<void> {
  await db.delete(brokerSessions).where(eq(brokerSessions.id, id));
}

export async function setBrokerSessionCookie(sessionId: string) {
  const jar = await cookies();
  jar.set(BROKER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Scoped to /broker only — even if a broker cookie leaks somewhere it
    // physically cannot be sent to non-broker paths.
    path: BROKER_COOKIE_PATH,
    maxAge: SESSION_ABSOLUTE_HOURS * 3_600,
  });
}

export async function clearBrokerSessionCookie() {
  const jar = await cookies();
  // Same as above — signing out has to clear the cookie at the path it was
  // actually set on, or the browser keeps sending a dead session id.
  jar.set(BROKER_SESSION_COOKIE, "", { path: BROKER_COOKIE_PATH, maxAge: 0 });
}

// React-cache wrapped per the same logic as getCurrentUser — repeated
// calls within a single request share the DB lookup.
export const getCurrentBrokerUser = cache(async function getCurrentBrokerUser(): Promise<CurrentBrokerUser | null> {
  await ensureAppSchema();
  const jar = await cookies();
  const sid = jar.get(BROKER_SESSION_COOKIE)?.value;
  if (!sid) return null;
  const now = new Date();
  const [row] = await db
    .select({
      id: brokerUsers.id,
      brokerId: brokerUsers.brokerId,
      brokerName: brokers.name,
      brokerActive: brokers.active,
      name: brokerUsers.name,
      email: brokerUsers.email,
      userActive: brokerUsers.active,
      lastSeenAt: brokerSessions.lastSeenAt,
      sessionCreatedAt: brokerSessions.createdAt,
    })
    .from(brokerSessions)
    .innerJoin(brokerUsers, eq(brokerSessions.brokerUserId, brokerUsers.id))
    .innerJoin(brokers, eq(brokerUsers.brokerId, brokers.id))
    .where(and(eq(brokerSessions.id, sid), gt(brokerSessions.expiresAt, now)))
    .limit(1);
  if (!row || !row.userActive || !row.brokerActive) return null;

  // Idle timeout, enforced here so it applies to every route rather than
  // whichever ones remembered to check. The session row is deleted rather
  // than left to expire: an idled-out cookie should be dead everywhere at
  // once, including on another device holding the same session.
  const lastSeen = row.lastSeenAt ?? row.sessionCreatedAt;
  const idleMs = now.getTime() - lastSeen.getTime();
  if (idleMs > SESSION_IDLE_MINUTES * 60_000) {
    logWarn("broker.session.idle-expired", "page load found an idle session", {
      brokerUserId: row.id, email: row.email,
      idleMinutes: Math.round(idleMs / 60_000), limit: SESSION_IDLE_MINUTES, via: "page-load",
    });
    await db.delete(brokerSessions).where(eq(brokerSessions.id, sid));
    return null;
  }
  // Only write when the stored value is meaningfully stale — otherwise this
  // is a database write on every page view for no gain.
  if (idleMs > LAST_SEEN_WRITE_INTERVAL_MS) {
    await db.update(brokerSessions).set({ lastSeenAt: now }).where(eq(brokerSessions.id, sid));
  }

  return {
    id: row.id,
    brokerId: row.brokerId,
    brokerName: row.brokerName,
    brokerActive: row.brokerActive,
    name: row.name,
    email: row.email,
  };
});

export async function brokerUserCount(brokerId: string): Promise<number> {
  const rows = await db
    .select({ id: brokerUsers.id })
    .from(brokerUsers)
    .where(eq(brokerUsers.brokerId, brokerId));
  return rows.length;
}
