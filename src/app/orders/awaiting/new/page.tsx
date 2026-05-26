import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { TopNav } from "@/components/top-nav";
import { AddDealForm } from "./form";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function AddAwaitingDealPage() {
  await requireAdmin();
  const execs = await db.select().from(salesExecs).orderBy(asc(salesExecs.name));
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Back-load awaiting-delivery deal</h1>
        <p className="mt-1 text-sm text-slate-500">Admin only. Lands directly in awaiting delivery and is excluded from reports.</p>
        <AddDealForm execs={execs.map((e) => ({ id: e.id, name: e.name }))} />
      </main>
    </div>
  );
}
