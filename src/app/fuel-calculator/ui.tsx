"use client";

// The Fuel Cost Calculator's building blocks. One look for every control:
// 44px touch targets, 16px text in inputs on phones (anything smaller and iOS
// zooms the page on focus), one ink colour, one focus ring.

import { useId, type ReactNode } from "react";

export const INK = "#0f172a";
/** Petrol and diesel: amber. Electric and anything saved: emerald. */
export const FOSSIL = { fill: "#d97706", text: "#b45309", wash: "#fffbeb" };
export const ELECTRIC = { fill: "#059669", text: "#047857", wash: "#ecfdf5" };
/** Where an electric vehicle is charged. Always shown with its name beside it. */
export const CHARGE_COLOUR = { home_overnight: "#065f46", home_standard: "#34d399", depot: "#075985", public_rapid: "#8b5cf6" } as const;

const inputBase =
  "h-11 w-full rounded-xl border border-slate-300 bg-white text-base text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition placeholder:text-slate-400 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[15px]";

export function Step({ n, title, hint, aside, children }: { n: number; title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
      <header className="flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[12px] font-semibold tabular-nums text-white">{n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-6 tracking-tight text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{hint}</p>}
        </div>
        {aside && <div className="hidden shrink-0 pt-0.5 sm:block">{aside}</div>}
      </header>
      <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, action }: { label: ReactNode; hint?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-700">{label}</span>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] leading-5 text-slate-500">{hint}</p>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, label, inputMode, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label?: string; inputMode?: "numeric" | "decimal" | "text"; className?: string;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} inputMode={inputMode}
      className={`${inputBase} px-3.5 ${className}`} />
  );
}

/** A number with its unit inside the box: "200.04 p/litre". */
export function UnitInput({ value, onChange, unit, label, placeholder, edited, align = "right", className = "" }: {
  value: string; onChange: (v: string) => void; unit: string; label: string; placeholder?: string; edited?: boolean; align?: "left" | "right"; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input inputMode="decimal" value={value} placeholder={placeholder} aria-label={label}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className={`${inputBase} pl-3.5 font-medium tabular-nums ${align === "right" ? "text-right" : ""} ${edited ? "border-indigo-300 bg-indigo-50/40" : ""}`}
        style={{ paddingRight: `${unit.length * 0.5 + 1.4}rem` }} />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] text-slate-400">{unit}</span>
    </div>
  );
}

export function Select({ value, onChange, options, label, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}
        className={`${inputBase} appearance-none truncate pl-3.5 pr-10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${value ? "" : "text-slate-400"}`}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: {
  value: T; onChange: (v: T) => void; options: [T, ReactNode][]; label: string; size?: "md" | "sm";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-100 p-1">
      {options.map(([k, text]) => {
        const on = value === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onChange(k)}
            className={`${size === "sm" ? "h-8 text-[13px]" : "h-9 text-[14px]"} whitespace-nowrap rounded-lg px-2.5 font-medium transition ${on ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5" : "text-slate-600 hover:text-slate-900"}`}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`h-8 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition ${on ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:ring-slate-400"}`}>
      {children}
    </button>
  );
}

export function Tag({ tone = "slate", children }: { tone?: "slate" | "amber" | "emerald"; children: ReactNode }) {
  const c = { slate: "bg-slate-100 text-slate-700", amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200", emerald: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" }[tone];
  return <span className={`inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium ${c}`}>{children}</span>;
}

export function Note({ tone = "slate", children }: { tone?: "slate" | "amber"; children: ReactNode }) {
  return (
    <p className={`flex gap-2 rounded-xl px-3.5 py-2.5 text-[13px] leading-5 ${tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "amber" ? "text-amber-600" : "text-slate-400"}`}>
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="text-[13px] font-medium text-indigo-600 hover:text-indigo-800">{children}</button>;
}

/** The figure a vehicle is judged on, large, and editable for this comparison. */
export function BigFigure({ value, onChange, unit, label, edited, onReset }: {
  value: string; onChange: (v: string) => void; unit: string; label: string; edited: boolean; onReset: () => void;
}) {
  const id = useId();
  return (
    <div className="text-right">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className={`w-24 rounded-lg border bg-transparent px-1.5 py-0.5 text-right text-[28px] font-semibold leading-9 tracking-tight tabular-nums text-slate-900 transition hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10 ${edited ? "border-indigo-300 bg-indigo-50/50" : "border-transparent"}`} />
      <div className="mt-0.5 text-[12px] font-medium text-slate-500">{unit}</div>
      {edited && <div className="mt-1"><LinkButton onClick={onReset}>Reset</LinkButton></div>}
    </div>
  );
}
