import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { loadFuelPrices, loadFuelVehicles } from "@/lib/fuel-prices";
import { FuelAdmin } from "./fuel-admin";

export const dynamic = "force-dynamic";

export default async function FuelCalculatorAdminPage() {
  await requireAdmin();
  const [prices, vehicles] = await Promise.all([loadFuelPrices(), loadFuelVehicles()]);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/fuel-calculator" className="font-medium text-slate-500 transition hover:text-slate-900">← Fuel Cost Calculator</Link>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Admin</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vehicles and prices</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Prices are checked against their sources every morning and kept to the latest each one publishes. Set your own figure
          for any of them if you need to, and it wins until you clear it. The vehicle list is what the calculator&apos;s drop-downs offer.
        </p>
        <FuelAdmin prices={prices} vehicles={vehicles} />
      </main>
    </div>
  );
}
