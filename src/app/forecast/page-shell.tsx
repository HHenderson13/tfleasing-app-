"use client";
import Link from "next/link";
export { monthLabel } from "./pickers";

// Shared chrome for every /forecast/* sub-page. Takes a custom picker
// (month, quarter, or none) as a prop so each sub-route can show the
// right control without conditional logic here.

export function ForecastPageHeader({
  title,
  description,
  picker,
}: {
  title: string;
  description: string;
  picker?: React.ReactNode;
}) {
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
          {picker && <div className="flex flex-wrap items-center gap-3">{picker}</div>}
        </div>
      </div>
    </div>
  );
}
