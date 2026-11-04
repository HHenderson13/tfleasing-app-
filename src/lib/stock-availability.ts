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
//
// Column F rules (user, 2026-11-04): column F (CUST2_SURNAME in the Trust
// Report) reading a value, optionally only on one dealer code, makes the
// vehicle available whatever column H says and whoever is named. Seeded with
// "TrustFord - TFL" on dealer 62133: stock held for TF Leasing at that dealer.
// Edited in Stock settings beside the column H rules.

export interface AvailabilityRule {
  hCode: string;
  /** The column E value the code also needs; blank = any. */
  eValue: string | null;
  enabled: boolean;
}

export interface ColumnFRule {
  /** What column F must read: case, spaces and dash style don't matter. */
  fValue: string;
  /** The dealer code it must be on, exactly; blank = any dealer. */
  dealerCode: string | null;
  enabled: boolean;
}

// What the row offers up for matching.
export interface RuleColumns {
  rawColE?: string | null;
  rawColF?: string | null;
  rawColH?: string | null;
  dealerRaw?: string | null;
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

/**
 * Column F as compared: upper case, any dash as a hyphen, no spaces at all.
 * "TrustFord - TFL", "TRUSTFORD-TFL" and "Trustford – TFL" are one value; a
 * name typed into Ford's system arrives any of those ways. The SQL in
 * stock-list.ts (`fCellSql`) does exactly the same.
 */
export function fNorm(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\s\u00a0]+/g, "");
}

/** Exact after tidying, never a prefix; the dealer code exact too ("621330" is not 62133). */
export function fRuleMatches(rule: ColumnFRule, cols: RuleColumns): boolean {
  if (!rule.enabled) return false;
  const f = fNorm(rule.fValue);
  if (!f) return false; // a blank value would match every blank cell
  if (fNorm(cols.rawColF) !== f) return false;
  const dealer = branchCodeOf(rule.dealerCode);
  return !dealer || branchCodeOf(cols.dealerRaw) === dealer;
}

/** True when an enabled column F rule makes this row available. */
export function availableByFRule(rules: readonly ColumnFRule[], cols: RuleColumns): boolean {
  return rules.some((r) => fRuleMatches(r, cols));
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
export function inStockScope(v: StockScopeRow, rules: readonly AvailabilityRule[], fRules: readonly ColumnFRule[] = []): boolean {
  if (!inRange(v)) return false;
  // A column F rule names the stock as ours outright: column H and a named customer don't matter.
  if (availableByFRule(fRules, v)) return true;
  if (!norm(v.rawColH)) return !v.customerAssigned;
  return availableByRule(rules, v);
}
