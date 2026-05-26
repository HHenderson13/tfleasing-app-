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
  lastSolved: {
    annualRate: number | null;
    savingPerMonth: number | null;
    savingOverTerm: number | null;
    error: string | null;
  } | null;
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

// Small chip per term: "2YR" / "3YR" / "4YR" — keeps the column narrow.
const termChip = (sub: number) => (sub === 23 ? "2YR" : sub === 35 ? "3YR" : sub === 47 ? "4YR" : `${sub}m`);

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
    <div className="grid gap-5 md:grid-cols-2">
      {funders.map((f, fi) => {
        const isSolved = f.rows.some((r) => r.updatedAt);
        const lastSolvedAt = f.rows.find((r) => r.updatedAt)?.updatedAt ?? null;
        return (
          <div key={f.funderId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <StatusDot solved={isSolved} />
                <div className="text-base font-semibold text-slate-900">{f.funderName}</div>
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">{f.funderId}</div>
            </div>

            <div className="divide-y divide-slate-100">
              {f.rows.map((r, ri) => (
                <TermRow
                  key={r.termFollowOns}
                  row={r}
                  onChange={(patch) => updateRow(fi, ri, patch)}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <div className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                {f.status === "error" ? (
                  <span className="text-red-600">{f.message}</span>
                ) : f.message ? (
                  <span className="text-emerald-700">{f.message}</span>
                ) : lastSolvedAt ? (
                  `Last solved ${formatWhen(lastSolvedAt)}`
                ) : (
                  "Using seeded defaults — enter quotes to recalibrate"
                )}
              </div>
              <button
                type="button"
                onClick={() => onSave(fi)}
                disabled={f.status === "saving"}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {f.status === "saving" ? "Solving…" : "Solve & save"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TermRow({ row, onChange }: { row: RowState; onChange: (patch: Partial<RowState>) => void }) {
  const r1 = row.rental1Adv.trim() ? parseFloat(row.rental1Adv) : null;
  const r12 = row.rental12Adv.trim() ? parseFloat(row.rental12Adv) : null;
  const both = r1 && r12 && r1 > 0 && r12 > 0 ? { r1, r12 } : null;
  const savingPerMonth = both ? both.r1 - both.r12 : null;
  const error = row.lastSolved?.error ?? null;

  return (
    <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3 px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
          {termChip(row.termFollowOns)}
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          1+{row.termFollowOns} / 12+{row.termFollowOns}
        </span>
      </div>
      <CurrencyInput
        value={row.rental1Adv}
        placeholder="1+ rental"
        onChange={(v) => onChange({ rental1Adv: v })}
      />
      <CurrencyInput
        value={row.rental12Adv}
        placeholder="12+ rental"
        onChange={(v) => onChange({ rental12Adv: v })}
      />
      <RateDisplay value={row.annualRate} error={error} savingPerMonth={savingPerMonth} />
    </div>
  );
}

function CurrencyInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">£</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        placeholder={placeholder ?? "—"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-6 pr-2 text-sm tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
    </div>
  );
}

function RateDisplay({
  value,
  error,
  savingPerMonth,
}: {
  value: number | null;
  error: string | null;
  savingPerMonth: number | null;
}) {
  if (error) {
    return (
      <span
        className="inline-flex min-w-[68px] justify-end text-[11px] font-medium text-red-600"
        title={error}
      >
        error
      </span>
    );
  }
  if (value === null) {
    return (
      <span className="inline-flex min-w-[68px] justify-end text-xs text-slate-300">
        {savingPerMonth ? `−£${savingPerMonth.toFixed(2)}/mo` : "—"}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[68px] justify-end font-mono text-sm font-semibold tabular-nums text-slate-900">
      {(value * 100).toFixed(3)}%
    </span>
  );
}

function StatusDot({ solved }: { solved: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        solved ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" : "bg-slate-300"
      }`}
      aria-label={solved ? "Solved" : "Using default"}
    />
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr} ${timeStr}`;
}
