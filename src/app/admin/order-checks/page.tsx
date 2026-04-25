import { db } from "@/db";
import { stageCheckDefs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { OrderChecksView } from "./view";

export const dynamic = "force-dynamic";

export default async function OrderChecksPage() {
  const rows = await db.select().from(stageCheckDefs).orderBy(asc(stageCheckDefs.sortOrder), asc(stageCheckDefs.label));
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Order stage checks</h1>
      <p className="mt-1 text-sm text-slate-500">Extra checks that must be ticked on an in-order proposal before it can move to awaiting delivery. Built-in checks (chip, MotorComplete, finance agreement, vehicle details) always apply with their existing rules.</p>
      <div className="mt-6">
        <OrderChecksView rows={rows.map((r) => ({ id: r.id, label: r.label, sortOrder: r.sortOrder, appliesToBq: r.appliesToBq }))} />
      </div>
    </div>
  );
}
