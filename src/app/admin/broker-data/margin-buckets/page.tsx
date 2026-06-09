import Link from "next/link";
import { db } from "@/db";
import { vehicleMaster } from "@/db/schema";
import { sql } from "drizzle-orm";
import { listAllMarginRules, listMarginBuckets } from "@/lib/vehicle-master";
import { AddBucketForm, BucketsList } from "./forms";

export const dynamic = "force-dynamic";

export default async function MarginBucketsPage() {
  const [buckets, rules, vehicleCounts] = await Promise.all([
    listMarginBuckets(),
    listAllMarginRules(),
    // How many vehicles are assigned to each bucket — useful so admin
    // sees "Ranger · 12 vehicles" at a glance without opening every card.
    db
      .select({ bucketId: vehicleMaster.marginBucketId, count: sql<number>`count(*)` })
      .from(vehicleMaster)
      .groupBy(vehicleMaster.marginBucketId),
  ]);

  const rulesByBucket = new Map<string, { id: string; label: string; pct: number }[]>();
  for (const r of rules) {
    const arr = rulesByBucket.get(r.bucketId) ?? [];
    arr.push({ id: r.id, label: r.label, pct: r.pct });
    rulesByBucket.set(r.bucketId, arr);
  }
  const countsByBucket = new Map<string, number>();
  for (const c of vehicleCounts) {
    if (c.bucketId) countsByBucket.set(c.bucketId, Number(c.count));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Margin buckets</h1>
        <p className="mt-1 text-sm text-slate-500">
          Group vehicles by the margin rules that apply to them. A bucket might be a model (Ranger,
          Transit Custom) or a model+fuel split (Kuga PHEV). Each bucket carries N margin rules — Base
          Trading Margin, Franchise Bonus, Standards, VETS, etc. — that get summed and applied to every
          vehicle in the bucket.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a bucket</h2>
        <AddBucketForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          {buckets.length.toLocaleString()} bucket{buckets.length === 1 ? "" : "s"}
        </h2>
        <BucketsList
          buckets={buckets.map((b) => ({
            id: b.id,
            name: b.name,
            notes: b.notes,
            rules: rulesByBucket.get(b.id) ?? [],
            vehicleCount: countsByBucket.get(b.id) ?? 0,
          }))}
        />
      </section>
    </div>
  );
}
