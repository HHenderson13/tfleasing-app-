import { db } from "@/db";
import { stockMappings, stockVehicles } from "@/db/schema";
import { TopNav } from "@/components/top-nav";
import { StockBrowser, type StockRow } from "./browser";

export const dynamic = "force-dynamic";

type MapEntry = { name: string; hidden: boolean; promoteToVariant: boolean };
type KindKey = "dealer" | "model" | "colour" | "engine" | "destination" | "option" | "body" | "transmission" | "drive" | "status" | "derivative";

export default async function PublicStockPage() {
  const [rows, mappings] = await Promise.all([
    db.select().from(stockVehicles),
    db.select().from(stockMappings),
  ]);

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
    // Hidden on most fields drops the whole vehicle. Hidden on derivative only drops the derivative value.
    if (mm.hidden || dm.hidden || cm.hidden || em.hidden || zm.hidden || bm.hidden || tm.hidden || drm.hidden || sm.hidden) continue;

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

    // Derivative with promoteToVariant=true moves into the variant column and is cleared from derivative.
    let derivative = dem.value;
    if (dem.promoteToVariant && dem.value) {
      variant = dem.value;
      derivative = null;
    }
    if (dem.hidden) derivative = null;

    out.push({
      vin: v.vin,
      bucket: v.sourceSheet ?? "—",
      variant,
      derivative,
      series: v.seriesRaw,
      modelYear: v.modelYear,
      bodyStyle: bm.value,
      engine: em.value,
      transmission: tm.value,
      drive: drm.value,
      colour: cm.value ?? "—",
      options,
      orderNo: v.orderNo,
      status: sm.value,
      gateRelease: v.gateReleaseAt ? v.gateReleaseAt.toISOString() : null,
      eta: v.etaAt ? v.etaAt.toISOString() : null,
      dealer: dm.value ?? "—",
      destination: zm.value,
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="stock" />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Available stock</h1>
            <p className="mt-1 text-sm text-slate-500">{out.length.toLocaleString()} vehicles in stock. Use the filters to narrow down.</p>
          </div>
        </div>
        <div className="mt-6">
          <StockBrowser rows={out} />
        </div>
      </main>
    </div>
  );
}
