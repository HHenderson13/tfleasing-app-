import Link from "next/link";
import { requireBrokerUser } from "@/lib/auth-guard";
import { isBrokerOwner } from "@/lib/broker-auth";
import { brokerSignOutAction } from "./login/actions";

export const dynamic = "force-dynamic";

// Phase 1 landing — placeholder tiles for the four broker journeys.
// Phases 2-5 will wire each one to a real page.
const TILES = [
  { key: "new-car",      title: "Search a New Car",       desc: "Find a passenger vehicle from current stock.",           href: "/broker/search/new-car",      tone: "from-sky-500 to-sky-700" },
  { key: "new-van",      title: "Search a New Van",       desc: "Find a commercial vehicle from current stock.",          href: "/broker/search/new-van",      tone: "from-emerald-500 to-emerald-700" },
  { key: "pre-reg-van",  title: "Search Pre-Registered Vans", desc: "Pre-registered CV stock.",                            href: "/broker/search/pre-reg-vans", tone: "from-amber-500 to-amber-700" },
  { key: "saved",        title: "Saved Quotes",           desc: "Quotes you've saved (and your team's, where shared).",   href: "/broker/quotes",              tone: "from-violet-500 to-violet-700" },
] as const;

export default async function BrokerLandingPage() {
  const me = await requireBrokerUser();
  const owner = isBrokerOwner(me);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-slate-900">{me.brokerName}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Broker portal</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="text-right">
              <div className="font-medium text-slate-700">{me.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{me.role}</div>
            </div>
            {owner && (
              <Link href="/broker/users" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Manage users
              </Link>
            )}
            <form action={brokerSignOutAction}>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Quote a vehicle</h1>
        <p className="mt-1 text-sm text-slate-500">Pick a starting point.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {TILES.map((t) => (
            <Link
              key={t.key}
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

        <p className="mt-10 text-xs text-slate-400">
          Search and quoting pages will activate as the broker portal rolls out — this landing is live now so you can sign in and verify access. Any feedback during the rollout, send to your TrustFord contact.
        </p>
      </main>
    </div>
  );
}
