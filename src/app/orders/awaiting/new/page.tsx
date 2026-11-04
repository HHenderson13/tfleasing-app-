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
      <TopNav active="orders" width="2xl" />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <h1 className="font-semibold text-slate-900 text-[28px] leading-tight tracking-tight sm:text-[34px]">Back-load awaiting-delivery deal</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">Lands directly in awaiting delivery and is excluded from reports.</p>
        <AddDealForm execs={execs.map((e) => ({ id: e.id, name: e.name }))} />
      </main>
    </div>
  );
}
