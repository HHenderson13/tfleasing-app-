import Link from "next/link";
import { TopNav } from "@/components/top-nav";

const TILES = [
  { href: "/quote", title: "Quote", desc: "Rank funders for a vehicle, term and mileage." },
  { href: "/proposals", title: "Proposals", desc: "Live proposals — accept, decline, refer." },
  { href: "/orders", title: "Orders", desc: "Accepted deals moving through to delivery." },
  { href: "/admin", title: "Admin", desc: "Ratebooks, discounts, sales execs and data." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">TF Leasing</h1>
        <p className="mt-1 text-sm text-slate-500">Pick a section to get started.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
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
