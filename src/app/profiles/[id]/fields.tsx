"use client";

// One control per kind of answer, built for typing while someone talks:
// a choice is one tap (tap it again to clear), numbers have quick picks,
// dates have "Tomorrow", and nothing needs a save button.

import { useEffect, useId, useRef } from "react";
import {
  addDays, filled, labelOf, optionsOf, placeholderOf, unitOf, type FieldDef, type FieldValue, type ProfileKind,
} from "@/lib/customer-profiles";

const input =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition placeholder:text-slate-400 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14.5px]";

export function FieldControl({ f, kind, value, onChange, today, prompts, plain, half }: {
  f: FieldDef; kind: ProfileKind; value: FieldValue | undefined; onChange: (v: FieldValue) => void; today: string; prompts?: string[];
  /** A date with no quick picks: "In 2 days" means nothing for a valuation's expiry. */
  plain?: boolean;
  /** Half the panel's width beside its pair (see `panelLayout`); a phone always gets the whole row. */
  half?: boolean;
}) {
  const id = useId();
  const span = half ? "col-span-2 sm:col-span-1" : "col-span-2";
  const label = labelOf(f, kind);
  const str = typeof value === "string" ? value : "";
  const done = filled(value);
  const head = (
    <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${done ? "bg-emerald-500" : "bg-slate-200"}`} aria-hidden />
      {label}
    </label>
  );

  switch (f.type) {
    case "choice":
    case "yesno":
      return (
        <div className={`min-w-0 ${span}`}>
          <span id={id} className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${done ? "bg-emerald-500" : "bg-slate-200"}`} aria-hidden />{label}
          </span>
          <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
            {optionsOf(f, kind).map((o) => (
              <Pill key={o} on={str === o} role="radio" onClick={() => onChange(str === o ? "" : o)}>{o}</Pill>
            ))}
          </div>
        </div>
      );
    case "multi": {
      const on = Array.isArray(value) ? value : [];
      const opts = optionsOf(f, kind);
      return (
        <div className={`min-w-0 ${span}`}>
          <span id={id} className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${done ? "bg-emerald-500" : "bg-slate-200"}`} aria-hidden />{label}
            <span className="font-normal text-slate-400">· pick any</span>
          </span>
          <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
            {opts.map((o) => {
              const sel = on.includes(o);
              return (
                <Pill key={o} on={sel} check onClick={() => onChange(sel ? on.filter((x) => x !== o) : opts.filter((x) => x === o || on.includes(x)))}>{o}</Pill>
              );
            })}
          </div>
        </div>
      );
    }
    case "long":
      return (
        <div className={`min-w-0 ${span}`}>
          {prompts && prompts.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {prompts.map((p) => (
                <button key={p} type="button" onClick={() => onChange(addPrompt(str, p))}
                  className="h-7 rounded-full bg-white px-2.5 text-[12.5px] text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900">
                  + {p}
                </button>
              ))}
            </div>
          )}
          <AutoTextarea id={id} value={str} onChange={onChange} placeholder={prompts?.length ? "Tap a prompt above, or just type" : "Type anything"} label={label} />
        </div>
      );
    case "money":
      return (
        <div className={`min-w-0 ${span}`}>
          {head}
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14.5px] text-slate-400">£</span>
            <input id={id} inputMode="decimal" value={str} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
              className={`${input} pl-7 tabular-nums`} style={unitOf(f, kind) ? { paddingRight: `${(unitOf(f, kind)!.length * 0.47) + 1.2}rem` } : undefined} />
            {unitOf(f, kind) && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12.5px] text-slate-400">{unitOf(f, kind)}</span>}
          </div>
        </div>
      );
    case "number": {
      const unit = unitOf(f, kind);
      const n = Number(str.replace(/,/g, ""));
      return (
        <div className={`min-w-0 ${span}`}>
          {head}
          <div>
            <div className="relative">
              <input id={id} inputMode="numeric" value={str ? Number.isFinite(n) && str.replace(/,/g, "") !== "" ? n.toLocaleString("en-GB") : str : ""}
                onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
                className={`${input} tabular-nums`} style={unit ? { paddingRight: `${unit.length * 0.47 + 1.2}rem` } : undefined} />
              {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12.5px] text-slate-400">{unit}</span>}
            </div>
            {f.chips && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.chips.map((c) => (
                  <Pill key={c} small on={n === c} onClick={() => onChange(n === c ? "" : String(c))}>
                    {c >= 1000 ? `${(c / 1000).toLocaleString("en-GB")}k` : c}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    case "date": {
      const picks: [string, string][] = [["Today", today], ["Tomorrow", addDays(today, 1)], ["In 2 days", addDays(today, 2)], ["In a week", addDays(today, 7)]];
      return (
        <div className={`min-w-0 ${span}`}>
          {head}
          <input id={id} type="date" value={str} onChange={(e) => onChange(e.target.value)} className={`${input} pr-2`} />
          {!plain && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {picks.map(([l, d]) => <Pill key={l} small on={str === d} onClick={() => onChange(str === d ? "" : d)}>{l}</Pill>)}
            </div>
          )}
        </div>
      );
    }
    case "time": {
      const picks: [string, string][] = [["9am", "09:00"], ["12pm", "12:00"], ["3pm", "15:00"], ["5pm", "17:00"]];
      return (
        <div className={`min-w-0 ${span}`}>
          {head}
          <input id={id} type="time" value={str} onChange={(e) => onChange(e.target.value)} className={`${input} pr-2`} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {picks.map(([l, t]) => <Pill key={l} small on={str === t} onClick={() => onChange(str === t ? "" : t)}>{l}</Pill>)}
          </div>
        </div>
      );
    }
    default:
      return (
        <div className={`min-w-0 ${span}`}>
          {head}
          <input id={id} value={str} onChange={(e) => onChange(e.target.value)} placeholder={placeholderOf(f, kind) ?? undefined} className={input}
            autoCapitalize={f.id === "pxReg" ? "characters" : undefined} />
        </div>
      );
  }
}

/** Starts a new line with the prompt, ready to type after it. */
function addPrompt(text: string, prompt: string) {
  const t = text.replace(/\s+$/, "");
  return `${t}${t ? "\n" : ""}${prompt}: `;
}

export function AutoTextarea({ id, value, onChange, placeholder, label, minRows = 4, focusRef }: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string; label: string; minRows?: number;
  focusRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = focusRef ?? own;
  const last = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minRows * 22 + 20)}px`;
    // A prompt added from a chip: put the cursor at the end, ready to type.
    if (value.length > last.current.length && value.endsWith(": ") && document.activeElement !== el) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(value.length, value.length);
    }
    last.current = value;
  }, [value, minRows, ref]);
  return (
    <textarea id={id} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} rows={minRows}
      className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base leading-[22px] text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition placeholder:text-slate-400 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:text-[14.5px]" />
  );
}

export function Pill({ on, onClick, children, check, small, role }: {
  on: boolean; onClick: () => void; children: React.ReactNode; check?: boolean; small?: boolean; role?: "radio";
}) {
  return (
    <button type="button" onClick={onClick} role={role} aria-checked={role ? on : undefined} aria-pressed={role ? undefined : on}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition ${small ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]"} ${
        on ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400"}`}>
      {check && (
        <span className={`grid h-3.5 w-3.5 place-items-center rounded-[4px] ${on ? "bg-white text-slate-900" : "ring-1 ring-inset ring-slate-300"}`}>
          {on && <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>}
        </span>
      )}
      {children}
    </button>
  );
}
