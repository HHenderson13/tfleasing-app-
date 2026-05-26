"use client";

import { useState } from "react";
import { solveAndSaveRatesAction, type FunderRateSnapshot } from "./actions";
import type { RateFunderId } from "@/lib/interest-rate-solver";

type RowState = {
  termFollowOns: number;
  rental1Adv: string;
  rental12Adv: string;
  annualRate: number | null;
  updatedAt: string | null;
  // populated after a save returns
  lastSolved: { annualRate: number | null; savingPerMonth: number | null; savingOverTerm: number | null; error: string | null } | null;
};

type FunderState = {
  funderId: string;
  funderName: string;
  rows: RowState[];
  status: "idle" | "saving" | "error";
  message: string | null;
};

function snapshotToState(s: FunderRateSnapshot): FunderState {
  return {
    funderId: s.funderId,
    funderName: s.funderName,
    rows: s.rows.map((r) => ({
      termFollowOns: r.termFollowOns,
      rental1Adv: r.rental1Adv?.toString() ?? "",
      rental12Adv: r.rental12Adv?.toString() ?? "",
      annualRate: r.annualRate,
      updatedAt: r.updatedAt,
      lastSolved: null,
    })),
    status: "idle",
    message: null,
  };
}

const termLabel = (sub: number) =>
  sub === 23 ? "2yr (1+23 / 12+23)" : sub === 35 ? "3yr (1+35 / 12+35)" : sub === 47 ? "4yr (1+47 / 12+47)" : `${sub}m`;

export function InterestRatesSection({ snapshots }: { snapshots: FunderRateSnapshot[] }) {
  const [funders, setFunders] = useState<FunderState[]>(() => snapshots.map(snapshotToState));

  function updateRow(funderIdx: number, rowIdx: number, patch: Partial<RowState>) {
    setFunders((prev) => {
      const next = [...prev];
      const f = { ...next[funderIdx] };
      const rows = [...f.rows];
      rows[rowIdx] = { ...rows[rowIdx], ...patch };
      f.rows = rows;
      next[funderIdx] = f;
      return next;
    });
  }

  async function onSave(funderIdx: number) {
    const f = funders[funderIdx];
    setFunders((prev) => prev.map((x, i) => (i === funderIdx ? { ...x, status: "saving", message: null } : x)));

    const quotes: Record<number, { rental1Adv: number | null; rental12Adv: number | null }> = {};
    for (const row of f.rows) {
      const r1 = row.rental1Adv.trim() ? parseFloat(row.rental1Adv) : null;
      const r12 = row.rental12Adv.trim() ? parseFloat(row.rental12Adv) : null;
      quotes[row.termFollowOns] = { rental1Adv: r1, rental12Adv: r12 };
    }

    const result = await solveAndSaveRatesAction({
      funderId: f.funderId as RateFunderId,
      quotes: quotes as Parameters<typeof solveAndSaveRatesAction>[0]["quotes"],
    });

    setFunders((prev) =>
      prev.map((x, i) => {
        if (i !== funderIdx) return x;
        if (!result.ok) {
          return { ...x, status: "error", message: result.error ?? "Save failed" };
        }
        const solvedByTerm = new Map(result.solved.map((s) => [s.termFollowOns, s]));
        const now = new Date().toISOString();
        const rows = x.rows.map((r) => {
          const s = solvedByTerm.get(r.termFollowOns);
          if (!s) return r;
          return {
            ...r,
            annualRate: s.annualRate ?? r.annualRate,
            updatedAt: s.annualRate !== null ? now : r.updatedAt,
            lastSolved: s,
          };
        });
        return { ...x, status: "idle", message: "Saved — broker exports will use these rates.", rows };
      }),
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Interest rates</h2>
        <p className="text-xs text-slate-500">
          Enter the 1+ and 12+ rentals from the same vehicle, same term → solve → save.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {funders.map((f, fi) => (
          <div key={f.funderId} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-base font-semibold text-slate-900">{f.funderName}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{f.funderId}</div>
            </div>

            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5 font-medium">Term</th>
                  <th className="pb-1.5 font-medium">1+ rental</th>
                  <th className="pb-1.5 font-medium">12+ rental</th>
                  <th className="pb-1.5 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {f.rows.map((r, ri) => (
                  <tr key={r.termFollowOns} className="align-middle">
                    <td className="py-1 pr-2 text-xs text-slate-600">{termLabel(r.termFollowOns)}</td>
                    <td className="py-1 pr-2">
                      <CurrencyInput
                        value={r.rental1Adv}
                        onChange={(v) => updateRow(fi, ri, { rental1Adv: v })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <CurrencyInput
                        value={r.rental12Adv}
                        onChange={(v) => updateRow(fi, ri, { rental12Adv: v })}
                      />
                    </td>
                    <td className="py-1 text-right">
                      <RateDisplay value={r.annualRate} error={r.lastSolved?.error ?? null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-xs text-slate-500">
                {f.message ?? (f.rows.find((r) => r.updatedAt)?.updatedAt
                  ? `Last solved: ${new Date(f.rows.find((r) => r.updatedAt)!.updatedAt!).toLocaleString("en-GB")}`
                  : "Not solved yet — using seeded defaults.")}
              </div>
              <button
                type="button"
                onClick={() => onSave(fi)}
                disabled={f.status === "saving"}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {f.status === "saving" ? "Solving…" : "Solve & save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">£</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white py-1 pl-5 pr-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </div>
  );
}

function RateDisplay({ value, error }: { value: number | null; error: string | null }) {
  if (error) return <span className="text-xs text-red-600" title={error}>error</span>;
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  return <span className="font-mono text-sm text-slate-900">{(value * 100).toFixed(3)}%</span>;
}
