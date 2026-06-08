import Link from "next/link";

export const dynamic = "force-dynamic";

// Hub for the broker-portal background data. Phase 4 ships these tiles
// in order — cash values first (unblocks the outright quote form),
// stock-turn rules, interest/deposit grids, OFP import, EV bonus &
// trade-in, business discount lookup.

const TILES = [
  { key: "cash-values",    title: "Cash values + margins", desc: "What TF charges the customer per vehicle, and what we retain.", href: "/admin/broker-data/cash-values", tone: "from-emerald-500 to-teal-700",   live: true },
  { key: "stock-turn",     title: "Stock turn bonuses",    desc: "Bonus paid in return for registering by a deadline.",            href: "/admin/broker-data/stock-turn",  tone: "from-amber-500 to-orange-700",  live: true },
  { key: "interest-grids", title: "Interest + deposit grids", desc: "Per-term, per-customer-type rates for PCP / HP / HPB.",       href: "/admin/broker-data/interest",    tone: "from-sky-500 to-indigo-700",    live: true },
  { key: "ofp",            title: "OFP data import",       desc: "Optional Final Payment data from the quarterly Ford XLSX.",     href: "/admin/broker-data/ofp",         tone: "from-violet-500 to-fuchsia-700",live: true },
  { key: "incentives",     title: "EV bonus, trade-in, test drive", desc: "Power Promise wallbox/£500, trade-in £, test-drive £.", href: "/admin/broker-data/incentives", tone: "from-rose-500 to-pink-700",     live: true  },
  { key: "business",       title: "Business discount",     desc: "Higher cash discount paired with the higher APR tier.",         href: "/admin/broker-data/business",   tone: "from-slate-700 to-slate-900",   live: true  },
] as const;

export default function BrokerDataHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Broker data</h1>
        <p className="mt-1 text-sm text-slate-500">
          Background data that drives the broker portal quoting engine. Cash values are live now;
          the other tiles activate as Phase 4 rolls out.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => {
          const card = (
            <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.tone}`} />
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-slate-900">{t.title}</div>
                {!t.live && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">Soon</span>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{t.desc}</p>
              {t.live && <div className="mt-3 text-xs font-medium text-slate-400 group-hover:text-slate-700">Open →</div>}
            </div>
          );
          if (!t.live) return <div key={t.key} className="opacity-60 pointer-events-none">{card}</div>;
          return <Link key={t.key} href={t.href}>{card}</Link>;
        })}
      </div>
    </div>
  );
}
