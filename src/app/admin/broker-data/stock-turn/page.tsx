import Link from "next/link";
import { db } from "@/db";
import { brokerStockTurnRules } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AddStockTurnForm, StockTurnRulesTable } from "./forms";

export const dynamic = "force-dynamic";

export default async function StockTurnPage() {
  const rules = await db.select().from(brokerStockTurnRules).orderBy(desc(brokerStockTurnRules.mustRegisterBy));
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Stock turn bonuses</h1>
        <p className="mt-1 text-sm text-slate-500">
          One row per active programme. The broker quote form auto-detects which rules apply to the
          vehicle (bucket / model year / gate-release window) and lets the broker pick one to apply
          as a customer-facing discount.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a programme</h2>
        <AddStockTurnForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          {rules.length.toLocaleString()} programme{rules.length === 1 ? "" : "s"}
        </h2>
        <StockTurnRulesTable
          rules={rules.map((r) => ({
            id: r.id,
            label: r.label,
            bucket: r.bucket,
            modelYear: r.modelYear,
            gateReleaseFrom: r.gateReleaseFrom ? r.gateReleaseFrom.toISOString() : null,
            gateReleaseTo: r.gateReleaseTo ? r.gateReleaseTo.toISOString() : null,
            mustRegisterBy: r.mustRegisterBy.toISOString(),
            bonusGbp: r.bonusGbp,
            notes: r.notes,
            active: r.active,
          }))}
        />
      </section>
    </div>
  );
}
