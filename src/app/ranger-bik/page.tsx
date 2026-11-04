import Link from "next/link";
import { requireUser } from "@/lib/auth-guard";
import { ratesFor } from "@/lib/ranger-tax";
import { rangerPrefillOf } from "@/lib/customer-profiles";
import { getProfile } from "@/lib/customer-profiles-store";
import { RangerCalculator } from "./calculator";

export const dynamic = "force-dynamic";

export default async function RangerBikPage({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  // Every signed-in user, like the Fuel Cost Calculator: it's for the conversation with the customer.
  const user = await requireUser();
  // Today in the UK, so the tax year is the one the customer is in (and server and browser agree).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const { rates, current } = ratesFor(today);
  // Opened from a Customer Profile: start from their Ranger and tax details.
  const pid = String((await searchParams).profile ?? "");
  const p = /^[0-9a-f-]{36}$/.test(pid) ? await getProfile(pid) : null;
  const profile = p ? { id: p.id, name: p.customerName, prefill: rangerPrefillOf(p) } : null;
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
          <Link href="/ranger-bik/exports" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">
            Saved comparisons
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="mb-7 sm:mb-8">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[34px]">Ranger BIK Calculator</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">
            Every Ranger side by side, taxed as a car or a van: the driver&apos;s benefit in kind and fuel card, the employer&apos;s NI
            and corporation tax. The 5-seat has been a car since April 2025; the 2-Seat is still a van.
          </p>
          <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] ring-1 ring-inset ${current ? "bg-white text-slate-600 ring-slate-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
            <span className={`h-2 w-2 rounded-full ${current ? "bg-emerald-500" : "bg-amber-500"}`} />
            {current
              ? `HMRC rates for the ${rates.label} tax year. Ford price lists effective 5 February 2026`
              : `Showing ${rates.label} rates: this tax year's rates haven't been added yet`}
          </p>
        </div>
        <RangerCalculator key={profile?.id ?? "blank"} preparedBy={user.name} today={today} profile={profile} />
      </main>
    </div>
  );
}
