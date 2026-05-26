// Back-solve the annual interest rate from a pair of lease quotes on the same
// vehicle/term but different upfronts. Ported from the Ratebook Pricing Engine's
// utils/rate_solver.py.
//
// Notation: "1+23" = 1 advance + 23 subsequent payments. The "23" never changes
// — it's the deferred-payment count. Two quotes on the same vehicle/term:
//   rental_1  × A(r, sub, 1)  = NetCapital
//   rental_12 × A(r, sub, 12) = NetCapital
// Dividing eliminates NetCapital, leaving a one-equation solve for r:
//   g(r) = rental_1 × A(r, sub, 1) − rental_12 × A(r, sub, 12) = 0
//
// A(r, sub, adv) = adv + (1 − (1+r)^-sub) / r          (annuity-due factor)

export const TERM_FOLLOW_ONS = [23, 35, 47] as const;
export type TermFollowOns = (typeof TERM_FOLLOW_ONS)[number];

// Funders we let users solve rates for — matches the Pricing Engine.
export const RATE_FUNDER_IDS = ["ald", "novuna", "arval", "lex"] as const;
export type RateFunderId = (typeof RATE_FUNDER_IDS)[number];

function annuityDueFactor(r: number, subsequent: number, advance: number): number {
  if (subsequent <= 0) return advance;
  if (r === 0) return subsequent + advance;
  return advance + (1 - Math.pow(1 + r, -subsequent)) / r;
}

function g(r: number, subsequent: number, rental1: number, rental12: number): number {
  return rental1 * annuityDueFactor(r, subsequent, 1) - rental12 * annuityDueFactor(r, subsequent, 12);
}

export interface SolveOptions {
  lo?: number;
  hi?: number;
  tol?: number;
  maxIter?: number;
}

// Returns the ANNUAL rate (e.g. 0.0813 = 8.13%).
// Throws if the rentals don't make sense (12-adv must be cheaper) or if the
// implied rate falls outside the search bracket [0, 40%].
export function solveAnnualRate(
  subsequent: number,
  rental1Adv: number,
  rental12Adv: number,
  opts: SolveOptions = {},
): number {
  const { tol = 1e-10, maxIter = 200 } = opts;
  let lo = opts.lo ?? 1e-6;
  let hi = opts.hi ?? 0.05 / 12;

  if (rental12Adv >= rental1Adv) {
    throw new Error(
      `12-advance rental (£${rental12Adv.toFixed(2)}) must be lower than 1-advance rental (£${rental1Adv.toFixed(2)}). More upfront = lower monthly.`,
    );
  }

  let fLo = g(lo, subsequent, rental1Adv, rental12Adv);
  let fHi = g(hi, subsequent, rental1Adv, rental12Adv);

  // Widen search bracket if both endpoints share a sign.
  if (fLo * fHi > 0) {
    let found = false;
    for (const hiTry of [0.10 / 12, 0.20 / 12, 0.40 / 12]) {
      fHi = g(hiTry, subsequent, rental1Adv, rental12Adv);
      if (fLo * fHi < 0) {
        hi = hiTry;
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(
        `Cannot find interest rate for ${subsequent}-month term. The £${(rental1Adv - rental12Adv).toFixed(2)}/month difference is outside the 0–40% range — double-check the quotes are for the same vehicle and term.`,
      );
    }
  }

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fMid = g(mid, subsequent, rental1Adv, rental12Adv);
    if (Math.abs(fMid) < tol || hi - lo < tol) {
      return round6(mid * 12);
    }
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return round6(((lo + hi) / 2) * 12);
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export interface SolvedTermRow {
  termFollowOns: TermFollowOns;
  rental1Adv: number | null;
  rental12Adv: number | null;
  annualRate: number | null;
  savingPerMonth: number | null;
  savingOverTerm: number | null;
  error: string | null;
}

// Solve all three terms for one funder. Each entry has a rate if both inputs
// were provided and valid; otherwise rate=null and error explains why.
export function solveAllTerms(
  quotes: Partial<Record<TermFollowOns, { rental1Adv: number | null; rental12Adv: number | null }>>,
): SolvedTermRow[] {
  return TERM_FOLLOW_ONS.map((sub) => {
    const q = quotes[sub];
    const r1 = q?.rental1Adv ?? null;
    const r12 = q?.rental12Adv ?? null;
    const row: SolvedTermRow = {
      termFollowOns: sub,
      rental1Adv: r1,
      rental12Adv: r12,
      annualRate: null,
      savingPerMonth: null,
      savingOverTerm: null,
      error: null,
    };
    if (r1 && r12 && r1 > 0 && r12 > 0) {
      row.savingPerMonth = round2(r1 - r12);
      row.savingOverTerm = round2((1 + sub) * r1 - (12 + sub) * r12);
      try {
        row.annualRate = solveAnnualRate(sub, r1, r12);
      } catch (e) {
        row.error = e instanceof Error ? e.message : "Solve failed";
      }
    }
    return row;
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
