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
  const lastChecked = prices.reduce<string | null>((a, p) => (!a || p.checkedAt > a ? p.checkedAt : a), null);
  const checked = lastChecked
    ? new Date(lastChecked).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 text-sm sm:px-6">
          <Link href="/" className="flex items-center gap-1.5 font-medium text-slate-500 transition hover:text-slate-900">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Home
          </Link>
          {isAdmin(user) && (
            <Link href="/fuel-calculator/admin" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">
              Vehicles and prices
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="mb-7 sm:mb-8">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[34px]">Fuel Cost Calculator</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">
            What the customer spends on petrol or diesel today, against charging an electric car or van. Official efficiency figures on
            both sides and today&apos;s UK average prices, so it&apos;s like for like.
          </p>
          {checked && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12.5px] text-slate-600 ring-1 ring-inset ring-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              UK average prices, checked daily. Last checked {checked}
            </p>
          )}
        </div>
        <FuelCalculator prices={prices} vehicles={vehicles} preparedBy={user.name} canManage={isAdmin(user)} />
      </main>
    </div>
  );
}
