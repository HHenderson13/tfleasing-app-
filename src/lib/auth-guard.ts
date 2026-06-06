import "server-only";
import { redirect } from "next/navigation";
import {
  canPlayWc,
  canQuote,
  canSeeOrders,
  canSeeProposals,
  canStock,
  getCurrentUser,
  isAdmin,
  isWcAdmin,
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

export async function requireWcAccess(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canPlayWc(u)) redirect("/forbidden");
  return u;
}

export async function requireWcAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isWcAdmin(u)) redirect("/forbidden");
  return u;
}

// ─── Broker portal guards ──────────────────────────────────────────────────
//
// Separate functions so the redirect destinations (/broker/login,
// /broker/forbidden) stay distinct from the TF guards above. Importing
// these from lib/broker-auth would create a cycle, so we deliberately
// keep them here next to the TF guards.

import { getCurrentBrokerUser, isBrokerOwner, type CurrentBrokerUser } from "./broker-auth";

export async function requireBrokerUser(): Promise<CurrentBrokerUser> {
  const u = await getCurrentBrokerUser();
  if (!u) redirect("/broker/login");
  return u;
}

export async function requireBrokerOwner(): Promise<CurrentBrokerUser> {
  const u = await requireBrokerUser();
  if (!isBrokerOwner(u)) redirect("/broker");
  return u;
}
