// Which vehicles in the Ford stock report are ours to sell (user's rule,
// 2026-10-16):
//
//   • column H blank                      → available
//   • column H "CO"                        → available
//   • column H "CH" and column E "66170"   → available
//   • any other value in column H          → not available
//
// and every other stock rule still applies on top: a model we sell, not an
// excluded branch, and a VIN or an ETA (stock-list.ts). A blank H with a
// customer surname or fleet ID in the Trust Report stays hidden — a named
// customer means it's taken (user, 2026-10-16).
//
// The CO and CH + 66170 cases are rules, edited in Stock settings: a column
// H code, optionally with the column E value it needs. Ford's codes change
// without notice, so they can be added or switched off without a deploy.
//
// A rule decides only whether a vehicle APPEARS. Status still decides
// whether it reads as in-stock or as an ETA — "this is ours" is not a claim
// about where the vehicle physically is.

export interface AvailabilityRule {
  hCode: string;
  /** The column E value the code also needs; blank = any. */
  eValue: string | null;
  enabled: boolean;
}

// What the row offers up for matching.
export interface RuleColumns {
  rawColE?: string | null;
  rawColH?: string | null;
}

export interface StockScopeRow extends RuleColumns {
  /** Customer surname / fleet ID (Trust Report), or column H itself (input tab), or out of range. */
  customerAssigned: boolean;
  /** The model bucket — null for a model we don't sell. */
  sourceSheet: string | null;
  dealerRaw: string | null;
}

// Trimmed, case-insensitive. The value arrives from a spreadsheet cell and
// may be a number (66170 not "66170"), padded, or lower-cased by whoever
// last edited the file; none of those should stop a rule matching.
export function norm(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim().toUpperCase();
}

/** Exact, never a prefix: "CO" must not catch "CORP". */
export function ruleMatches(rule: AvailabilityRule, cols: RuleColumns): boolean {
  if (!rule.enabled) return false;
  const h = norm(rule.hCode);
  if (!h) return false; // a blank code would match every blank cell
  if (norm(cols.rawColH) !== h) return false;
  const e = norm(rule.eValue);
  return !e || norm(cols.rawColE) === e;
}

/** True when an enabled rule makes this row's column H code available. */
export function availableByRule(rules: readonly AvailabilityRule[], cols: RuleColumns): boolean {
  return rules.some((r) => ruleMatches(r, cols));
}

// Branches whose stock is never ours to sell, whatever column H says.
export const EXCLUDED_BRANCH_CODES: ReadonlySet<string> = new Set(["93662", "81827", "86630", "81828", "97718", "97717", "93383", "86492"]);

/**
 * The dealer code at the start of the DEALER cell. Most arrive as a bare
 * code, some with the name after it ("86492 (Spellbound)"), which an exact
 * comparison never matched.
 */
export function branchCodeOf(raw: unknown): string | null {
  return String(raw ?? "").trim().match(/^\d+/)?.[0] ?? null;
}

export const isExcludedBranch = (raw: unknown) => {
  const code = branchCodeOf(raw);
  return code != null && EXCLUDED_BRANCH_CODES.has(code);
};

/** A model we sell, on a branch whose stock we can sell. */
export const inRange = (v: Pick<StockScopeRow, "sourceSheet" | "dealerRaw">) => v.sourceSheet != null && !isExcludedBranch(v.dealerRaw);

/**
 * Whether a vehicle belongs on the stock list, before the VIN-or-ETA check.
 * stock-list.ts runs the same test in SQL (`stockScopeSql`); this is the
 * statement of it, and what the tests pin.
 */
export function inStockScope(v: StockScopeRow, rules: readonly AvailabilityRule[]): boolean {
  if (!inRange(v)) return false;
  if (!norm(v.rawColH)) return !v.customerAssigned;
  return availableByRule(rules, v);
}
