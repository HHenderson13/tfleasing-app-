import Link from "next/link";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { ratebook, vehicles, funders } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { signOutAction } from "../login/actions";
import { COMMISSION_TIERS, IRM_OUTPUT } from "@/lib/broker-ratebooks";
import { BrokerRatebooksClient } from "./client";
import { InterestRatesSection } from "./interest-rates";
import { loadFunderRateSnapshots } from "./actions";

export const dynamic = "force-dynamic";

// Ratebook data only changes when an admin uploads a new ratebook file or
// edits interest rates — neither happens on the request path. Cache the
// expensive aggregate queries with a tag, and invalidate from the action
// handlers (tag is defined in src/lib/cache-tags.ts so server actions can
// import it without pulling in this page file).
import { RATEBOOK_CACHE_TAG } from "@/lib/cache-tags";

const loadSlotsAggregate = unstable_cache(
  async () => db.all<{ slots: number; capCodes: number; rentals: number }>(sql`
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
  ["broker-ratebooks-slots"],
  { tags: [RATEBOOK_CACHE_TAG], revalidate: 3600 },
);

const loadFunderCounts = unstable_cache(
  async () => db
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
  ["broker-ratebooks-funder-counts"],
  { tags: [RATEBOOK_CACHE_TAG], revalidate: 3600 },
);

export default async function BrokerRatebooksPage() {
  const user = await requireAdmin();

  const [slotsRow, funderCounts, rateSnapshots] = await Promise.all([
    loadSlotsAggregate(),
    loadFunderCounts(),
    loadFunderRateSnapshots(),
  ]);

  const summary = slotsRow[0] ?? { slots: 0, capCodes: 0, rentals: 0 };
  const sortedFunders = [...funderCounts].sort((a, b) => Number(b.rentals) - Number(a.rentals));
  const totalRentals = sortedFunders.reduce((s, f) => s + Number(f.rentals), 0);
  const maxRentals = Math.max(1, ...sortedFunders.map((f) => Number(f.rentals)));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-sm">
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

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero card with the same amber/orange accent as the homepage tile */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-700" />
          <div className="px-7 pt-7 pb-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Admin · Exports</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Broker Ratebooks</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Best rental per slot across all four funders, expanded to {IRM_OUTPUT.join(", ")}× upfronts,
              with one file per commission tier (£{COMMISSION_TIERS.join(", £")}). Commission is amortised
              on top with interest at the funder-specific rate solved below.
            </p>
          </div>
          {/* Inline stat pills — denser than three separate cards */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/60">
            <Pill label="Vehicles (CAP codes)" value={summary.capCodes.toLocaleString()} />
            <Pill label="Source slots @ 6× upfront" value={summary.slots.toLocaleString()} />
            <Pill label="Source funder rates" value={summary.rentals.toLocaleString()} />
          </div>
        </section>

        {/* Downloads — primary action, gradient-accented cards */}
        <section className="mt-8">
          <SectionHeader title="Export" subtitle="Generate the broker ratebook files. Each tier is a separate CSV / sheet." />
          <BrokerRatebooksClient commissionTiers={[...COMMISSION_TIERS]} />
        </section>

        {/* Interest rates — the rates that power the export above */}
        <section className="mt-10">
          <SectionHeader
            title="Interest rates"
            subtitle="Back-solve each funder's rate from a 1+ vs 12+ rental pair on the same vehicle — saved rates feed straight into the export above."
          />
          <InterestRatesSection snapshots={rateSnapshots} />
        </section>

        {/* Source coverage — horizontal bar viz instead of plain rows */}
        <section className="mt-10">
          <SectionHeader title="Source coverage" subtitle="Funder rate counts feeding the export (6× upfront, BCH)." />
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ul className="space-y-3">
              {sortedFunders.map((f) => {
                const n = Number(f.rentals);
                const pct = totalRentals === 0 ? 0 : (n / totalRentals) * 100;
                const widthPct = (n / maxRentals) * 100;
                return (
                  <li key={f.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-slate-800">{f.name}</span>
                      <span className="font-mono text-xs text-slate-500">
                        {n.toLocaleString()}{" "}
                        <span className="text-slate-400">· {pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-600"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Methodology — compact footnote */}
        <section className="mt-10 mb-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 text-xs text-slate-600">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Methodology</h3>
          <p className="mt-2">
            Source ratebooks carry the 6× upfront. Other upfronts hold total contract cost constant
            for the bare lease; commission is amortised on top with annuity-due interest at the
            (funder, term) rate solved above.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700">
{`followOns      = term − 1                                  (24m → 23, 36m → 35, 48m → 47)
totalCost      = (6 + followOns) × rental@6×
bareRental@N×  = totalCost / (N + followOns)
commissionPmt  = pmtDue(annualRate / 12, N + followOns, commission)
rental@N×      = bareRental@N× + commissionPmt`}
          </pre>
          <p className="mt-2">
            Higher upfront → more payments share the financed commission → smaller per-month addition.
            The £0 commission tier collapses to the flat-split base.
          </p>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="hidden text-xs text-slate-500 sm:block">{subtitle}</p>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
