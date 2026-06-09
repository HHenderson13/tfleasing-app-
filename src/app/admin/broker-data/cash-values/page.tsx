import Link from "next/link";
import { db } from "@/db";
import { brokerVehicleCashValues } from "@/db/schema";
import { asc } from "drizzle-orm";
import { loadMappedStock } from "@/lib/stock-list";
import { PricingTable, AddPricingForm, UnmappedVehiclesPanel } from "./forms";

export const dynamic = "force-dynamic";

export default async function PricingAdminPage() {
  const [rows, stock] = await Promise.all([
    db.select().from(brokerVehicleCashValues).orderBy(
      asc(brokerVehicleCashValues.bucket),
      asc(brokerVehicleCashValues.variant),
      asc(brokerVehicleCashValues.derivative),
      asc(brokerVehicleCashValues.modelYear),
    ),
    loadMappedStock(),
  ]);

  const uniqueKey = (bucket: string, variant: string, derivative: string | null, modelYear: string | null) =>
    `${bucket}|${variant}|${derivative ?? ""}|${modelYear ?? ""}`;

  const stockCombos = new Map<string, { bucket: string; variant: string; derivative: string | null; modelYear: string | null; count: number }>();
  for (const v of stock.rows) {
    const k = uniqueKey(v.bucket, v.variant, v.derivative, v.modelYear);
    const cur = stockCombos.get(k) ?? { bucket: v.bucket, variant: v.variant, derivative: v.derivative, modelYear: v.modelYear, count: 0 };
    cur.count++;
    stockCombos.set(k, cur);
  }
  const mappedKeys = new Set(rows.map((r) => uniqueKey(r.bucket, r.variant, r.derivative, r.modelYear)));
  const unmapped = Array.from(stockCombos.entries())
    .filter(([k]) => !mappedKeys.has(k))
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count);

  // How many rows already use the new component model vs legacy flat cash?
  const withComponents = rows.filter((r) => r.retailPriceGbp !== null).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          One row per model year × variant × derivative. Captures Ford&apos;s retail price + delivery / PDI / 1st reg / RFL
          costs, the trading-margin + standards + VETS + 1F discount stack, and the minimum profit TF retains.
          The broker quote engine derives customer OTR for both <strong>Retail (1N)</strong> and{" "}
          <strong>Business VAT Registered (1F)</strong> programmes automatically.
        </p>
        {rows.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            {withComponents.toLocaleString()} / {rows.length.toLocaleString()} rows on the component model.
            {withComponents < rows.length && <> Older rows fall back to their flat cash price for both programmes.</>}
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a row</h2>
        <AddPricingForm
          stockCombos={Array.from(stockCombos.values()).sort((a, b) =>
            (a.bucket + a.variant + (a.derivative ?? "") + (a.modelYear ?? "")).localeCompare(b.bucket + b.variant + (b.derivative ?? "") + (b.modelYear ?? "")),
          )}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          {rows.length.toLocaleString()} mapped vehicle{rows.length === 1 ? "" : "s"}
        </h2>
        <PricingTable
          rows={rows.map((r) => ({
            id: r.id,
            bucket: r.bucket,
            variant: r.variant,
            derivative: r.derivative,
            modelYear: r.modelYear,
            cashGbp: r.cashGbp,
            marginGbp: r.marginGbp,
            marginPct: r.marginPct,
            capCode: r.capCode,
            capId: r.capId,
            notes: r.notes,
            retailPriceGbp: r.retailPriceGbp,
            deliveryGbp: r.deliveryGbp,
            pdiPlatesGbp: r.pdiPlatesGbp,
            firstRegFeeGbp: r.firstRegFeeGbp,
            rflGbp: r.rflGbp,
            tradingMarginPct: r.tradingMarginPct,
            standardsPct: r.standardsPct,
            vetsPct: r.vetsPct,
            oneFDiscountPct: r.oneFDiscountPct,
            dealerProfitGbp: r.dealerProfitGbp,
          }))}
        />
      </section>

      {unmapped.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-700">
            {unmapped.length.toLocaleString()} stock combination{unmapped.length === 1 ? "" : "s"} without pricing
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            These vehicles are visible to brokers but the quote form will leave the cash field
            blank for them until you add a row above. Sorted by stock volume.
          </p>
          <UnmappedVehiclesPanel rows={unmapped} />
        </section>
      )}
    </div>
  );
}
