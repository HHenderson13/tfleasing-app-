import { requireBrokerUser } from "@/lib/auth-guard";
import { isVanBucket, loadMappedStock } from "@/lib/stock-list";
import { vehicleReferenceFromVin } from "@/lib/broker-vehicle";
import { BrokerHeader } from "../../header";
import { BrokerStockBrowser, type BrokerRow } from "../browser";

export const dynamic = "force-dynamic";

export default async function BrokerNewCarSearchPage() {
  const me = await requireBrokerUser();
  const { rows, latestUploadedAt } = await loadMappedStock();
  // Only passenger vehicles — anything in the van bucket list is on the
  // /new-van page instead. Pre-reg vans are split out separately when
  // admin starts flagging them in Phase 4.
  const cars = rows.filter((r) => !isVanBucket(r.bucket));
  const broker: BrokerRow[] = cars.map((r) => ({
    ref: vehicleReferenceFromVin(r.vin),
    bucket: r.bucket,
    variant: r.variant,
    derivative: r.derivative,
    series: r.series,
    modelYear: r.modelYear,
    bodyStyle: r.bodyStyle,
    engine: r.engine,
    transmission: r.transmission,
    drive: r.drive,
    colour: r.colour,
    options: r.options,
    status: r.status,
    eta: r.eta,
    delivered: r.delivered,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/search/new-car" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Search a new car</h1>
        <p className="mt-1 text-sm text-slate-500">
          {broker.length.toLocaleString()} passenger vehicles in stock.
          {latestUploadedAt && (
            <> · <span className="text-slate-400">Updated {new Date(latestUploadedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></>
          )}
        </p>
        <div className="mt-6">
          <BrokerStockBrowser rows={broker} />
        </div>
      </main>
    </div>
  );
}
