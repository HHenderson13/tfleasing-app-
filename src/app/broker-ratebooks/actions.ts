"use server";

import { db } from "@/db";
import { funderInterestRates, funders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import {
  RATE_FUNDER_IDS,
  TERM_FOLLOW_ONS,
  solveAllTerms,
  type RateFunderId,
  type TermFollowOns,
} from "@/lib/interest-rate-solver";
import { revalidatePath } from "next/cache";

export interface FunderRateSnapshot {
  funderId: string;
  funderName: string;
  rows: Array<{
    termFollowOns: number;
    annualRate: number | null;
    rental1Adv: number | null;
    rental12Adv: number | null;
    updatedAt: string | null;
  }>;
}

// Returns all rate-bearing funders with their current stored rates + the input
// rentals that produced them (if any). Missing (funder, term) pairs come back
// as null so the UI can show empty inputs.
export async function loadFunderRateSnapshots(): Promise<FunderRateSnapshot[]> {
  await requireAdmin();
  const [funderRows, rateRows] = await Promise.all([
    db.select().from(funders),
    db.select().from(funderInterestRates),
  ]);
  const rateByFunder = new Map<string, typeof rateRows>();
  for (const r of rateRows) {
    const list = rateByFunder.get(r.funderId) ?? [];
    list.push(r);
    rateByFunder.set(r.funderId, list);
  }

  return RATE_FUNDER_IDS.map((id) => {
    const funderName = funderRows.find((f) => f.id === id)?.name ?? id;
    const stored = rateByFunder.get(id) ?? [];
    const byTerm = new Map(stored.map((s) => [s.termFollowOns, s]));
    return {
      funderId: id,
      funderName,
      rows: TERM_FOLLOW_ONS.map((sub) => {
        const r = byTerm.get(sub);
        return {
          termFollowOns: sub,
          annualRate: r?.annualRate ?? null,
          rental1Adv: r?.rental1Adv ?? null,
          rental12Adv: r?.rental12Adv ?? null,
          updatedAt: r?.updatedAt ? r.updatedAt.toISOString() : null,
        };
      }),
    };
  });
}

export interface SolveAndSaveInput {
  funderId: RateFunderId;
  quotes: Partial<Record<TermFollowOns, { rental1Adv: number | null; rental12Adv: number | null }>>;
}

export interface SolveAndSaveResult {
  ok: boolean;
  error?: string;
  solved: Array<{
    termFollowOns: number;
    annualRate: number | null;
    savingPerMonth: number | null;
    savingOverTerm: number | null;
    error: string | null;
  }>;
}

// Solve all three terms for one funder, persist any successfully-solved rows,
// and return solver output for UI display.
export async function solveAndSaveRatesAction(input: SolveAndSaveInput): Promise<SolveAndSaveResult> {
  await requireAdmin();
  if (!RATE_FUNDER_IDS.includes(input.funderId)) {
    return { ok: false, error: "Unknown funder", solved: [] };
  }
  const solved = solveAllTerms(input.quotes);
  const now = new Date();

  for (const row of solved) {
    if (row.annualRate === null) continue;
    await db
      .insert(funderInterestRates)
      .values({
        funderId: input.funderId,
        termFollowOns: row.termFollowOns,
        annualRate: row.annualRate,
        rental1Adv: row.rental1Adv,
        rental12Adv: row.rental12Adv,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [funderInterestRates.funderId, funderInterestRates.termFollowOns],
        set: {
          annualRate: row.annualRate,
          rental1Adv: row.rental1Adv,
          rental12Adv: row.rental12Adv,
          updatedAt: now,
        },
      });
  }

  revalidatePath("/broker-ratebooks");

  return {
    ok: true,
    solved: solved.map((s) => ({
      termFollowOns: s.termFollowOns,
      annualRate: s.annualRate,
      savingPerMonth: s.savingPerMonth,
      savingOverTerm: s.savingOverTerm,
      error: s.error,
    })),
  };
}
