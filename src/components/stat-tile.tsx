import Link from "next/link";

// Shared stat tile used on /orders, /orders/awaiting, /orders/delivered, /proposals.
// Supports either a static card or a clickable filter pill (when href is set).
// Pages that need a status→tone mapping (e.g. proposals) do the mapping locally
// and pass the right tone here.

export type StatTone =
  | "slate"
  | "sky"
  | "amber"
  | "emerald"
  | "teal"
  | "violet"
  | "red"
  | "rose"
  | "orange"
  | "fuchsia"
  | "indigo";

// The site's stat card (components/ui.tsx, the Customer Profiles look): white,
// a plain label, a big number. The tone is a small dot by the label, so a page
// of tiles reads as one set rather than a row of different colours.
const DOT: Record<StatTone, string> = {
  slate: "bg-slate-400", sky: "bg-sky-500", amber: "bg-amber-500", emerald: "bg-emerald-500", teal: "bg-teal-500", violet: "bg-violet-500",
  red: "bg-red-500", rose: "bg-rose-500", orange: "bg-orange-500", fuchsia: "bg-fuchsia-500", indigo: "bg-indigo-500",
};

export function StatTile({
  label,
  value,
  tone,
  href,
  active,
}: {
  label: string;
  value: number | string;
  tone: StatTone;
  href?: string;
  active?: boolean;
}) {
  const ring = active
    ? "shadow-[0_0_0_2px_rgba(15,23,42,0.9)]"
    : "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]";
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium leading-4 text-slate-600">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
        <span className="min-w-0">{label}</span>
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">{value}</div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`block rounded-2xl bg-white px-4 py-3.5 transition hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.18)] ${ring}`}>
        {inner}
      </Link>
    );
  }
  return <div className={`rounded-2xl bg-white px-4 py-3.5 ${ring}`}>{inner}</div>;
}
