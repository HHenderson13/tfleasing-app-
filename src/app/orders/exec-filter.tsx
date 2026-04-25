"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function ExecFilter({
  execs,
  value,
}: {
  execs: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(next: string) {
    const qs = new URLSearchParams(params.toString());
    if (next === "all") qs.delete("exec");
    else qs.set("exec", next);
    const s = qs.toString();
    router.push(s ? `/orders?${s}` : "/orders");
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <span className="font-medium uppercase tracking-wide">Sales exec</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
      >
        <option value="all">All</option>
        {execs.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </label>
  );
}
