"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Two-tab selector for /orders/awaiting. Tab state lives in the ?view=
// query param so refresh and shared URLs keep the current view. Keeping
// it client-side avoids a server round-trip per tab toggle — the tracker
// and calendar payloads come down on the initial render together.
export type AwaitingView = "tracker" | "calendar";

export function ViewTabs({ active }: { active: AwaitingView }) {
  const pathname = usePathname();
  const params = useSearchParams();
  function hrefFor(view: AwaitingView) {
    const sp = new URLSearchParams(params.toString());
    if (view === "tracker") sp.delete("view");
    else sp.set("view", view);
    const q = sp.toString();
    return q ? `${pathname}?${q}` : pathname;
  }
  return (
    <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
      <TabLink href={hrefFor("tracker")} active={active === "tracker"}>📋 Delivery tracker</TabLink>
      <TabLink href={hrefFor("calendar")} active={active === "calendar"}>📅 Calendar</TabLink>
    </nav>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-lg px-3 py-1.5 font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
