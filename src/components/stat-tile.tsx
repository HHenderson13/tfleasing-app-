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

const TONES: Record<StatTone, { bg: string; ring: string; text: string; num: string; activeRing: string }> = {
  slate:   { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-600",   num: "text-slate-900",   activeRing: "ring-slate-500" },
  sky:     { bg: "bg-sky-50",     ring: "ring-sky-200",     text: "text-sky-700",     num: "text-sky-900",     activeRing: "ring-sky-500" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-700",   num: "text-amber-900",   activeRing: "ring-amber-500" },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", num: "text-emerald-900", activeRing: "ring-emerald-500" },
  teal:    { bg: "bg-teal-50",    ring: "ring-teal-200",    text: "text-teal-700",    num: "text-teal-900",    activeRing: "ring-teal-500" },
  violet:  { bg: "bg-violet-50",  ring: "ring-violet-200",  text: "text-violet-700",  num: "text-violet-900",  activeRing: "ring-violet-500" },
  red:     { bg: "bg-red-50",     ring: "ring-red-200",     text: "text-red-700",     num: "text-red-900",     activeRing: "ring-red-500" },
  rose:    { bg: "bg-rose-50",    ring: "ring-rose-200",    text: "text-rose-700",    num: "text-rose-900",    activeRing: "ring-rose-500" },
  orange:  { bg: "bg-orange-50",  ring: "ring-orange-200",  text: "text-orange-700",  num: "text-orange-900",  activeRing: "ring-orange-500" },
  fuchsia: { bg: "bg-fuchsia-50", ring: "ring-fuchsia-200", text: "text-fuchsia-700", num: "text-fuchsia-900", activeRing: "ring-fuchsia-500" },
  indigo:  { bg: "bg-indigo-50",  ring: "ring-indigo-200",  text: "text-indigo-700",  num: "text-indigo-900",  activeRing: "ring-indigo-500" },
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
  const t = TONES[tone];
  const ring = active ? `ring-2 ${t.activeRing}` : `ring-1 ${t.ring}`;
  const inner = (
    <>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.num}`}>{value}</div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`block rounded-2xl ${t.bg} px-4 py-3 ${ring} transition hover:brightness-[0.98]`}>
        {inner}
      </Link>
    );
  }
  return <div className={`rounded-2xl ${t.bg} px-4 py-3 ${ring}`}>{inner}</div>;
}
