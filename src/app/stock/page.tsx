import { db } from "@/db";
import { stockMappings, stockUploads, stockVehicles } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { TopNav } from "@/components/top-nav";
import { StockBrowser, type StockRow } from "./browser";
import { requireStockAccess } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

type MapEntry = { name: string; hidden: boolean; promoteToVariant: boolean };
type KindKey = "dealer" | "model" | "colour" | "engine" | "destination" | "option" | "body" | "transmission" | "drive" | "status" | "derivative";

export default async function PublicStockPage() {
  await requireStockAccess();
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

  /** Look up a raw value. Returns { value, hidden, promoteToVariant } where value is the mapped name or the raw. */
  const mapLookup = (map: Map<string, MapEntry>, raw: string | null | undefined) => {
    if (!raw) return { value: null as string | null, hidden: false, promoteToVariant: false };
    const hit = map.get(raw);
    if (!hit) return { value: raw, hidden: false, promoteToVariant: false };
    return { value: hit.name, hidden: hit.hidden, promoteToVariant: hit.promoteToVariant };
  };

  const out: StockRow[] = [];
  for (const v of rows) {
    // Variant mapping is keyed on "MODEL · SERIES" (or just "MODEL" when no series).
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
    // Hidden on any per-field mapping clears that field for this vehicle but never drops the whole vehicle.
    // Options: map each; drop hidden options entirely (but keep the vehicle).
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

    // Variant default: when no explicit mapping, prefer the trim (seriesRaw) — not the model name.
    const hasMapping = variantKey ? byKind.model.has(variantKey) : false;
    let variant = hasMapping ? (mm.value ?? "") : (v.seriesRaw ?? "");
    if (mm.hidden) variant = "";

    // Derivative with promoteToVariant=true normally replaces the variant (e.g. Explorer SELECT +
    // STYLE → "Style"). For vans the variant is a payload code starting with a digit (e.g. "280 L1");
    // we keep variant and derivative as separate fields so each can be filtered independently
    // (variant=280 L1, derivative=Limited).
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

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="stock" />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Available stock</h1>
            <p className="mt-1 text-sm text-slate-500">
              {out.length.toLocaleString()} vehicles in stock. Use the filters to narrow down.
              {latestUpload && (
                <> · <span className="text-slate-400">Updated {new Date(latestUpload.uploadedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="mt-6">
          <StockBrowser rows={out} />
        </div>
      </main>
    </div>
  );
}
