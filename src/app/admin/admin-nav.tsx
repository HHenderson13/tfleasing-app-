"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/sales-execs", label: "Sales execs" },
  { href: "/admin/group-sites", label: "Group sites" },
  { href: "/admin/order-checks", label: "Order checks" },
  { href: "/admin/commissions", label: "Commissions" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/ratebooks", label: "Ratebooks" },
  { href: "/admin/stock", label: "Stock upload" },
  { href: "/admin/stock-mappings", label: "Stock mappings" },
  { href: "/admin/pre-reg", label: "Pre-registered" },
  { href: "/admin/brokers", label: "Brokers" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
      {NAV.map((n) => {
        const isActive = n.exact
          ? pathname === n.href
          : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex h-8 shrink-0 items-center rounded-lg px-3 text-[13px] font-medium transition ${
              isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
