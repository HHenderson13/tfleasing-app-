"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSalesExecAction } from "@/app/proposals/actions";

export function SalesExecPicker({
  proposalId,
  execs,
  currentId,
}: {
  proposalId: string;
  execs: { id: string; name: string }[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentId ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onChange(next: string) {
    setErr(null);
    setValue(next);
    start(async () => {
      const res = await updateSalesExecAction(proposalId, next || null);
      if (!res.ok) {
        setErr(res.error);
        setValue(currentId ?? "");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-slate-400 focus:outline-none disabled:opacity-60"
      >
        <option value="">— Unassigned —</option>
        {execs.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
