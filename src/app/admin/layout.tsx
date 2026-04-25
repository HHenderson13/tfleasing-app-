import Link from "next/link";
import type { ReactNode } from "react";
import { TopNav } from "@/components/top-nav";

const NAV = [
  { href: "/admin", label: "Overview" },
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="admin" />
      <div className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-t-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
