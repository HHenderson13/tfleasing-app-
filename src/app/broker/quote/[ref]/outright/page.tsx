import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVehicleByReference } from "@/lib/broker-vehicle";
import { loadMappedStock } from "@/lib/stock-list";
import { vehicleSnapshotFromMapped } from "@/lib/broker-quotes";
import { BrokerHeader } from "../../../header";
import { OutrightQuoteForm } from "./form";

export const dynamic = "force-dynamic";

export default async function OutrightQuotePage({ params }: { params: Promise<{ ref: string }> }) {
  const me = await requireBrokerUser();
  const { ref } = await params;
  const vehicle = await findVehicleByReference(ref);
  if (!vehicle) notFound();
  const { rows } = await loadMappedStock();
  const mapped = rows.find((r) => r.vin === vehicle.vin);
  if (!mapped) notFound();
  const snapshot = vehicleSnapshotFromMapped(mapped);

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quote" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href={`/broker/quote/${ref}`} className="text-xs text-slate-500 hover:text-slate-900">← Pick a different route</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Outright purchase</h1>
        <div className="mt-1 text-xs text-slate-400">
          Reference <span className="font-mono font-semibold text-slate-700">{ref}</span>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold text-slate-900">{snapshot.bucket}</span>
            <span className="text-base text-slate-700">{snapshot.variant}</span>
            {snapshot.derivative && <span className="text-xs text-slate-500">· {snapshot.derivative}</span>}
            {snapshot.modelYear && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{snapshot.modelYear}</span>}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 space-x-2">
            {snapshot.bodyStyle && <span>{snapshot.bodyStyle}</span>}
            {snapshot.engine && <span>· {snapshot.engine}</span>}
            {snapshot.transmission && <span>· {snapshot.transmission}</span>}
            {snapshot.drive && <span>· {snapshot.drive}</span>}
            <span>· {snapshot.colour}</span>
          </div>
        </section>

        <OutrightQuoteForm ref={ref} snapshotJson={JSON.stringify(snapshot)} />
      </main>
    </div>
  );
}
