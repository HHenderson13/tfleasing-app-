import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { TopNav } from "@/components/top-nav";
import { AddDealForm } from "./form";
import { requireOrdersAccess } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function AddAwaitingDealPage() {
  // Any signed-in user with orders access can back-load a deal. These
  // rows are still flagged backLoaded=true so reports/KPIs exclude them
  // — that's a data classification, not an auth gate.
  await requireOrdersAccess();
  const execs = await db.select().from(salesExecs).orderBy(asc(salesExecs.name));
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Back-load awaiting-delivery deal</h1>
        <p className="mt-1 text-sm text-slate-500">Lands directly in awaiting delivery and is excluded from reports.</p>
        <AddDealForm execs={execs.map((e) => ({ id: e.id, name: e.name }))} />
      </main>
    </div>
  );
}
