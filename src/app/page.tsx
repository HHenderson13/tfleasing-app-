import Link from "next/link";
import { getAlerts, getRecentlyDelivered } from "@/lib/proposals";
import { requireUser } from "@/lib/auth-guard";
import { canSeeOrders, canSeeProposals, isAdmin, isExec, sectionAccess } from "@/lib/auth";
import { signOutAction } from "./login/actions";

type Tile = { href: string; title: string; desc: string; tone: string; key: keyof ReturnType<typeof sectionAccess> };

const TILES: Tile[] = [
  { key: "quote",     href: "/quote",     title: "Quote",     desc: "Rank funders for a vehicle, term and mileage.",  tone: "from-violet-500 to-violet-700" },
  { key: "stock",     href: "/stock",     title: "Stock",     desc: "Browse, filter and export Ford stock vehicles.", tone: "from-emerald-500 to-emerald-700" },
  { key: "proposals", href: "/proposals", title: "Proposals", desc: "Live proposals — accept, decline, refer.",       tone: "from-sky-500 to-sky-700" },
  { key: "orders",    href: "/orders",    title: "Orders",    desc: "Accepted deals moving through to delivery.",     tone: "from-amber-500 to-amber-700" },
  { key: "orders",    href: "/orders/awaiting", title: "Awaiting delivery", desc: "Live ETAs and delivery tracking for ordered vehicles.", tone: "from-teal-500 to-teal-700" },
  { key: "orders",    href: "/orders/delivered", title: "Delivered", desc: "Deals handed over to the customer.", tone: "from-emerald-500 to-emerald-700" },
  { key: "reports",   href: "/reports",   title: "Reports",   desc: "Funder, source, model and EV performance.",      tone: "from-rose-500 to-fuchsia-600" },
  { key: "admin",     href: "/admin",     title: "Admin",     desc: "Ratebooks, discounts, mappings and data.",       tone: "from-slate-700 to-slate-900" },
];

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const access = sectionAccess(user);
  const visibleTiles = TILES.filter((t) => access[t.key]);

  const execScope = isExec(user) && !isAdmin(user) ? user.salesExecId ?? null : null;

  const [alerts, recentlyDeliveredAll] = await Promise.all([
    canSeeProposals(user) ? getAlerts(execScope) : Promise.resolve([] as Awaited<ReturnType<typeof getAlerts>>),
    canSeeOrders(user) ? getRecentlyDelivered(20) : Promise.resolve([] as Awaited<ReturnType<typeof getRecentlyDelivered>>),
  ]);

  const recentlyDelivered = execScope
    ? recentlyDeliveredAll.filter((d) => d.execName && user.name && d.execName === user.name).slice(0, 8)
    : recentlyDeliveredAll.slice(0, 8);

  const danger = alerts.filter((a) => a.severity === "danger");
  const warn = alerts.filter((a) => a.severity === "warn");

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">TrustFord Leasing</h1>
            <p className="mt-1 text-sm text-slate-500">Pick a section to get started.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="text-right">
              <div className="font-medium text-slate-700">{user.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{user.roles.join(" · ") || "no role"}</div>
            </div>
            <form action={signOutAction}>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {canSeeProposals(user) && (
          <form action="/search" className="mt-6">
            <input
              name="q"
              placeholder="Search customers, FP numbers, VINs, orders, models…"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
            />
          </form>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.tone}`} />
              <div className="text-lg font-semibold text-slate-900 group-hover:text-slate-950">{t.title}</div>
              <p className="mt-1 text-sm text-slate-500">{t.desc}</p>
              <div className="mt-3 text-xs font-medium text-slate-400 group-hover:text-slate-700">Open →</div>
            </Link>
          ))}
        </div>

        {recentlyDelivered.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Just delivered (last 7 days)</h2>
            <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
              {recentlyDelivered.map((d) => (
                <li key={d.proposalId}>
                  <Link
                    href={`/orders/${d.proposalId}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-emerald-50/40"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                      Delivered
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{d.customerName}</span>
                      <span className="text-slate-400"> · {d.model} {d.derivative}</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(d.deliveredAt).toLocaleDateString("en-GB")} · {d.execName ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {alerts.length > 0 && (
          <section className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Needs attention</h2>
              <div className="text-xs text-slate-400">
                {danger.length > 0 && <span className="mr-3 text-red-600">{danger.length} urgent</span>}
                {warn.length > 0 && <span className="text-amber-600">{warn.length} warning</span>}
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {alerts.slice(0, 20).map((a) => {
                const tone =
                  a.severity === "danger"
                    ? "bg-red-50 text-red-700 ring-red-200"
                    : "bg-amber-50 text-amber-700 ring-amber-200";
                return (
                  <li key={`${a.kind}-${a.proposalId}`}>
                    <Link
                      href={`/customers/${a.customerId}`}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
                    >
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone}`}>
                        {a.severity === "danger" ? "Urgent" : "Warn"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-900">{a.customerName}</span>
                        <span className="text-slate-400"> · {a.model} {a.derivative}</span>
                        <div className="text-xs text-slate-600">{a.message}</div>
                      </span>
                      <span className="text-[11px] text-slate-400">{a.execName ?? "—"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {alerts.length > 20 && (
              <div className="mt-2 text-right text-xs text-slate-400">+{alerts.length - 20} more</div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
