import Link from "next/link";
import { requireBrokerUser } from "@/lib/auth-guard";
import { BrokerHeader } from "./header";

export const dynamic = "force-dynamic";

const TILES = [
  { key: "new-car",      title: "Search a New Car",       desc: "Find a passenger vehicle from current stock.",           href: "/broker/search/new-car",      tone: "from-sky-500 to-sky-700" },
  { key: "new-van",      title: "Search a New Van",       desc: "Find a commercial vehicle from current stock.",          href: "/broker/search/new-van",      tone: "from-emerald-500 to-emerald-700" },
  { key: "pre-reg-van",  title: "Search Pre-Registered Vans", desc: "Pre-registered CV stock.",                            href: "/broker/search/pre-reg-vans", tone: "from-amber-500 to-amber-700" },
  { key: "saved",        title: "Saved Quotes",           desc: "Quotes you and your team have saved.",                   href: "/broker/quotes",              tone: "from-violet-500 to-violet-700" },
] as const;

export default async function BrokerLandingPage() {
  const me = await requireBrokerUser();
  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker" />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Quote a vehicle</h1>
        <p className="mt-1 text-sm text-slate-500">Pick a starting point.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
      </main>
    </div>
  );
}
