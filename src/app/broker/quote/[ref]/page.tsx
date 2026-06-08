import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrokerUser } from "@/lib/auth-guard";
import { findVehicleByReference } from "@/lib/broker-vehicle";
import { isEvBucket, loadMappedStock } from "@/lib/stock-list";
import { BrokerHeader } from "../../header";

export const dynamic = "force-dynamic";

// Step 1 of the broker quoting flow — pick a funding route. The Outright
// Purchase form is wired up in Phase 3; the four finance routes go live
// in Phase 5 with the proper rate / OFP / deposit-allowance grids.
const ROUTES: { key: string; href: (ref: string) => string; title: string; desc: string; tone: string; live: boolean }[] = [
  { key: "outright",      title: "Outright Purchase", desc: "Customer pays cash in full.",                                                  tone: "from-emerald-500 to-teal-700",    live: true,  href: (r) => `/broker/quote/${r}/outright` },
  { key: "pcp",           title: "PCP",               desc: "Personal Contract Purchase with optional final payment.",                       tone: "from-sky-500 to-indigo-700",      live: true,  href: (r) => `/broker/quote/${r}/pcp` },
  { key: "hp",            title: "Hire Purchase",     desc: "Equal monthly payments, customer owns at the end.",                             tone: "from-violet-500 to-fuchsia-700",  live: true,  href: (r) => `/broker/quote/${r}/hp` },
  { key: "hp_balloon",    title: "HP with Balloon",   desc: "Lower monthly payments with a balloon at the end.",                             tone: "from-amber-500 to-orange-700",    live: true,  href: (r) => `/broker/quote/${r}/hp-balloon` },
  { key: "contract_hire", title: "Contract Hire",     desc: "Long-term rental — customer hands the vehicle back at the end.",                tone: "from-rose-500 to-pink-700",       live: false, href: (r) => `/broker/quote/${r}/contract-hire` },
];

export default async function FundingRoutePickerPage({ params }: { params: Promise<{ ref: string }> }) {
  const me = await requireBrokerUser();
  const { ref } = await params;
  const vehicle = await findVehicleByReference(ref);
  if (!vehicle) notFound();
  const { rows } = await loadMappedStock();
  const mapped = rows.find((r) => r.vin === vehicle.vin);
  // Light EV detection here so we can prompt the broker before they
  // commit to a route — the active offer details get shown on the
  // form itself once they pick. Keeps the route picker informative
  // without duplicating the wallbox/cash messaging too early.
  const isEv = !!mapped && isEvBucket(mapped.bucket);

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quote" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/broker/search/new-car" className="text-xs text-slate-500 hover:text-slate-900">← Back to search</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Pick a funding route</h1>
        <div className="mt-1 text-xs text-slate-400">
          Reference <span className="font-mono font-semibold text-slate-700">{ref}</span>
        </div>

        {mapped && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-base font-semibold text-slate-900">{mapped.bucket}</span>
              <span className="text-base text-slate-700">{mapped.variant}</span>
              {mapped.derivative && <span className="text-xs text-slate-500">· {mapped.derivative}</span>}
              {mapped.modelYear && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{mapped.modelYear}</span>}
              {isEv && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">⚡ Electric</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 space-x-2">
              {mapped.bodyStyle && <span>{mapped.bodyStyle}</span>}
              {mapped.engine && <span>· {mapped.engine}</span>}
              {mapped.transmission && <span>· {mapped.transmission}</span>}
              {mapped.drive && <span>· {mapped.drive}</span>}
              <span>· {mapped.colour}</span>
            </div>
          </section>
        )}

        {isEv && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">⚡</span>
              <div>
                <div className="text-sm font-semibold text-emerald-900">Ford Power Promise</div>
                <p className="mt-1 text-xs text-emerald-900/80">
                  Electric vehicle — your customer can choose a free home wallbox <em>or</em> take the
                  cash alternative as a price reduction. Pick the offer on the route&apos;s form below.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {ROUTES.map((r) => {
            const card = (
              <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${r.tone}`} />
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-slate-900">{r.title}</div>
                  {!r.live && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">Soon</span>}
                </div>
                <p className="mt-1 text-sm text-slate-500">{r.desc}</p>
                {r.live && <div className="mt-3 text-xs font-medium text-slate-400 group-hover:text-slate-700">Start quote →</div>}
              </div>
            );
            if (!r.live) return <div key={r.key} className="opacity-60 pointer-events-none">{card}</div>;
            return <Link key={r.key} href={r.href(ref)}>{card}</Link>;
          })}
        </div>
      </main>
    </div>
  );
}
