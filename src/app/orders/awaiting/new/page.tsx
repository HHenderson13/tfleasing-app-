import { db } from "@/db";
import { funders } from "@/db/schema";
import { asc } from "drizzle-orm";
import { TopNav } from "@/components/top-nav";
import { AddDealForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AddAwaitingDealPage() {
  const fs = await db.select().from(funders).orderBy(asc(funders.name));
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Back-load awaiting-delivery deal</h1>
        <p className="mt-1 text-sm text-slate-500">For in-flight deals already through the order stage. They land directly in awaiting delivery.</p>
        <AddDealForm funders={fs.map((f) => ({ id: f.id, name: f.name }))} />
      </main>
    </div>
  );
}
