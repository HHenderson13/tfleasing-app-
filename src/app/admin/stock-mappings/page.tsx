import { db } from "@/db";
import { stockMappings, stockVehicles } from "@/db/schema";
import { sql } from "drizzle-orm";
import { StockMappingsView } from "./view";
import type { MappingKind } from "./actions";

export const dynamic = "force-dynamic";

export type RawCount = { raw: string; count: number; buckets: string[] };

export default async function StockMappingsPage() {
  const [mappings, rows] = await Promise.all([
    db.select().from(stockMappings),
    db
      .select({
        bucket:       stockVehicles.sourceSheet,
        dealer:       stockVehicles.dealerRaw,
        model:        stockVehicles.modelRaw,
        series:       stockVehicles.seriesRaw,
        derivative:   stockVehicles.derivativeRaw,
        colour:       stockVehicles.colourRaw,
        engine:       stockVehicles.engine,
        transmission: stockVehicles.transmission,
        drive:        stockVehicles.drive,
        body:         stockVehicles.bodyStyle,
        destination:  stockVehicles.destinationRaw,
        status:       stockVehicles.locationStatus,
        options:      stockVehicles.options,
        n: sql<number>`count(*)`,
      })
      .from(stockVehicles)
      .groupBy(
        stockVehicles.sourceSheet,
        stockVehicles.dealerRaw,
        stockVehicles.modelRaw,
        stockVehicles.seriesRaw,
        stockVehicles.derivativeRaw,
        stockVehicles.colourRaw,
        stockVehicles.engine,
        stockVehicles.transmission,
        stockVehicles.drive,
        stockVehicles.bodyStyle,
        stockVehicles.destinationRaw,
        stockVehicles.locationStatus,
        stockVehicles.options,
      ),
  ]);

  function tally(keyFn: (r: (typeof rows)[number]) => string | null | undefined): RawCount[] {
    const countMap = new Map<string, number>();
    const bucketMap = new Map<string, Set<string>>();
    for (const r of rows) {
      const k = keyFn(r);
      if (!k) continue;
      countMap.set(k, (countMap.get(k) ?? 0) + Number(r.n));
      let bs = bucketMap.get(k);
      if (!bs) { bs = new Set(); bucketMap.set(k, bs); }
      if (r.bucket) bs.add(r.bucket);
    }
    return [...countMap.entries()]
      .map(([raw, count]) => ({ raw, count, buckets: [...(bucketMap.get(raw) ?? [])].sort() }))
      .sort((a, b) => b.count - a.count);
  }

  // Variant key = "MODEL · SERIES" or just "MODEL" so admin sees context.
  const variants = tally((r) => (r.model ? `${r.model}${r.series ? ` · ${r.series}` : ""}` : null));

  // Options: split per-vehicle, track buckets.
  const optCount = new Map<string, number>();
  const optBuckets = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.options) continue;
    for (const opt of r.options.split("\n")) {
      const o = opt.trim();
      if (!o) continue;
      optCount.set(o, (optCount.get(o) ?? 0) + Number(r.n));
      let bs = optBuckets.get(o);
      if (!bs) { bs = new Set(); optBuckets.set(o, bs); }
      if (r.bucket) bs.add(r.bucket);
    }
  }
  const options: RawCount[] = [...optCount.entries()]
    .map(([raw, count]) => ({ raw, count, buckets: [...(optBuckets.get(raw) ?? [])].sort() }))
    .sort((a, b) => b.count - a.count);

  const rawsByKind: Record<MappingKind, RawCount[]> = {
    dealer:       tally((r) => r.dealer),
    model:        variants,
    derivative:   tally((r) => r.derivative),
    colour:       tally((r) => r.colour),
    engine:       tally((r) => r.engine),
    destination:  tally((r) => r.destination),
    option:       options,
    body:         tally((r) => r.body),
    transmission: tally((r) => r.transmission),
    drive:        tally((r) => r.drive),
    status:       tally((r) => r.status),
  };

  const allBuckets = [...new Set(rows.map((r) => r.bucket).filter(Boolean) as string[])].sort();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Stock mappings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tidy up raw Ford feed values. New values from future uploads appear as <span className="font-medium text-amber-700">Unmapped</span>. Use the model filter to work through Kuga, Puma, Transit Custom etc. one at a time.
      </p>
      <div className="mt-6">
        <StockMappingsView
          mappings={mappings.map((m) => ({
            kind: m.kind as MappingKind,
            rawKey: m.rawKey,
            displayName: m.displayName,
            hidden: m.hidden,
            promoteToVariant: m.promoteToVariant,
          }))}
          rawsByKind={rawsByKind}
          allBuckets={allBuckets}
        />
      </div>
    </div>
  );
}
