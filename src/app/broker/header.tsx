import Link from "next/link";
import { brokerSignOutAction } from "./login/actions";
import type { CurrentBrokerUser } from "@/lib/broker-auth";

const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/broker/search/new-car",      label: "New cars",       match: (p) => p.startsWith("/broker/search/new-car") },
  { href: "/broker/search/new-van",      label: "New vans",       match: (p) => p.startsWith("/broker/search/new-van") },
  { href: "/broker/search/pre-reg-vans", label: "Pre-reg vans",   match: (p) => p.startsWith("/broker/search/pre-reg-vans") },
  { href: "/broker/quotes",              label: "Saved quotes",   match: (p) => p.startsWith("/broker/quotes") },
];

// Active state can't use usePathname() here because this is a server
// component embedded in server pages — we pass the current path in
// explicitly. That keeps each broker page from needing a "use client"
// header just for tab styling.
export function BrokerHeader({ me, pathname }: { me: CurrentBrokerUser; pathname: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-sm sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/broker" className="text-base font-semibold text-slate-900">{me.brokerName}</Link>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Broker portal</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="text-right hidden sm:block">
            <div className="font-medium text-slate-700">{me.name}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{me.role}</div>
          </div>
          {me.role === "owner" && (
            <Link href="/broker/users" className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
              Team
            </Link>
          )}
          <form action={brokerSignOutAction}>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <nav className="mx-auto -mb-px flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
                active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
