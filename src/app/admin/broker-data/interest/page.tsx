import Link from "next/link";
import { listInterestRates } from "@/lib/broker-interest-rates";
import { AddInterestRateForm, InterestRatesTable } from "./forms";

export const dynamic = "force-dynamic";

export default async function InterestRatesPage() {
  const rows = await listInterestRates();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/broker-data" className="text-xs text-slate-500 hover:text-slate-900">← Broker data</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Interest + deposit grids</h1>
        <p className="mt-1 text-sm text-slate-500">
          One row per tariff cell — vehicle scope × customer type × funding route × term. The Phase 5
          quote engine looks up the best match by specificity (exact bucket beats class match beats
          &lsquo;all&rsquo;), so you can layer narrow programmes on top of a baseline.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a row</h2>
        <AddInterestRateForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
        </h2>
        <InterestRatesTable
          rows={rows.map((r) => ({
            id: r.id,
            label: r.label,
            vehicleClass: r.vehicleClass as "car" | "van" | "all",
            bucket: r.bucket,
            customerType: r.customerType as "retail" | "business",
            fundingRoute: r.fundingRoute as "pcp" | "hp" | "hp_balloon",
            termMonths: r.termMonths,
            annualAprPct: r.annualAprPct,
            depositAllowanceGbp: r.depositAllowanceGbp,
            validFrom: r.validFrom ? r.validFrom.toISOString() : null,
            validUntil: r.validUntil ? r.validUntil.toISOString() : null,
            notes: r.notes,
            active: r.active,
          }))}
        />
      </section>
    </div>
  );
}
