import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { CreateBrokerForm, BrokerToggle } from "./forms";

export const dynamic = "force-dynamic";

export default async function AdminBrokersPage() {
  await requireAdmin();
  // One query that returns each broker + a per-broker user count. Beats
  // shipping every broker_user row down for the list view.
  const rows = await db.all<{
    id: string;
    name: string;
    active: number;
    created_at: number;
    user_count: number;
  }>(sql`
    SELECT b.id, b.name, b.active, b.created_at,
      (SELECT COUNT(*) FROM broker_users u WHERE u.broker_id = b.id) AS user_count
    FROM brokers b
    ORDER BY b.name
  `);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Brokers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each broker is a separate sign-in scope. Their users see each other&apos;s quotes but never another broker&apos;s. The
          broker portal lives at <span className="font-mono">/broker/login</span>.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a broker</h2>
        <CreateBrokerForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Existing brokers</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Broker</th>
                <th className="px-4 py-3 text-right font-medium">Users</th>
                <th className="px-4 py-3 text-right font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/admin/brokers/${r.id}`} className="hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{Number(r.user_count)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">
                    {new Date(Number(r.created_at) * 1000).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(r.active) === 1 ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <BrokerToggle id={r.id} active={Number(r.active) === 1} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">No brokers yet — add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
