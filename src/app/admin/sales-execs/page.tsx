import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { SalesExecsView } from "./view";

export const dynamic = "force-dynamic";

export default async function SalesExecsPage() {
  const rows = await db.select().from(salesExecs).orderBy(asc(salesExecs.name));
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Sales executives</h1>
      <p className="mt-1 text-sm text-slate-500">Manage the team that proposals can be assigned to.</p>
      <div className="mt-6">
        <SalesExecsView rows={rows.map((r) => ({ id: r.id, name: r.name, email: r.email }))} />
      </div>
    </div>
  );
}
