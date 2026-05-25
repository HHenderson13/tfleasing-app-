import Link from "next/link";
import { db } from "@/db";
import { ratebook, vehicles, funders } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { signOutAction } from "../login/actions";
import { COMMISSION_TIERS, IRM_OUTPUT } from "@/lib/broker-ratebooks";
import { BrokerRatebooksClient } from "./client";

export const dynamic = "force-dynamic";

export default async function BrokerRatebooksPage() {
  const user = await requireAdmin();

  // Lightweight summary so the page communicates what the export will contain
  // before the user pays the (multi-MB) download cost.
  const [slotsRow, funderCounts] = await Promise.all([
    db.all<{ slots: number; capCodes: number; rentals: number }>(sql`
      SELECT
        COUNT(DISTINCT r.cap_code || '|' || r.term_months || '|' || r.annual_mileage || '|' || r.is_maintained) AS slots,
        COUNT(DISTINCT r.cap_code) AS capCodes,
        COUNT(*) AS rentals
      FROM ratebook r
      INNER JOIN vehicles v ON v.cap_code = r.cap_code
      WHERE r.initial_rental_multiplier = 6
        AND r.is_business = 1
        AND v.model != 'Unknown'
    `),
    db
      .select({
        id: funders.id,
        name: funders.name,
        rentals: sql<number>`COUNT(${ratebook.funderId})`.as("rentals"),
      })
      .from(funders)
      .leftJoin(
        ratebook,
        sql`${ratebook.funderId} = ${funders.id}
          AND ${ratebook.initialRentalMultiplier} = 6
          AND ${ratebook.isBusiness} = 1`
      )
      .leftJoin(vehicles, eq(vehicles.capCode, ratebook.capCode))
      .where(sql`${vehicles.model} IS NULL OR ${vehicles.model} != 'Unknown'`)
      .groupBy(funders.id),
  ]);

  const summary = slotsRow[0] ?? { slots: 0, capCodes: 0, rentals: 0 };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/" className="text-slate-500 hover:text-slate-900">← Back to portal</Link>
          <div className="flex items-center gap-3">
            <span className="text-slate-700">{user.name}</span>
            <form action={signOutAction}>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Broker Ratebooks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate broker-facing ratebooks from our current funder rates — best
          rental per slot across all four funders, expanded to {IRM_OUTPUT.join(", ")}× upfronts,
          with four commission tiers per format.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Vehicles (CAP codes)" value={summary.capCodes.toLocaleString()} />
          <Stat label="Source slots @ 6× upfront" value={summary.slots.toLocaleString()} />
          <Stat label="Source funder rates" value={summary.rentals.toLocaleString()} />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Funder coverage</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {funderCounts.map((f) => (
              <li key={f.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{f.name}</span>
                <span className="text-slate-500">{Number(f.rentals).toLocaleString()} rates</span>
              </li>
            ))}
          </ul>
        </section>

        <BrokerRatebooksClient commissionTiers={[...COMMISSION_TIERS]} />

        <section className="mt-10 text-xs text-slate-500">
          <h3 className="font-semibold text-slate-700">How rentals are derived</h3>
          <p className="mt-2">
            Source ratebooks only carry the 6× upfront. Other upfronts are calculated
            by holding the total contract cost constant:
          </p>
          <pre className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
{`followOns      = term - 1   (24m → 23, 36m → 35, 48m → 47)
totalCost      = (6 + followOns) × rental@6×
rental@N×      = (totalCost + commission) / (N + followOns)`}
          </pre>
          <p className="mt-2">
            Commission is added as a flat spread across (N + followOns) payments.
            Interest-based amortisation will replace this once the interest model is wired in.
          </p>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
