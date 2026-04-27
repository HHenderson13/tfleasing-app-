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
