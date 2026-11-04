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
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
      {ORDER.map((o) => (
        <button
          key={o.key}
          onClick={() => set(o.key)}
          className={`h-8 rounded-lg px-3 text-[13px] font-medium transition ${
            value === o.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
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
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
      {SOURCES.map((o) => (
        <button
          key={o.key}
          onClick={() => set(o.key)}
          className={`h-8 rounded-lg px-3 text-[13px] font-medium transition ${
            value === o.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
