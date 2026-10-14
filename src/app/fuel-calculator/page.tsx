import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { requireQuoteAccess } from "@/lib/auth-guard";
import { loadFuelPrices, loadFuelVehicles } from "@/lib/fuel-prices";
import { FuelCalculator } from "./calculator";

export const dynamic = "force-dynamic";

export default async function FuelCalculatorPage() {
  // Anyone who quotes: it's a tool for the conversation with the customer.
  const user = await requireQuoteAccess();
  const [prices, vehicles] = await Promise.all([loadFuelPrices(), loadFuelVehicles()]);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-sm sm:px-6">
          <Link href="/" className="text-slate-500 hover:text-slate-900">← Home</Link>
          {isAdmin(user) && (
            <Link href="/fuel-calculator/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
              Vehicles &amp; prices
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fuel Cost Calculator</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          What the customer spends on petrol or diesel now, against charging an electric car or van — official efficiency
          figures and today&apos;s UK average prices, so it&apos;s like for like.
        </p>
        <FuelCalculator prices={prices} vehicles={vehicles} preparedBy={user.name} />
      </main>
    </div>
  );
}
