import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const [funders, commissions, discounts, rbRows, uploads, vehicles] = await Promise.all([
    db.all<{ c: number }>(sql`SELECT COUNT(*) c FROM funders`),
    db.all<{ c: number }>(sql`SELECT COUNT(*) c FROM funder_commission`),
    db.all<{ c: number }>(sql`SELECT COUNT(*) c FROM model_discounts`),
    db.all<{ c: number }>(sql`SELECT COUNT(*) c FROM ratebook`),
    db.all<{ c: number }>(sql`SELECT COUNT(*) c FROM ratebook_uploads`),
    db.all<{ c: number }>(sql`SELECT COUNT(*) c FROM vehicles`),
  ]);
  const stat = (arr: { c: number }[]) => arr[0]?.c ?? 0;

  const cards = [
    { title: "Funders", value: stat(funders), href: "/admin/commissions" },
    { title: "Commission entries", value: stat(commissions), href: "/admin/commissions" },
    { title: "Discount profiles", value: stat(discounts), href: "/admin/discounts" },
    { title: "Ratebook rows", value: stat(rbRows), href: "/admin/ratebooks" },
    { title: "Ratebook uploads", value: stat(uploads), href: "/admin/ratebooks" },
    { title: "Vehicles", value: stat(vehicles), href: "/admin/ratebooks" },
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
      <p className="mt-1 text-sm text-slate-500">Reference data that drives the quote tool.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.title} href={c.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300">
            <div className="text-xs uppercase tracking-wide text-slate-500">{c.title}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{c.value.toLocaleString()}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
