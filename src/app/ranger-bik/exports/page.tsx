import Link from "next/link";
import { requireUser } from "@/lib/auth-guard";
import { listRangerExports } from "@/lib/ranger-exports";

export const dynamic = "force-dynamic";

// Every exported Ranger comparison, newest first; the search narrows by
// customer, exec or vehicle.
export default async function RangerExportsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = String((await searchParams).q ?? "").slice(0, 100);
  const rows = await listRangerExports(q);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 text-sm sm:px-6">
          <Link href="/ranger-bik" className="font-medium text-slate-500 transition hover:text-slate-900">← Ranger BIK Calculator</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Saved comparisons</h1>
        <p className="mt-1.5 text-[15px] text-slate-600">Every PDF exported from the Ranger BIK Calculator, newest first.</p>
        <form className="mt-6 flex gap-2" action="/ranger-bik/exports">
          <input name="q" defaultValue={q} placeholder="Search customer, exec or Ranger" aria-label="Search saved comparisons"
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[15px]" />
          <button className="h-11 rounded-xl bg-slate-900 px-5 text-[14px] font-semibold text-white hover:bg-slate-800">Search</button>
          {q && <Link href="/ranger-bik/exports" className="flex h-11 items-center rounded-xl px-3 text-[14px] font-medium text-slate-600 hover:text-slate-900">Clear</Link>}
        </form>
        <p className="mt-3 text-[13px] text-slate-500">{q ? `${rows.length} found for “${q}”` : `${rows.length} most recent`}</p>
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
          {rows.length === 0 && <li className="px-5 py-8 text-center text-[14px] text-slate-500">{q ? "Nothing matches that search." : "No comparisons exported yet."}</li>}
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-slate-900">{r.customerName || "No customer name"}</div>
                <div className="mt-0.5 text-[13px] text-slate-600 [overflow-wrap:anywhere]">{r.vehicles.split(", ").join(" against ")}</div>
                <div className="mt-0.5 text-[12.5px] text-slate-500">{when(r.createdAt)} · {r.execName}</div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {r.bestName && r.savingAnnual != null && r.savingAnnual > 0 && (
                  <span className="text-right text-[14px] font-semibold tabular-nums text-emerald-700">
                    {r.bestName} saves £{Math.round(r.savingAnnual).toLocaleString("en-GB")} a year
                    {r.savingMonthly != null && <>, £{Math.round(r.savingMonthly).toLocaleString("en-GB")} a month</>}
                  </span>
                )}
                <a href={`/ranger-bik/exports/${r.id}`} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Open PDF</a>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
