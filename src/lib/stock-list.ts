import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { stockMappings, stockUploads, stockVehicles } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

// Cache tags so the mapped-stock cache can be invalidated when admin
// uploads a new stock file or edits the mapping table. Both tags are
// busted via updateTag() from the admin actions in
// src/app/admin/stock/actions.ts and stock-mappings/actions.ts.
export const STOCK_VEHICLES_TAG = "stock-vehicles";
export const STOCK_MAPPINGS_TAG = "stock-mappings";

// Single source of truth for the mapped-stock pipeline. Used by:
//   • /stock (TF leasing-app full view — every field, every facet)
//   • /broker/search/* (broker-portal view — hides VIN, dealer, etc.
//     and substitutes a stable reference; see lib/broker-vehicle.ts)
//
// Keeping the raw-row → mapped-row work in one place stops the two views
// drifting on tag/mapping logic.

export interface MappedStockRow {
  // Internal identifier — same VIN that's hidden from brokers but used
  // by TF-side rendering and by the broker quote lookup to resolve the
  // unique reference back to a real vehicle.
  vin: string;
  bucket: string;
  variant: string;
  derivative: string | null;
  series: string | null;
  modelYear: string | null;
  bodyStyle: string | null;
  engine: string | null;
  transmission: string | null;
  drive: string | null;
  colour: string;
  options: string[];
  orderNo: string | null;
  status: string | null;
  gateRelease: string | null;
  eta: string | null;
  delivered: string | null;
  interestBearing: string | null;
  adopted: string | null;
  dealer: string;
  destination: string | null;
}

type MapEntry = { name: string; hidden: boolean; promoteToVariant: boolean };
type KindKey = "dealer" | "model" | "colour" | "engine" | "destination" | "option" | "body" | "transmission" | "drive" | "status" | "derivative";

// Two-layer cache:
//   • Outer (unstable_cache): tagged + 5-minute revalidate so the same
//     mapped output is shared across requests + users. Stock changes only
//     when admin uploads (~daily) or edits a mapping, both of which call
//     updateTag() to bust the cache. Dominant perf win on /stock (the
//     highest-traffic page in Speed Insights) — was 4s+ TTFB, now should
//     drop to the cached-payload retrieval cost on warm functions.
//   • Inner (React cache()): per-request dedup so multiple components on
//     the same render (broker search → route picker → quote form) don't
//     each pay the cache lookup overhead.
const cachedMappedStock = unstable_cache(
  _loadMappedStock,
  ["mapped-stock-v1"],
  { tags: [STOCK_VEHICLES_TAG, STOCK_MAPPINGS_TAG], revalidate: 300 },
);
export const loadMappedStock = cache(cachedMappedStock);

