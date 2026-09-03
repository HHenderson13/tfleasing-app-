import "server-only";
import { redirect } from "next/navigation";
import {
  canQuote,
  canSeeOrders,
  canSeeProposals,
  canStock,
  getCurrentUser,
  isAdmin,
  type CurrentUser,
} from "./auth";

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isAdmin(u)) redirect("/forbidden");
  return u;
}

export async function requireProposalsAccess(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canSeeProposals(u)) redirect("/forbidden");
  return u;
}

export async function requireOrdersAccess(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canSeeOrders(u)) redirect("/forbidden");
  return u;
}

export async function requireQuoteAccess(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canQuote(u)) redirect("/forbidden");
  return u;
}

export async function requireStockAccess(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canStock(u)) redirect("/forbidden");
  return u;
}

export async function requireLeaderboardAccess(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isAdmin(u) && !(u.roles.includes("exec"))) redirect("/forbidden");
  return u;
}

// ─── Broker portal guards ──────────────────────────────────────────────────
//
// Separate functions so the redirect destinations (/broker/login,
// /broker/forbidden) stay distinct from the TF guards above. Importing
// these from lib/broker-auth would create a cycle, so we deliberately
// keep them here next to the TF guards.

import { getCurrentBrokerUser, type CurrentBrokerUser } from "./broker-auth";

// The only broker guard. Brokers have no privileged tier: TF creates and
// removes every broker user from /admin/brokers, so there is nothing a
// broker can do that another broker at the same company cannot.
export async function requireBrokerUser(): Promise<CurrentBrokerUser> {
  const u = await getCurrentBrokerUser();
  if (!u) redirect("/broker/login");
  return u;
}

// Use this on any page that SHOWS STOCK. requireBrokerUser only proves who
// they are; this also proves they have accepted the current stock-access
// terms, which is what turns "their name was on the screenshot" into a
// record of what they agreed not to do with it.
//
// Kept separate rather than folded into requireBrokerUser because
// /broker/terms has to be reachable by someone who has not accepted yet —
// gating it on acceptance would redirect the page to itself forever.
export async function requireBrokerTermsAccepted(): Promise<CurrentBrokerUser> {
  const u = await requireBrokerUser();
  const { hasAcceptedCurrentTerms } = await import("./broker-terms");
  if (!await hasAcceptedCurrentTerms(u.id)) redirect("/broker/terms");
  return u;
}
