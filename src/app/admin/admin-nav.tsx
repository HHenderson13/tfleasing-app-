"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/sales-execs", label: "Sales execs" },
  { href: "/admin/group-sites", label: "Group sites" },
  { href: "/admin/order-checks", label: "Order checks" },
  { href: "/admin/commissions", label: "Commissions" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/ratebooks", label: "Ratebooks" },
  { href: "/admin/stock", label: "Stock upload" },
  { href: "/admin/stock-mappings", label: "Stock mappings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 scrollbar-none">
      {NAV.map((n) => {
        const isActive = n.exact
          ? pathname === n.href
          : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "text-slate-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