async function _loadMappedStock(): Promise<{ rows: MappedStockRow[]; latestUploadedAt: Date | null }> {
  const [rows, mappings, latestUploadRows] = await Promise.all([
    db.select().from(stockVehicles).where(and(eq(stockVehicles.customerAssigned, false), isNotNull(stockVehicles.vin))),
    db.select().from(stockMappings),
    db.select().from(stockUploads).orderBy(desc(stockUploads.uploadedAt)).limit(1),
  ]);
  const latestUpload = latestUploadRows[0] ?? null;

  const byKind: Record<KindKey, Map<string, MapEntry>> = {
    dealer: new Map(), model: new Map(), colour: new Map(), engine: new Map(),
    destination: new Map(), option: new Map(), body: new Map(), transmission: new Map(),
    drive: new Map(), status: new Map(), derivative: new Map(),
  };
  for (const m of mappings) {
    const bucket = byKind[m.kind as KindKey];
    if (bucket) bucket.set(m.rawKey, { name: m.displayName, hidden: m.hidden, promoteToVariant: m.promoteToVariant });
  }
  const mapLookup = (map: Map<string, MapEntry>, raw: string | null | undefined) => {
    if (!raw) return { value: null as string | null, hidden: false, promoteToVariant: false };
    const hit = map.get(raw);
    if (!hit) return { value: raw, hidden: false, promoteToVariant: false };
    return { value: hit.name, hidden: hit.hidden, promoteToVariant: hit.promoteToVariant };
  };

  const out: MappedStockRow[] = [];
  for (const v of rows) {
    const variantKey = v.modelRaw ? `${v.modelRaw}${v.seriesRaw ? ` · ${v.seriesRaw}` : ""}` : null;
    const mm = mapLookup(byKind.model, variantKey);
    const dm = mapLookup(byKind.dealer, v.dealerRaw);
    const cm = mapLookup(byKind.colour, v.colourRaw);
    const em = mapLookup(byKind.engine, v.engine);
    const zm = mapLookup(byKind.destination, v.destinationRaw);
    const bm = mapLookup(byKind.body, v.bodyStyle);
    const tm = mapLookup(byKind.transmission, v.transmission);
    const drm = mapLookup(byKind.drive, v.drive);
    const sm = mapLookup(byKind.status, v.locationStatus);
    const dem = mapLookup(byKind.derivative, v.derivativeRaw);

    const options: string[] = [];
    if (v.options) {
      for (const raw of v.options.split("\n")) {
        const o = raw.trim();
        if (!o) continue;
        const hit = byKind.option.get(o);
        if (hit?.hidden) continue;
        options.push(hit?.name ?? o);
      }
    }
    const hasMapping = variantKey ? byKind.model.has(variantKey) : false;
    let variant = hasMapping ? (mm.value ?? "") : (v.seriesRaw ?? "");
    if (mm.hidden) variant = "";
    let derivative = dem.value;
    if (dem.promoteToVariant && dem.value) {
      const isPayloadVariant = /^\d/.test(variant);
      if (!isPayloadVariant) {
        variant = dem.value;
        derivative = null;
      }
    }
    if (dem.hidden) derivative = null;

    out.push({
      vin: v.vin ?? `row-${v.id}`,
      bucket: v.sourceSheet ?? "—",
      variant,
      derivative,
      series: v.seriesRaw,
      modelYear: v.modelYear,
      bodyStyle: bm.hidden ? null : bm.value,
      engine: em.hidden ? null : em.value,
      transmission: tm.hidden ? null : tm.value,
      drive: drm.hidden ? null : drm.value,
      colour: cm.hidden ? "—" : (cm.value ?? "—"),
      options,
      orderNo: v.orderNo,
      status: sm.hidden ? null : sm.value,
      gateRelease: v.gateReleaseAt ? v.gateReleaseAt.toISOString() : null,
      eta: v.etaAt ? v.etaAt.toISOString() : null,
      delivered: v.deliveredAt ? v.deliveredAt.toISOString() : null,
      interestBearing: v.interestBearingAt ? v.interestBearingAt.toISOString() : null,
      adopted: v.adoptedAt ? v.adoptedAt.toISOString() : null,
      dealer: dm.hidden ? "—" : (dm.value ?? "—"),
      destination: zm.hidden ? null : zm.value,
    });
  }
  return { rows: out, latestUploadedAt: latestUpload?.uploadedAt ?? null };
}

// ─── Vehicle category split ────────────────────────────────────────────────
//
// Ford UK light-commercial range — anything in these buckets is treated
// as a van on the broker portal (drives the /new-car vs /new-van split).
// Everything else is a passenger car. Pre-reg vans are NOT a separate
// bucket on the source data — admin will flag them in Phase 4.

const VAN_BUCKETS = new Set([
  "Transit",
  "Transit Custom",
  "Transit Connect",
  "Transit Courier",
  "Tourneo",
  "Tourneo Custom",
  "Tourneo Connect",
  "Tourneo Courier",
  "Ranger",
  "E-Transit",
  "E-Transit Custom",
  "E-Transit Courier",
]);

// Some uploads use sourceSheet labels like "Transit (FT)" — startsWith
// catches that without being too aggressive.
// Ford's electric-only buckets — drives the EV Power Promise prompt
// on the quote form. Hybrids aren't included; the offer is reserved
// for full-EVs only. New EV launches just need adding here.
const EV_BUCKETS = new Set([
  "Mustang Mach-E",
  "Mach-E",
  "Explorer EV",
  "Explorer",      // when sold as EV — admins can refine the bucket name later
  "Capri",
  "Puma Gen-E",
  "E-Transit",
  "E-Transit Custom",
  "E-Transit Courier",
]);
export function isEvBucket(bucket: string): boolean {
  const b = bucket.trim();
  if (!b) return false;
  if (EV_BUCKETS.has(b)) return true;
  // Catch model-year suffixed variants the source uses, e.g. "E-Transit MY26".
  for (const v of EV_BUCKETS) {
    if (b.startsWith(v + " ") || b.startsWith(v + "(")) return true;
  }
  return false;
}

export function isVanBucket(bucket: string): boolean {
  const b = bucket.trim();
  if (!b) return false;
  for (const v of VAN_BUCKETS) {
    if (b === v) return true;
    if (b.startsWith(v + " ")) return true;
    if (b.startsWith(v + "(")) return true;
  }
  return false;
}
