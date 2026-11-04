import Link from "next/link";
import { Suspense } from "react";
import { getAlerts, getRecentlyDelivered } from "@/lib/proposals";
import { requireUser } from "@/lib/auth-guard";
import { canSeeOrders, canSeeProposals, isAdmin, isExec, sectionAccess, type CurrentUser } from "@/lib/auth";
import { signOutAction } from "./login/actions";
import { CARD, CARD_LINK, INPUT, PageTitle } from "@/components/ui";

type Tile = { href: string; title: string; desc: string; tone: string; key: keyof ReturnType<typeof sectionAccess> | "everyone" };

const TILES: Tile[] = [
  { key: "everyone", href: "/profiles", title: "Customer Profiles", desc: "Your live enquiries, most important first. Notes as you talk, part exchange, and copy it all for the CRM.", tone: "from-teal-600 to-cyan-800" },
  { key: "quote",     href: "/quote",     title: "Quote",     desc: "Rank funders for a vehicle, term and mileage.",  tone: "from-violet-500 to-violet-700" },
  { key: "everyone", href: "/ranger-bik", title: "Ranger BIK Calculator", desc: "Every Ranger side by side, car or van: BIK, fuel card, employer's NI and corporation tax, as a PDF for the customer.", tone: "from-sky-600 to-blue-800" },
  { key: "everyone", href: "/fuel-calculator", title: "Fuel Calculator", desc: "Petrol or diesel against electric: running costs at today's UK prices, as a PDF for the customer.", tone: "from-lime-600 to-emerald-700" },
  { key: "stock",     href: "/stock",     title: "Stock",     desc: "Browse, filter and export Ford stock vehicles.", tone: "from-emerald-500 to-emerald-700" },
  { key: "proposals", href: "/proposals", title: "Proposals", desc: "Live proposals: accept, decline, refer.",       tone: "from-sky-500 to-sky-700" },
  { key: "orders",    href: "/orders",    title: "Orders",    desc: "Accepted deals moving through to delivery.",     tone: "from-amber-500 to-amber-700" },
  { key: "orders",    href: "/orders/awaiting", title: "Awaiting delivery", desc: "Live ETAs and delivery tracking for ordered vehicles.", tone: "from-teal-500 to-teal-700" },
  { key: "orders",    href: "/orders/delivered", title: "Delivered", desc: "Deals handed over to the customer.", tone: "from-emerald-500 to-emerald-700" },
  { key: "reports",   href: "/reports",   title: "Reports",   desc: "Funder, source, model and EV performance.",      tone: "from-rose-500 to-fuchsia-600" },
  { key: "forecast",  href: "/forecast",  title: "Forecast",  desc: "Monthly profit forecasts for Lease Car, Lease CV and General Overheads, from dealbook uploads.", tone: "from-cyan-500 to-blue-700" },
  { key: "tenAtTen",  href: "/ten-at-ten", title: "10 at 10", desc: "Enquiries, response times, orders, deliveries against budget, cancellations and the market, for any day, week, month, quarter or range.", tone: "from-indigo-600 to-blue-800" },
  { key: "admin",     href: "/scraper", title: "Market Analysis", desc: "Compare our rates to competitors across the market.",    tone: "from-indigo-500 to-indigo-700" },
  { key: "admin",     href: "/funders", title: "Funder Comparison", desc: "Compare funder rates side by side across our ratebooks.", tone: "from-fuchsia-500 to-purple-700" },
  { key: "admin",     href: "/broker-ratebooks", title: "Broker Ratebooks", desc: "Export MotorComplete and manual broker ratebooks across commission tiers.", tone: "from-amber-500 to-orange-700" },
  { key: "admin",     href: "/admin",     title: "Admin",     desc: "Ratebooks, discounts, mappings and data.",       tone: "from-slate-700 to-slate-900" },
  { key: "admin",     href: "/admin/brokers", title: "Brokers", desc: "Add brokers and provision their users for the broker portal.", tone: "from-sky-600 to-indigo-700" },
  { key: "myScorecard", href: "/sales-leaderboard/me", title: "My Scorecard", desc: "Your rank, your badges, your numbers, month and year to date.", tone: "from-rose-500 to-pink-600" },
  { key: "leaderboard", href: "/sales-leaderboard", title: "Pole Position", desc: "Who's leading the pack on orders, deliveries, insurance, conversion and response time.", tone: "from-pink-500 to-rose-600" },
];

