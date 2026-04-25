import { db } from "@/db";
import { modelDiscounts, vehicles } from "@/db/schema";
import { asc, isNotNull, isNull, sql } from "drizzle-orm";
import { DiscountsGrid } from "./grid";

export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
  const [rows, assigned, unmappedCount] = await Promise.all([
    db.select().from(modelDiscounts).orderBy(modelDiscounts.sortOrder),
    db
      .select({
        capCode: vehicles.capCode,
        model: vehicles.model,
        derivative: vehicles.derivative,
        fuelType: vehicles.fuelType,
        listPriceNet: vehicles.listPriceNet,
        discountKey: vehicles.discountKey,
      })
      .from(vehicles)
      .where(isNotNull(vehicles.discountKey))
      .orderBy(asc(vehicles.model), asc(vehicles.derivative)),
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(vehicles)
      .where(isNull(vehicles.discountKey))
      .then((r) => Number(r[0]?.n ?? 0)),
  ]);

  const byProfile = new Map<string, typeof assigned>();
  for (const v of assigned) {
    const list = byProfile.get(v.discountKey!) ?? [];
    list.push(v);
    byProfile.set(v.discountKey!, list);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Discount profiles</h1>
          <p className="mt-1 text-sm text-slate-500">Per-model discount breakdown. Total = Terms + Dealer. Each vehicle can belong to only one profile.</p>
        </div>
        {unmappedCount > 0 && (
          <a href="/admin/vehicles" className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">
            {unmappedCount} unmapped vehicle{unmappedCount === 1 ? "" : "s"} →
          </a>
        )}
      </div>
      <div className="mt-6">
        <DiscountsGrid
          rows={rows.map((r) => {
            const vs = byProfile.get(r.id) ?? [];
            return {
              id: r.id,
              label: r.label,
              termsPct: r.termsPct,
              dealerPct: r.dealerPct,
              additionalDiscountsGbp: r.additionalDiscountsGbp,
              novunaChip3Yr: r.novunaChip3Yr,
              novunaChip4Yr: r.novunaChip4Yr,
              grantText: r.grantText,
              customerSavingGbp: r.customerSavingGbp,
              notes: r.notes,
              vehicles: vs.map((v) => ({
                capCode: v.capCode,
                model: v.model,
                derivative: v.derivative,
                fuelType: v.fuelType,
                listPriceNet: v.listPriceNet,
              })),
            };
          })}
        />
      </div>
    </div>
  );
}
