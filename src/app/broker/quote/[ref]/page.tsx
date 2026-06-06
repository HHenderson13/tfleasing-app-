import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVehicleByReference } from "@/lib/broker-vehicle";
import { loadMappedStock } from "@/lib/stock-list";
import { BrokerHeader } from "../../header";

export const dynamic = "force-dynamic";

// Phase 2 lands the broker here when they click Get Quote. We resolve the
// reference back to a vehicle and confirm the lookup works end-to-end —
// the actual quote inputs (route, commission, term, mileage, deposit,
// retail vs business) wire up in Phase 3.
export default async function BrokerQuoteLandingPage({ params }: { params: Promise<{ ref: string }> }) {
  const me = await requireBrokerUser();
  const { ref } = await params;
  const vehicle = await findVehicleByReference(ref);
  if (!vehicle) notFound();

  // Mirror the same mapping pipeline the search page uses so the vehicle
  // headline matches what the broker just clicked from. A real per-
  // vehicle loader is overkill at this point — a small lookup over the
  // mapped list is fast and means there's only one place that knows the
  // mapping rules.
  const { rows } = await loadMappedStock();
  const mapped = rows.find((r) => r.vin === vehicle.vin);

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quote" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/broker/search/new-car" className="text-xs text-slate-500 hover:text-slate-900">← Back to search</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Get quote</h1>
        <div className="mt-1 text-xs text-slate-400">
          Reference <span className="font-mono font-semibold text-slate-700">{ref}</span>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Vehicle</h2>
          {mapped ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-base font-semibold text-slate-900">{mapped.bucket}</span>
                <span className="text-base text-slate-700">{mapped.variant}</span>
                {mapped.derivative && <span className="text-xs text-slate-500">· {mapped.derivative}</span>}
                {mapped.modelYear && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{mapped.modelYear}</span>}
              </div>
              <div className="text-[11px] text-slate-500 space-x-2">
                {mapped.bodyStyle && <span>{mapped.bodyStyle}</span>}
                {mapped.engine && <span>· {mapped.engine}</span>}
                {mapped.transmission && <span>· {mapped.transmission}</span>}
                {mapped.drive && <span>· {mapped.drive}</span>}
                <span>· {mapped.colour}</span>
              </div>
              {mapped.options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {mapped.options.map((o, i) => (
                    <span key={i} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-100">{o}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Vehicle details unavailable.</p>
          )}
        </section>

        <section className="mt-4 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <div className="text-3xl">⚙️</div>
          <p className="mt-2 text-sm text-slate-600">
            Quote inputs land in the next phase — Outright Purchase, PCP, HP, HP + Balloon, and Contract Hire,
            with retail vs business toggle, commission +VAT, and term / mileage / deposit customisation.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            For now this page confirms the reference <span className="font-mono">{ref}</span> resolves back to the right vehicle.
          </p>
        </section>
      </main>
    </div>
  );
}