export const dynamic = "force-dynamic";

export default async function Home() {
  // Only the user check blocks the shell. The alerts / delivered queries
  // run inside <Suspense> so the tile grid paints the moment auth resolves
  // — perceived load time drops from "waiting on the slowest query" to
  // "waiting on the cookie lookup".
  const user = await requireUser();
  const access = sectionAccess(user);
  const visibleTiles = TILES.filter((t) => t.key === "everyone" || access[t.key]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 text-sm sm:px-6">
          <span className="font-semibold tracking-tight text-slate-900">TrustFord Leasing</span>
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-[13px] font-medium text-slate-800">{user.name}</div>
              <div className="text-[11.5px] text-slate-500">{user.roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ") || "No role"}</div>
            </div>
            <form action={signOutAction}>
              <button className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <PageTitle title={`Hello, ${user.name.split(" ")[0] || "there"}`}>Pick a section to get started.</PageTitle>

        {canSeeProposals(user) && (
          <form action="/search" className="relative -mt-2 mb-8">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input name="q" placeholder="Search customers, FP numbers, VINs, orders, models" aria-label="Search" className={`${INPUT} pl-10`} />
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTiles.map((t) => (
            <Link key={t.href} href={t.href} prefetch={true} className={`group relative flex flex-col overflow-hidden p-5 ${CARD_LINK}`}>
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.tone}`} />
              <div className="text-[16px] font-semibold tracking-tight text-slate-900">{t.title}</div>
              <p className="mt-1.5 flex-1 text-[13.5px] leading-5 text-slate-600">{t.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-[13px] font-medium text-slate-400 transition group-hover:text-slate-900">
                Open
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4"><path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
              </div>
            </Link>
          ))}
        </div>

        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData user={user} />
        </Suspense>
      </main>
    </div>
  );
}

async function DashboardData({ user }: { user: CurrentUser }) {
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
    <>
      {recentlyDelivered.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Just delivered <span className="font-normal text-slate-500">· last 7 days</span></h2>
          <ul className={`mt-3 divide-y divide-slate-100 overflow-hidden ${CARD}`}>
            {recentlyDelivered.map((d) => (
              <li key={d.proposalId}>
                <Link
                  href={`/orders/${d.proposalId}`}
                  className="flex items-center gap-3 px-5 py-3 text-[14px] transition hover:bg-slate-50"
                >
                  <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-emerald-50 px-2.5 text-[12px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    Delivered
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{d.customerName}</span>
                    <span className="text-slate-400"> · {d.model} {d.derivative}</span>
                  </span>
                  <span className="shrink-0 text-[12.5px] text-slate-500">
                    {new Date(d.deliveredAt).toLocaleDateString("en-GB", { timeZone: "Europe/London" })} · {d.execName ?? "No exec"}
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
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Needs attention</h2>
            <div className="text-[13px] font-medium">
              {danger.length > 0 && <span className="mr-3 text-rose-700">{danger.length} urgent</span>}
              {warn.length > 0 && <span className="text-amber-700">{warn.length} warning</span>}
            </div>
          </div>
          <ul className={`mt-3 divide-y divide-slate-100 overflow-hidden ${CARD}`}>
            {alerts.slice(0, 20).map((a) => {
              const tone =
                a.severity === "danger"
                  ? "bg-rose-50 text-rose-700 ring-rose-200"
                  : "bg-amber-50 text-amber-700 ring-amber-200";
              return (
                <li key={`${a.kind}-${a.proposalId}`}>
                  <Link
                    href={`/customers/${a.customerId}`}
                    className="flex items-center gap-3 px-5 py-3 text-[14px] transition hover:bg-slate-50"
                  >
                    <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium ring-1 ring-inset ${tone}`}>
                      {a.severity === "danger" ? "Urgent" : "Warning"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{a.customerName}</span>
                      <span className="text-slate-400"> · {a.model} {a.derivative}</span>
                      <div className="text-[13px] text-slate-600">{a.message}</div>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-slate-500">{a.execName ?? "No exec"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {alerts.length > 20 && (
            <div className="mt-2 text-right text-[13px] text-slate-500">{`${alerts.length - 20} more`}</div>
          )}
        </section>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-10 animate-pulse">
      <div className="h-5 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-32 rounded-2xl bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06)]" />
    </div>
  );
}
