"use client";

// Customer Profiles' own building blocks, on top of the Fuel Cost
// Calculator's (fuel-calculator/ui.tsx): same card, same ink, same focus ring.

import type { ReactNode } from "react";
import { KIND_LABEL, type Heat, type ProfileKind, type Tone, type Urgency } from "@/lib/customer-profiles";

/** Each section keeps the colour it has on the paper call guides. */
export const TONE: Record<Tone, { solid: string; soft: string; text: string }> = {
  sky: { solid: "bg-sky-500", soft: "bg-sky-50", text: "text-sky-700" },
  indigo: { solid: "bg-indigo-500", soft: "bg-indigo-50", text: "text-indigo-700" },
  violet: { solid: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700" },
  amber: { solid: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-800" },
  emerald: { solid: "bg-emerald-600", soft: "bg-emerald-50", text: "text-emerald-700" },
  ink: { solid: "bg-slate-900", soft: "bg-slate-100", text: "text-slate-900" },
  orange: { solid: "bg-orange-500", soft: "bg-orange-50", text: "text-orange-700" },
  slate: { solid: "bg-slate-500", soft: "bg-slate-100", text: "text-slate-700" },
  teal: { solid: "bg-teal-600", soft: "bg-teal-50", text: "text-teal-700" },
  lime: { solid: "bg-emerald-600", soft: "bg-emerald-50", text: "text-emerald-700" },
  blue: { solid: "bg-blue-700", soft: "bg-blue-50", text: "text-blue-800" },
};

export const CARD = "rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]";

const KIND_STYLE: Record<ProfileKind, string> = {
  personal: "bg-sky-50 text-sky-800 ring-sky-200",
  business_car: "bg-violet-50 text-violet-800 ring-violet-200",
  business_van: "bg-amber-50 text-amber-900 ring-amber-200",
};

export function KindBadge({ kind }: { kind: ProfileKind }) {
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[12px] font-medium ring-1 ring-inset ${KIND_STYLE[kind]}`}>{KIND_LABEL[kind]}</span>;
}

export const HEAT_DOT: Record<Heat, string> = { Hot: "bg-rose-500", Warm: "bg-amber-400", Cold: "bg-sky-400" };

export function UrgencyBadge({ u, size = "md" }: { u: Urgency; size?: "md" | "sm" }) {
  const c = {
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    sky: "bg-sky-50 text-sky-800 ring-sky-200",
    slate: "bg-slate-50 text-slate-700 ring-slate-200",
  }[u.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 ring-1 ring-inset ${size === "sm" ? "h-6 text-[12px]" : "h-7 text-[12.5px]"} font-medium ${c}`}>
      {u.tier <= 1 && <Icon name="clock" className="h-3.5 w-3.5" />}
      {u.label}
      {u.detail && <span className="font-normal opacity-80">· {u.detail}</span>}
    </span>
  );
}

export function Ring({ pct, size = 36 }: { pct: number; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" className="stroke-slate-200" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" strokeLinecap="round" className={pct >= 100 ? "stroke-emerald-500" : "stroke-slate-900"}
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} style={{ transition: "stroke-dashoffset .3s" }} />
    </svg>
  );
}

