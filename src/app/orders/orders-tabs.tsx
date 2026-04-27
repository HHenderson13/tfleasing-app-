"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function OrdersTabs({ actionsCount, deliveryCount }: { actionsCount: number; deliveryCount: number }) {
  const pathname = usePathname();
  const TABS = [
    { href: "/orders",          label: "Awaiting actions",  count: actionsCount,  match: pathname === "/orders" },
    { href: "/orders/awaiting", label: "Awaiting delivery", count: deliveryCount, match: pathname.startsWith("/orders/awaiting") },
  ];
  return (
    <nav className="mt-6 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition ${
            t.match ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {t.label}
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            t.match ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
          }`}>{t.count}</span>
        </Link>
      ))}
    </nav>
  );
}
