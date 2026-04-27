"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { RangeKey, SourceKey } from "@/lib/reports";

const ORDER: { key: RangeKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "half", label: "Last 6 months" },
  { key: "ytd", label: "Year to date" },
  { key: "year", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

const SOURCES: { key: SourceKey; label: string }[] = [
  { key: "all", label: "All sources" },
  { key: "retail", label: "Retail" },
  { key: "broker", label: "Broker" },
  { key: "bq", label: "Group BQ" },
];

export function RangePicker({ value }: { value: RangeKey }) {
  const router = useRouter();
  const params = useSearchParams();
  function set(k: RangeKey) {
    const qs = new URLSearchParams(params.toString());
    if (k === "month") qs.delete("range"); else qs.set("range", k);
    qs.delete("drill"); qs.delete("id"); qs.delete("label");
    const s = qs.toString();
    router.push(s ? `/reports?${s}` : "/reports");
  }
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {ORDER.map((o) => (
        <button
          key={o.key}
          onClick={() => set(o.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            value === o.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SourceFilter({ value }: { value: SourceKey }) {
  const router = useRouter();
  const params = useSearchParams();
  function set(k: SourceKey) {
    const qs = new URLSearchParams(params.toString());
    if (k === "all") qs.delete("source"); else qs.set("source", k);
    qs.delete("drill"); qs.delete("id"); qs.delete("label");
    const s = qs.toString();
    router.push(s ? `/reports?${s}` : "/reports");
  }
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {SOURCES.map((o) => (
        <button
          key={o.key}
          onClick={() => set(o.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            value === o.key ? "bg-rose-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