const PATHS: Record<string, ReactNode> = {
  plus: <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />,
  search: <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />,
  clock: <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />,
  chevron: <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />,
  back: <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />,
  check: <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />,
  copy: <><path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" /><path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" /></>,
  x: <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />,
  bolt: <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />,
  doc: <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />,
  swap: <path fillRule="evenodd" d="M13.2 2.24a.75.75 0 0 0 .04 1.06l2.1 1.95H6.75a.75.75 0 0 0 0 1.5h8.59l-2.1 1.95a.75.75 0 1 0 1.02 1.1l3.5-3.25a.75.75 0 0 0 0-1.1l-3.5-3.25a.75.75 0 0 0-1.06.04Zm-6.4 8a.75.75 0 0 0-1.06-.04l-3.5 3.25a.75.75 0 0 0 0 1.1l3.5 3.25a.75.75 0 1 0 1.02-1.1l-2.1-1.95h8.59a.75.75 0 0 0 0-1.5H4.66l2.1-1.95a.75.75 0 0 0 .04-1.06Z" clipRule="evenodd" />,
  truck: <path d="M6.5 3c-1.051 0-2.093.04-3.125.117A1.49 1.49 0 0 0 2 4.607V10.5h9V4.606c0-.771-.59-1.43-1.375-1.489A41.568 41.568 0 0 0 6.5 3ZM2 12v2.5A1.5 1.5 0 0 0 3.5 16h.041a3 3 0 0 1 5.918 0h.791a.75.75 0 0 0 .75-.75V12H2Zm4.5 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7-11.5a.75.75 0 0 0-.75.75v10.465a3.001 3.001 0 0 1 5.032 1.785H18a.5.5 0 0 0 .5-.5V9.21a.75.75 0 0 0-.134-.427l-2.69-3.844A1.5 1.5 0 0 0 14.448 4H13.5Zm1.5 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />,
  upload: <><path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" /><path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" /></>,
  external: <><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" /></>,
  trash: <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />,
  undo: <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />,
  flame: <path fillRule="evenodd" d="M13.5 4.938a7 7 0 1 1-9.006 1.737c.202-.257.59-.218.793.039.278.352.594.672.943.954.332.269.786-.049.773-.476a5.977 5.977 0 0 1 .572-2.759 6.026 6.026 0 0 1 2.486-2.665c.247-.14.55-.016.677.238A6.967 6.967 0 0 0 13.5 4.938ZM14 12a4 4 0 0 1-4 4c-1.913 0-3.52-1.398-3.91-3.182-.093-.429.44-.643.814-.413a4.043 4.043 0 0 0 1.601.564c.303.038.531-.24.51-.544a5.975 5.975 0 0 1 1.315-4.192.447.447 0 0 1 .431-.16A4.001 4.001 0 0 1 14 12Z" clipRule="evenodd" />,
  person: <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />,
  building: <path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H16v13h.25a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75v-2.5a.75.75 0 0 0-.75-.75h-2.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5H4Zm3-11a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1ZM7.5 9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-1ZM11 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1Zm.5 3.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-1Z" clipRule="evenodd" />,
  link: <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Zm-4.464 11.536a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3Z" />,
};

export function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof PATHS; className?: string }) {
  return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>{PATHS[name]}</svg>;
}

/** "3 minutes ago", "2 hours ago", "Mon 3 Nov". */
export function ago(epochSec: number, nowMs: number): string {
  const s = Math.max(0, Math.round(nowMs / 1000 - epochSec));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(epochSec * 1000).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
}

/** Copies text, falling back for older browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-xl" : "sm:max-w-md"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <Icon name="x" />
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

/** Line icons for the profile's topics, drawn to one 24px grid and one stroke. */
const GLYPHS: Record<string, ReactNode> = {
  car: <><path d="M5 12l1.6-4.3A2 2 0 0 1 8.5 6.4h7a2 2 0 0 1 1.9 1.3L19 12" /><path d="M4 12h16v4.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H7.5v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V12Z" /><path d="M7.5 14.5h.01M16.5 14.5h.01" /></>,
  van: <><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H14v10H3V7.5Z" /><path d="M14 9h3.6l3.4 3.6V16h-7V9Z" /><circle cx="7" cy="17" r="1.8" /><circle cx="17" cy="17" r="1.8" /></>,
  chat: <path d="M4.5 5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  building: <><path d="M5 20V5.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1V20M14 9.5h4a1 1 0 0 1 1 1V20M3 20h18" /><path d="M8 8h3M8 11.5h3M8 15h3" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16" /></>,
  tools: <><path d="M3.5 9.5h17v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9Z" /><path d="M8.5 9.5V7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2.5M3.5 13.5h17" /></>,
  plug: <><path d="M9 3.5v4M15 3.5v4" /><path d="M7 7.5h10v3a5 5 0 0 1-10 0v-3Z" /><path d="M12 15.5v5" /></>,
  key: <><circle cx="8" cy="12" r="3.5" /><path d="M11.5 12H21M17.5 12v3M20.5 12v2" /></>,
  pound: <path d="M16 7.5a3.5 3.5 0 0 0-6.5 1.8V19M7 13h6M6.5 19H17" />,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M20.5 19a5.5 5.5 0 0 0-3.5-5.1" /></>,
  note: <><path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20V3.5Z" /><path d="M9 11h7M9 14.5h7M9 18h4" /></>,
};

export function Glyph({ name, className = "h-4 w-4" }: { name: keyof typeof GLYPHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {GLYPHS[name]}
    </svg>
  );
}
