import Link from "next/link";
import { db } from "@/db";
import { vehicleOptions } from "@/db/schema";
import { asc } from "drizzle-orm";
import { listMarginBuckets, listVehicleMaster } from "@/lib/vehicle-master";
import { loadMappedStock } from "@/lib/stock-list";
import {
  AddVehicleForm,
  MissingVehiclesPanel,
  VehiclesList,
  type StockCombo,
  type VehicleOptionRow,
} from "./forms";

export const dynamic = "force-dynamic";

export default async function VehicleMasterPage() {
  const [vehicles, allOptions, buckets, stock] = await Promise.all([
    listVehicleMaster(),
    db.select().from(vehicleOptions).orderBy(asc(vehicleOptions.vehicleId), asc(vehicleOptions.sortOrder)),
    listMarginBuckets(),
    loadMappedStock(),
  ]);

  // Group options by vehicle for the cards.
  const optionsByVehicle = new Map<string, VehicleOptionRow[]>();
  for (const o of allOptions) {
    const arr = optionsByVehicle.get(o.vehicleId) ?? [];
    arr.push({ id: o.id, optionCode: o.optionCode, label: o.label, priceGbp: o.priceGbp });
    optionsByVehicle.set(o.vehicleId, arr);
  }

  // Compute the missing-vehicles set: every distinct (model year × model
  // × bodystyle × derivative × engine × drive × transmission) tuple in
  // live stock that doesn't have a vehicle_master row yet.
  //
  // Mapping decisions: stock.bucket → model (the source sheet name like
  // RANGER); stock.variant → derivative (the most-prominent WERS series
  // description). Admin can edit either after add.
  const stockKey = (c: { modelYear: string | null; bucket: string; bodyStyle: string | null; variant: string; engine: string | null; drive: string | null; transmission: string | null }) =>
    [c.modelYear ?? "", c.bucket, c.bodyStyle ?? "", c.variant, c.engine ?? "", c.drive ?? "", c.transmission ?? ""].join("|");

  const stockCombos = new Map<string, StockCombo>();
  for (const v of stock.rows) {
    // Skip rows missing any of the 7 attributes — they'd produce a non-
    // matchable row in vehicle_master and clutter the panel.
    if (!v.modelYear || !v.bodyStyle || !v.engine || !v.drive || !v.transmission) continue;
    const k = stockKey(v);
    const cur = stockCombos.get(k);
    if (cur) cur.count++;
    else stockCombos.set(k, {
      modelYear: v.modelYear,
      model: v.bucket,
      bodystyle: v.bodyStyle,
      derivative: v.variant,
      engine: v.engine,
      drive: v.drive,
      transmission: v.transmission,
      count: 1,
    });
  }
  const mappedKeys = new Set(vehicles.map((v) => [v.modelYear, v.model, v.bodystyle, v.derivative, v.engine, v.drive, v.transmission].join("|")));
  const missing = Array.from(stockCombos.values())
    .filter((c) => !mappedKeys.has([c.modelYear, c.model, c.bodystyle, c.derivative, c.engine, c.drive, c.transmission].join("|")))
    .sort((a, b) => b.count - a.count);

  const bucketOptions = buckets.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Vehicle pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          One row per real Ford spec, keyed by the full identifier stack
          (model year × model × bodystyle × derivative × engine × drive × transmission).
          Admin enters the basic list price, manufacturer delivery, CO2 / fuel type, grants, the 1F discount %,
          a margin bucket, and the dealer profit floor. The broker quote engine derives customer OTR from these.
        </p>
      </div>

      <MissingVehiclesPanel stockCombos={missing} buckets={bucketOptions} />

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a vehicle manually</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <AddVehicleForm prefill={null} buckets={bucketOptions} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          {vehicles.length.toLocaleString()} mapped vehicle{vehicles.length === 1 ? "" : "s"}
        </h2>
        <VehiclesList
          vehicles={vehicles.map((v) => ({
            id: v.id,
            modelYear: v.modelYear,
            model: v.model,
            bodystyle: v.bodystyle,
            derivative: v.derivative,
            engine: v.engine,
            drive: v.drive,
            transmission: v.transmission,
            capCode: v.capCode,
            capId: v.capId,
            basicListPriceGbp: v.basicListPriceGbp,
            manufacturerDeliveryGbp: v.manufacturerDeliveryGbp,
            fuelType: v.fuelType as "ice" | "phev" | "bev",
            isVan: v.isVan,
            co2GKm: v.co2GKm,
            pivgGrantGbp: v.pivgGrantGbp,
            olevGrantGbp: v.olevGrantGbp,
            oneFDiscountPct: v.oneFDiscountPct,
            marginBucketId: v.marginBucketId,
            profitMode: v.profitMode as "gbp" | "pct",
            profitValue: v.profitValue,
            notes: v.notes,
            options: optionsByVehicle.get(v.id) ?? [],
          }))}
          buckets={bucketOptions}
        />
      </section>
    </div>
  );
}
