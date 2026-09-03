import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { stockMappings, stockUploads, stockVehicles } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { vehicleReferenceFromVin } from "./stock-reference-mint";

// Cache tags so the mapped-stock cache can be invalidated when admin
// uploads a new stock file or edits the mapping table. Both tags are
// busted via updateTag() from the admin actions in
// src/app/admin/stock/actions.ts and stock-mappings/actions.ts.
export const STOCK_VEHICLES_TAG = "stock-vehicles";
export const STOCK_MAPPINGS_TAG = "stock-mappings";

// Single source of truth for the mapped-stock pipeline. Used by:
//   • /stock        — TF view. Every field, every facet.
//   • /broker/stock — broker view. Same rows, same component, run
//     through redactForBroker() first.
//
// Both views render the SAME component (components/stock-browser.tsx),
// so a change to the stock UI lands on both without being written twice.
// The broker differences are expressed in two places only: the fields
// redactForBroker() strips below, and the `audience` prop the browser
// takes. Nothing else forks.

export interface MappedStockRow {
  // Opaque, stable public handle. Present on BOTH views: a broker quotes
  // it back to us, and TF pastes it into /stock search to find the
  // vehicle. See lib/stock-reference.ts.
  ref: string;
  // Internal identifier. Redacted before the broker payload is built —
  // it must never reach a broker's browser.
  vin: string | null;
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
  // "The vehicle is physically here." Derived from the mapped status once,
  // server-side, so the browser never has to re-parse status text — and so
  // brokers can be shown availability without being shown status at all.
  inStock: boolean;
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

    const vin = v.vin ?? `row-${v.id}`;
    const status = sm.hidden ? null : sm.value;
    out.push({
      ref: vehicleReferenceFromVin(vin),
      vin,
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
      status,
      gateRelease: v.gateReleaseAt ? v.gateReleaseAt.toISOString() : null,
      eta: v.etaAt ? v.etaAt.toISOString() : null,
      delivered: v.deliveredAt ? v.deliveredAt.toISOString() : null,
      interestBearing: v.interestBearingAt ? v.interestBearingAt.toISOString() : null,
      adopted: v.adoptedAt ? v.adoptedAt.toISOString() : null,
      dealer: dm.hidden ? "—" : (dm.value ?? "—"),
      destination: zm.hidden ? null : zm.value,
      inStock: IN_STOCK_STATUS.test(status ?? ""),
    });
  }
  return { rows: out, latestUploadedAt: latestUpload?.uploadedAt ?? null };
}

// Statuses that mean "the vehicle has landed". Kept next to the mapper
// because it runs against the MAPPED status, i.e. after stock_mappings
// has rewritten the raw feed value to its display name.
const IN_STOCK_STATUS = /deliver|dealer|arrived|at site/i;

// ─── Broker redaction ──────────────────────────────────────────────────────
//
// Everything a broker must not see is removed HERE, on the server, before
// the row is serialised into the page. Hiding a field in the component is
// not enough: a server-rendered payload is readable in page source, so a
// field merely hidden in JSX would still leak. Anything commercially or
// operationally sensitive is dropped from the object entirely.
//
// Dropped, and why:
//   vin, orderNo          — internal identifiers; `ref` replaces them.
//   dealer, destination   — reveals our network and where a unit sits.
//   status                — internal pipeline language; the broker gets
//                           the coarse in-stock / ETA-month split instead.
//   modelYear             — commercially sensitive (old plate = old stock).
//   interestBearing,      — funding. Never visible to a broker in any
//   adopted                 form, including as a filter or a tag.
//   gateRelease           — a build milestone, and a back door to the
//                           ageing figure we're deliberately not showing.
//   delivered             — the arrival date. A broker needs to know a
//                           vehicle is HERE, not when it landed: a date
//                           three months old prices the car for them. The
//                           badge says "Available now" and `inStock`
//                           already carries the only fact they need, so
//                           the date does not travel.
export type BrokerStockRow = Omit<
  MappedStockRow,
  "vin" | "orderNo" | "dealer" | "destination" | "status" | "modelYear" | "interestBearing" | "adopted" | "gateRelease" | "delivered"
>;

export function redactForBroker(rows: MappedStockRow[]): BrokerStockRow[] {
  return rows.map((r) => ({
    ref: r.ref,
    bucket: r.bucket,
    variant: r.variant,
    derivative: r.derivative,
    series: r.series,
    bodyStyle: r.bodyStyle,
    engine: r.engine,
    transmission: r.transmission,
    drive: r.drive,
    colour: r.colour,
    options: r.options,
    eta: r.eta,
    inStock: r.inStock,
  }));
}
