import { db } from "@/db";
import { funderCommission } from "@/db/schema";
import { CommissionsGrid } from "./grid";
import { cachedFundersOrdered } from "@/lib/funder-lookup";

export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  const [fs, cs] = await Promise.all([
    cachedFundersOrdered(),
    db.select().from(funderCommission),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Commissions</h1>
      <p className="mt-1 text-sm text-slate-500">Commission paid to TF by each funder, per contract + maintenance. Edit and tab away to save.</p>
      <div className="mt-6">
        <CommissionsGrid funders={fs} rows={cs} />
      </div>
    </div>
  );
}
