import Link from "next/link";
import { STATUS_LABELS, statusColor, statusLabel } from "@/lib/proposal-constants";

export type OutstandingAction = { id: string; label: string; tone: "violet" | "sky" | "amber" | "emerald" | "red" | "slate" };

const CHIP: Record<OutstandingAction["tone"], string> = {
  violet:  "bg-violet-50 text-violet-700 ring-violet-200",
  sky:     "bg-sky-50 text-sky-700 ring-sky-200",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red:     "bg-red-50 text-red-700 ring-red-200",
  slate:   "bg-slate-100 text-slate-700 ring-slate-200",
};

export function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasItems = arr.flat().filter(Boolean).length > 0;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3 space-y-2">
        {hasItems ? children : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">{empty}</div>
        )}
      </div>
    </section>
  );
}

export function OrderRow({
  id, customerId, customer, title, meta, status, actions, customCount, right,
}: {
  id: string;
  customerId: string;
  customer: string;
  title: string;
  meta: string;
  status: keyof typeof STATUS_LABELS;
  actions?: OutstandingAction[];
  customCount?: number;
  right: React.ReactNode;
}) {
  const c = statusColor(status);
  return (
    <div className="group relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <Link href={`/orders/${id}`} aria-label={`Open order for ${customer}`} className="absolute inset-0 z-0 rounded-2xl" />
      <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900 group-hover:underline">{customer}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.bg} ${c.text} ring-1 ${c.ring}`}>
            {statusLabel(status)}
          </span>
          {customerId && (
            <Link href={`/customers/${customerId}`} className="pointer-events-auto relative z-10 text-[11px] text-slate-400 hover:text-slate-700 hover:underline">
              timeline →
            </Link>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-700">{title}</div>
        <div className="text-[11px] text-slate-400">{meta}</div>
        {(actions && actions.length > 0) || (customCount && customCount > 0) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {actions?.map((a) => (
              <span key={a.id} className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${CHIP[a.tone]}`}>
                {a.label}
              </span>
            ))}
            {customCount && customCount > 0 ? (
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${CHIP.slate}`}>
                +{customCount} extra check{customCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="relative z-10">{right}</div>
    </div>
  );
}

export function CountdownBadge({ days }: { days: number | null }) {
  if (days === null) return <div className="text-[11px] text-slate-400">no countdown</div>;
  if (days < 0) return <div className="text-[11px] font-medium text-red-600">{Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} overdue</div>;
  if (days <= 7) return <div className="text-[11px] font-medium text-amber-600">{days} day{days === 1 ? "" : "s"} to sign</div>;
  return <div className="text-[11px] text-slate-500">{days} days to sign</div>;
}
