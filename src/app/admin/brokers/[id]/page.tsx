import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { brokers, brokerUsers } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { BrokerUsersTable, AddBrokerUserForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function AdminBrokerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [broker] = await db.select().from(brokers).where(eq(brokers.id, id)).limit(1);
  if (!broker) notFound();
  const users = await db
    .select({
      id: brokerUsers.id,
      name: brokerUsers.name,
      email: brokerUsers.email,
      role: brokerUsers.role,
      active: brokerUsers.active,
      hasSetupToken: brokerUsers.setupToken,
      createdAt: brokerUsers.createdAt,
    })
    .from(brokerUsers)
    .where(eq(brokerUsers.brokerId, broker.id))
    .orderBy(asc(brokerUsers.name));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/brokers" className="text-xs text-slate-500 hover:text-slate-900">← All brokers</Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{broker.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {broker.active ? "Active broker" : "Disabled broker"} · {users.length} {users.length === 1 ? "user" : "users"}
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a user</h2>
        <p className="mb-2 text-xs text-slate-500">
          We&apos;ll generate a one-time setup link valid for 7 days. Paste it into Teams / email so they can choose their password.
        </p>
        <AddBrokerUserForm brokerId={broker.id} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Users</h2>
        <BrokerUsersTable
          brokerId={broker.id}
          users={users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role === "owner" ? "owner" : "user",
            active: !!u.active,
            hasSetupToken: !!u.hasSetupToken,
            createdAt: u.createdAt.toISOString(),
          }))}
        />
      </section>
    </div>
  );
}
