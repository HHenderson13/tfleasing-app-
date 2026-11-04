// The site's one look (user, 2026-11-04: "a unified look across the whole
// site, every section"), taken from the three pages it was agreed on: the Fuel
// Cost Calculator, the Ranger BIK Calculator and Customer Profiles.
//
//   • A white "‹ Home" bar across the top, actions on the right as outline pills.
//   • A 28 / 34px title with a plain-English line under it.
//   • White cards with a hairline outline and the faintest shadow.
//   • Dark rounded buttons, 44px inputs with a soft focus ring.
//   • Grey segmented switches for tabs and choices.
//
// Use these rather than restyling a page by hand, so the next page matches too.

import Link from "next/link";
import type { ReactNode } from "react";

export const CARD = "rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]";
/** A card that lifts a little on hover, for one that's a link. */
export const CARD_LINK = `${CARD} transition hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.14),0_10px_24px_-14px_rgba(15,23,42,0.35)]`;

export const BTN = {
  primary: "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300",
  secondary: "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[14px] font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
  /** Compact, for toolbars and table rows. */
  smallPrimary: "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-[13px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300",
  small: "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50",
  danger: "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 text-[13px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50",
};

export const INPUT =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition placeholder:text-slate-400 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[15px]";
export const LABEL = "mb-1.5 block text-[13px] font-medium text-slate-700";

const WIDTH = { "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl", "7xl": "max-w-7xl", wide: "max-w-[1440px]" } as const;
export type PageWidth = keyof typeof WIDTH;

const Chevron = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
    <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
  </svg>
);

/** The bar across the top: back on the left, the page's own links on the right. */
export function AppBar({ back = "/", backLabel = "Home", width = "6xl", children }: {
  back?: string; backLabel?: string; width?: PageWidth; children?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className={`mx-auto flex h-14 ${WIDTH[width]} items-center justify-between gap-3 px-4 text-sm sm:px-6`}>
        <Link href={back} className="flex shrink-0 items-center gap-1.5 font-medium text-slate-500 transition hover:text-slate-900">
          <Chevron />{backLabel}
        </Link>
        {children && <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{children}</div>}
      </div>
    </header>
  );
}

/** An outline pill for the right of the bar: "Saved comparisons", "Upload data". */
export function BarLink({ href, children, active }: { href: string; children: ReactNode; active?: boolean }) {
  return (
    <Link href={href}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition ${active ? "bg-slate-900 text-white ring-slate-900" : "text-slate-600 ring-slate-300 hover:bg-slate-50 hover:text-slate-900"}`}>
      {children}
    </Link>
  );
}

/** The page's title, the line under it, and anything that belongs beside it. */
export function PageTitle({ title, children, pill, actions, className = "" }: {
  title: ReactNode; children?: ReactNode; pill?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={`mb-7 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[34px]">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-slate-600">{children}</p>}
        {pill && <div className="mt-3">{pill}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A small status line in a white pill, with a coloured dot: "Last checked 4 Nov, 08:35". */
export function StatusPill({ tone = "emerald", children }: { tone?: "emerald" | "amber" | "rose" | "slate"; children: ReactNode }) {
  const dot = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", slate: "bg-slate-400" }[tone];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12.5px] text-slate-600 ring-1 ring-inset ring-slate-200">
      <span className={`h-2 w-2 rounded-full ${dot}`} />{children}
    </span>
  );
}

/** Background, bar and the page column, as every page has them. */
export function PageShell({ width = "6xl", back, backLabel, bar, children }: {
  width?: PageWidth; back?: string; backLabel?: string; bar?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppBar back={back} backLabel={backLabel} width={width}>{bar}</AppBar>
      <main className={`mx-auto ${WIDTH[width]} px-4 pb-16 pt-8 sm:px-6 sm:pt-10`}>{children}</main>
    </div>
  );
}

/** Tabs or a choice: the grey segmented switch. Links when given hrefs. */
export function Tabs<T extends string>({ items, value, onChange, size = "md", label }: {
  items: { key: T; label: ReactNode; href?: string; count?: number }[]; value: T; onChange?: (k: T) => void; size?: "md" | "sm"; label?: string;
}) {
  const h = size === "sm" ? "h-8 text-[13px]" : "h-9 text-[14px]";
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
      {items.map((it) => {
        const on = it.key === value;
        const cls = `flex ${h} items-center gap-2 whitespace-nowrap rounded-lg px-3.5 font-medium transition ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`;
        const inner = (
          <>
            {it.label}
            {it.count != null && <span className={`rounded-full px-1.5 text-[12px] tabular-nums ${on ? "bg-slate-100 text-slate-700" : "text-slate-500"}`}>{it.count}</span>}
          </>
        );
        return it.href
          ? <Link key={it.key} href={it.href} role="tab" aria-selected={on} className={cls}>{inner}</Link>
          : <button key={it.key} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(it.key)} className={cls}>{inner}</button>;
      })}
    </div>
  );
}

/** A card's own heading row. */
export function CardTitle({ title, hint, aside }: { title: ReactNode; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold leading-6 tracking-tight text-slate-900">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{hint}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/** What a page shows while it loads: the same bar, title and column, so nothing jumps when it arrives. */
export function PageSkeleton({ width = "6xl", blocks = ["h-32", "h-96"] }: { width?: PageWidth; blocks?: string[] }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-14 border-b border-slate-200/80 bg-white/80" />
      <main className={`mx-auto ${WIDTH[width]} animate-pulse px-4 pb-16 pt-8 sm:px-6 sm:pt-10`}>
        <div className="h-10 w-48 rounded-lg bg-slate-200/80" />
        <div className="mt-3 h-5 w-96 max-w-full rounded bg-slate-200/60" />
        {blocks.map((h, i) => <div key={i} className={`mt-6 ${h} rounded-2xl bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06)]`} />)}
      </main>
    </div>
  );
}
