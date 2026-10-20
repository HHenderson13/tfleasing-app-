"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BONUS_TYPES, rateText, type BonusRate, type BonusRates, type BonusType } from "@/lib/ten-at-ten-bonus";
import { saveBonusRatesAction } from "../actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Field = "pct" | "amount";
const key = (ym: string, type: BonusType) => `${ym}|${type}`;

/**
 * Ford's quarterly bonus, a quarter at a time (user, 2026-10-20). For each
 * delivery month and each of ICE Car, BEV Car, ICE Van and BEV Van: a
 * percentage of Basic (column BQ of the Dealbook Extract) and/or £ per unit,
 * either or both. A blank is nothing for that type; a month left entirely
 * blank has no scheme, and the tabs say so rather than showing £0 as final.
 */
export function BonusEditor({ rates, initialYear, initialQuarter }: { rates: BonusRates; initialYear: number; initialQuarter: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [quarter, setQuarter] = useState(initialQuarter);
  const [edits, setEdits] = useState<Record<string, Record<Field, string>>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const months = [0, 1, 2].map((i) => `${year}-${String((quarter - 1) * 3 + i + 1).padStart(2, "0")}`);
  const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
  const saved = (ym: string, type: BonusType, f: Field) => {
    const r = rates[ym]?.[type];
    return r && r[f] > 0 ? String(r[f]) : "";
  };
  const valueOf = (ym: string, type: BonusType, f: Field) => edits[key(ym, type)]?.[f] ?? saved(ym, type, f);
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const monthBlank = (ym: string) => BONUS_TYPES.every((t) => !valueOf(ym, t, "pct").trim() && !valueOf(ym, t, "amount").trim());
  const touched = [...new Set(Object.keys(edits).map((k) => k.split("|")[0]))];

  function set(ym: string, type: BonusType, f: Field, v: string) {
    if (!/^\d*\.?\d*$/.test(v)) return;
    setEdits((e) => ({ ...e, [key(ym, type)]: { pct: valueOf(ym, type, "pct"), amount: valueOf(ym, type, "amount"), [f]: v } }));
    setMsg(null);
  }

  // The commonest case: one rate for the quarter, then a month's extra.
  function copyFirstMonth() {
    const [first, ...rest] = months;
    setEdits((e) => {
      const next = { ...e };
      for (const ym of rest) for (const t of BONUS_TYPES) next[key(ym, t)] = { pct: valueOf(first, t, "pct"), amount: valueOf(first, t, "amount") };
      return next;
    });
    setMsg(null);
  }

  function shift(by: number) {
    const q = quarter + by;
    if (q < 1) { setYear((y) => y - 1); setQuarter(4); } else if (q > 4) { setYear((y) => y + 1); setQuarter(1); } else setQuarter(q);
  }

  function save() {
    const bad = Object.values(edits).some((v) => num(v.pct) > 100 || num(v.amount) > 100000);
    if (bad) { setMsg({ ok: false, text: "A percentage must be 0 to 100, and an amount up to £100,000." }); return; }
    const payload = touched.map((ym) => ({
      yearMonth: ym,
      rates: monthBlank(ym)
        ? null
        : Object.fromEntries(BONUS_TYPES.map((t) => [t, { pct: num(valueOf(ym, t, "pct")), amount: num(valueOf(ym, t, "amount")) }])) as Record<BonusType, BonusRate>,
    }));
    if (payload.length === 0) { setMsg({ ok: false, text: "Nothing to save." }); return; }
    start(async () => {
      const res = await saveBonusRatesAction({ months: payload });
      if (!res.ok) { setMsg({ ok: false, text: res.error ?? "Couldn't save." }); return; }
      setEdits({});
      setMsg({ ok: true, text: `Saved ${payload.map((p) => monthName(p.yearMonth)).join(", ")}.` });
      router.refresh();
    });
  }

  const input = "w-16 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums focus:border-slate-500 focus:outline-none";
  return (
    <section id="bonuses" className="mt-10 scroll-mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Quarterly bonuses</h2>
          <p className="max-w-2xl text-xs text-slate-500">
            By delivery month: a percentage of Basic (column BQ of the Dealbook Extract), £ per unit, or both. Orders and Deliveries
            show each deal&apos;s bonus from the month it delivers, on top of Invoice profit. Leave a whole month blank for no scheme.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => shift(-1)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100" aria-label="Previous quarter">‹</button>
          <span className="min-w-[72px] text-center font-semibold text-slate-900">Q{quarter} {year}</span>
          <button onClick={() => shift(1)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100" aria-label="Next quarter">›</button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Delivered</th>
              {months.map((ym) => (
                <th key={ym} className="px-3 py-2 text-center font-semibold">
                  {monthName(ym)}
                  {monthBlank(ym) && <div className="font-normal normal-case tracking-normal text-amber-700">no scheme</div>}
                </th>
              ))}
            </tr>
            <tr className="text-[9px]">
              <th />
              {months.map((ym) => <th key={ym} className="px-3 pb-1.5 text-center font-normal normal-case tracking-normal text-slate-400">% of Basic · £ per unit</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BONUS_TYPES.map((t) => (
              <tr key={t}>
                <td className="whitespace-nowrap px-4 py-1.5 font-medium text-slate-700">{t}</td>
                {months.map((ym) => {
                  const dirty = !!edits[key(ym, t)];
                  return (
                    <td key={ym} className={`px-3 py-1.5 ${dirty ? "bg-amber-50/50" : ""}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="inline-flex items-center gap-0.5">
                          <input inputMode="decimal" value={valueOf(ym, t, "pct")} onChange={(e) => set(ym, t, "pct", e.target.value)} placeholder="0"
                            aria-label={`${t} ${monthName(ym)} percent of Basic`} className={input} />
                          <span className="text-xs text-slate-400">%</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <span className="text-xs text-slate-400">£</span>
                          <input inputMode="decimal" value={valueOf(ym, t, "amount")} onChange={(e) => set(ym, t, "amount", e.target.value)} placeholder="0"
                            aria-label={`${t} ${monthName(ym)} pounds per unit`} className={`${input} w-20`} />
                        </span>
                      </div>
                      {!monthBlank(ym) && (
                        <div className="mt-0.5 text-center text-[10px] text-slate-400">
                          {rateText({ pct: num(valueOf(ym, t, "pct")), amount: num(valueOf(ym, t, "amount")) })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={pending || touched.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
          {pending ? "Saving…" : "Save bonuses"}
        </button>
        <button onClick={copyFirstMonth} disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
          Copy {monthName(months[0])} to {monthName(months[1])} and {monthName(months[2])}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
