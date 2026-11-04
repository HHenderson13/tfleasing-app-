import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { SalesExecsView } from "./view";

export const dynamic = "force-dynamic";

export default async function SalesExecsPage() {
  const rows = await db.select().from(salesExecs).orderBy(asc(salesExecs.name));
  return (
    <div>
      <h1 className="font-semibold text-slate-900 text-[28px] leading-tight tracking-tight sm:text-[34px]">Sales executives</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">Manage the team that proposals can be assigned to.</p>
      <div className="mt-6">
        <SalesExecsView rows={rows.map((r) => ({ id: r.id, name: r.name, email: r.email }))} />
      </div>
    </div>
  );
}
