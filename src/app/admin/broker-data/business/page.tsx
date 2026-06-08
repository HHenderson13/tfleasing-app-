import Link from "next/link";
import { db } from "@/db";
import { brokerBusinessDiscounts } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AddBusinessDiscountForm, BusinessDiscountTable } from "./forms";

export const dynamic = "force-dynamic";

export default async function BusinessDiscountPage() {
  const rows = await db.select().from(brokerBusinessDiscounts).orderBy(desc(brokerBusinessDiscounts.updatedAt));
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Business discount + APR uplift</h1>
        <p className="mt-1 text-sm text-slate-500">
          Extra cash discount for VAT-registered businesses, paired with the APR uplift Ford applies
          on the matching finance route. On outright purchase the broker gets the bigger discount
          with no trade-off; on finance the broker sees both the low-rate and the higher-discount
          quote side by side so the customer can pick (Phase 5).
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a rule</h2>
        <AddBusinessDiscountForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          {rows.length.toLocaleString()} rule{rows.length === 1 ? "" : "s"}
        </h2>
        <BusinessDiscountTable
          rows={rows.map((r) => ({
            id: r.id,
            label: r.label,
            vehicleClass: r.vehicleClass,
            bucket: r.bucket,
            fundingRoute: r.fundingRoute,
            extraDiscountPct: r.extraDiscountPct,
            aprUpliftPct: r.aprUpliftPct,
            notes: r.notes,
            validFrom: r.validFrom ? r.validFrom.toISOString() : null,
            validUntil: r.validUntil ? r.validUntil.toISOString() : null,
            active: r.active,
          }))}
        />
      </section>
    </div>
  );
}
