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
      <h1 className="font-semibold text-slate-900 text-[28px] leading-tight tracking-tight sm:text-[34px]">Commissions</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">Commission paid to TF by each funder, per contract + maintenance. Edit and tab away to save.</p>
      <div className="mt-6">
        <CommissionsGrid funders={fs} rows={cs} />
      </div>
    </div>
  );
}
