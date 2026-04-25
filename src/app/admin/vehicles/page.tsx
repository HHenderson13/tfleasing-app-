import { db } from "@/db";
import { vehicles, modelDiscounts } from "@/db/schema";
import { asc } from "drizzle-orm";
import { VehiclesView } from "./view";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const [vs, ds] = await Promise.all([
    db.select().from(vehicles).orderBy(asc(vehicles.model), asc(vehicles.derivative)),
    db.select({ id: modelDiscounts.id, label: modelDiscounts.label }).from(modelDiscounts).orderBy(modelDiscounts.label),
  ]);
  const discountLabel = new Map(ds.map((d) => [d.id, d.label]));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Vehicles</h1>
      <p className="mt-1 text-sm text-slate-500">
        Master list populated automatically by ratebook uploads. Rows without a discount profile need attention on the Discounts tab.
      </p>
      <div className="mt-6">
        <VehiclesView
          rows={vs.map((v) => ({
            capCode: v.capCode,
            model: v.model,
            derivative: v.derivative,
            fuelType: v.fuelType,
            listPriceNet: v.listPriceNet,
            discountKey: v.discountKey,
            discountLabel: v.discountKey ? (discountLabel.get(v.discountKey) ?? v.discountKey) : null,
          }))}
        />
      </div>
    </div>
  );
}
