import Link from "next/link";
import { db } from "@/db";
import { brokerEvOffers, brokerTestDriveOffers, brokerTradeInOffers } from "@/db/schema";
import { desc } from "drizzle-orm";
import {
  EvOffersSection,
  TradeInOffersSection,
  TestDriveOffersSection,
} from "./forms";

export const dynamic = "force-dynamic";

export default async function IncentivesPage() {
  const [ev, tradeIn, testDrive] = await Promise.all([
    db.select().from(brokerEvOffers).orderBy(desc(brokerEvOffers.updatedAt)),
    db.select().from(brokerTradeInOffers).orderBy(desc(brokerTradeInOffers.updatedAt)),
    db.select().from(brokerTestDriveOffers).orderBy(desc(brokerTestDriveOffers.updatedAt)),
  ]);
  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">EV bonus, trade-in, test drive</h1>
        <p className="mt-1 text-sm text-slate-500">
          The three customer-facing incentives the broker can layer onto an outright or finance quote.
          Business discount &amp; APR uplift live on a separate page because they pair finance routes
          differently.
        </p>
      </div>

      <EvOffersSection
        rows={ev.map((r) => ({
          id: r.id,
          label: r.label,
          cashAlternativeGbp: r.cashAlternativeGbp,
          wallboxLabel: r.wallboxLabel,
          validFrom: r.validFrom ? r.validFrom.toISOString() : null,
          validUntil: r.validUntil ? r.validUntil.toISOString() : null,
          notes: r.notes,
          active: r.active,
        }))}
      />

      <TradeInOffersSection
        rows={tradeIn.map((r) => ({
          id: r.id,
          label: r.label,
          amountGbp: r.amountGbp,
          termsText: r.termsText,
          vehicleClass: r.vehicleClass,
          bucket: r.bucket,
          validFrom: r.validFrom ? r.validFrom.toISOString() : null,
          validUntil: r.validUntil ? r.validUntil.toISOString() : null,
          active: r.active,
        }))}
      />

      <TestDriveOffersSection
        rows={testDrive.map((r) => ({
          id: r.id,
          label: r.label,
          amountGbp: r.amountGbp,
          termsText: r.termsText,
          vehicleClass: r.vehicleClass,
          bucket: r.bucket,
          validFrom: r.validFrom ? r.validFrom.toISOString() : null,
          validUntil: r.validUntil ? r.validUntil.toISOString() : null,
          active: r.active,
        }))}
      />
    </div>
  );
}
