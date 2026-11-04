"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProposalStatus } from "@/lib/proposal-constants";

export type RangeKey = "month" | "last" | "3m" | "6m" | "ytd" | "all";
export const RANGE_LABELS: Record<RangeKey, string> = {
  month: "This month",
  last: "Last month",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  ytd: "Year to date",
  all: "All time",
};

export function ProposalsFilter({
  execs,
  execValue,
  status,
  range,
  query,
}: {
  execs: { id: string; name: string }[];
  execValue: string;
  status: ProposalStatus | null;
  range: RangeKey;
  query: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(query);

  useEffect(() => { setQ(query); }, [query]);

  function push(next: URLSearchParams) {
    const s = next.toString();
    router.push(s ? `/proposals?${s}` : "/proposals");
  }

  function updateParam(key: string, value: string | null) {
    const qs = new URLSearchParams(params.toString());
    if (value === null || value === "") qs.delete(key);
    else qs.set(key, value);
    if (status) qs.set("status", status);
    push(qs);
  }

  function onSubmitQuery(e: React.FormEvent) {
    e.preventDefault();
    updateParam("q", q.trim() || null);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <form onSubmit={onSubmitQuery} className="flex items-center gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          <span className="font-medium text-[12.5px]">Search customer</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name…"
            className="w-48 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10"
          />
        </label>
      </form>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        <span className="font-medium text-[12.5px]">Range</span>
        <select
          value={range}
          onChange={(e) => updateParam("range", e.target.value === "month" ? null : e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10"
        >
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((r) => (
            <option key={r} value={r}>{RANGE_LABELS[r]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        <span className="font-medium text-[12.5px]">Sales exec</span>
        <select
          value={execValue}
          onChange={(e) => updateParam("exec", e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10"
        >
          <option value="all">All</option>
          {execs.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
