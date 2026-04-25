import Link from "next/link";

const LINKS = [
  { href: "/quote", label: "Quote" },
  { href: "/stock", label: "Stock" },
  { href: "/proposals", label: "Proposals" },
  { href: "/orders", label: "Orders" },
  { href: "/admin", label: "Admin" },
];

export function TopNav({ active }: { active?: "quote" | "stock" | "proposals" | "orders" | "admin" }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm font-semibold text-slate-900">TF Leasing</Link>
        <nav className="flex gap-1">
          {LINKS.map((l) => {
            const isActive = active && l.href.endsWith(active);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
