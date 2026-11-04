"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function ExecFilter({
  execs,
  value,
}: {
  execs: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function onChange(next: string) {
    const qs = new URLSearchParams(params.toString());
    qs.set("exec", next);
    const s = qs.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="font-medium text-[12.5px]">Sales exec</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10"
      >
        <option value="all">All</option>
        {execs.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </label>
  );
}
