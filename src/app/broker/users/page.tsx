import Link from "next/link";
import { db } from "@/db";
import { brokerUsers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireBrokerOwner } from "@/lib/auth-guard";
import { brokerSignOutAction } from "../login/actions";
import { AddTeamUserForm, TeamUsersTable } from "./forms";

export const dynamic = "force-dynamic";

// Self-service team management for broker owners. Mirrors the TF-admin
// detail page but scoped to the owner's own broker. The actions in
// ./actions.ts always force broker_id = the owner's broker_id so a
// crafted request body can't reach another broker's user.
export default async function BrokerTeamPage() {
  const me = await requireBrokerOwner();
  const users = await db
    .select({
      id: brokerUsers.id,
      name: brokerUsers.name,
      email: brokerUsers.email,
      role: brokerUsers.role,
      active: brokerUsers.active,
      hasSetupToken: brokerUsers.setupToken,
    })
    .from(brokerUsers)
    .where(eq(brokerUsers.brokerId, me.brokerId))
    .orderBy(asc(brokerUsers.name));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/broker" className="text-slate-500 hover:text-slate-900">← Back to broker portal</Link>
          <form action={brokerSignOutAction}>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">{me.brokerName} team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add users from your firm — they&apos;ll share visibility on every quote your team saves.
        </p>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-slate-700">Add a colleague</h2>
          <AddTeamUserForm />
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-slate-700">Team</h2>
          <TeamUsersTable
            currentUserId={me.id}
            users={users.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role === "owner" ? "owner" : "user",
              active: !!u.active,
              hasSetupToken: !!u.hasSetupToken,
            }))}
          />
        </section>
      </main>
    </div>
  );
}
