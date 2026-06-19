"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Shared chrome for every /forecast/* sub-page. Provides:
//   - back link to the hub
//   - title + description
//   - inline month picker (URL-bound) so the active month state is shared
//     with the server via ?month=YYYY-MM
//   - right-hand slot for extra controls (department filter etc.)
//
// Kept as a client component because the month picker is interactive; the
// surrounding page.tsx routes are server components that pass `months` in.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return yyyymm;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function ForecastPageHeader({
  title,
  description,
  month,
  showMonthPicker = true,
  rightSlot,
}: {
  title: string;
  description: string;
  month: string;
  showMonthPicker?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function selectMonth(m: string) {
    start(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("month", m);
      router.push(url.pathname + "?" + url.searchParams.toString());
    });
  }

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <Link href="/forecast" className="text-xs font-medium text-slate-500 hover:text-slate-700">
          ← Forecast hub
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {showMonthPicker && (
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                <span className="text-slate-400">Month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && selectMonth(e.target.value)}
                  disabled={pending}
                  className="rounded border-0 bg-transparent px-1 py-0.5 text-sm font-semibold tabular-nums text-slate-900 focus:outline-none disabled:opacity-50"
                />
              </label>
            )}
            {rightSlot}
          </div>
        </div>
      </div>
    </div>
  );
}
