// The availability rules, and the one function that decides whether a row
// they match should be pulled back into the stock list.
//
// Column H is normally the customer/fleet-assigned marker: ANY value in it
// hides a vehicle from /stock, which is why 86% of an upload is excluded.
// Some codes in it ("CO"), and some values of column E ("66170"), mark stock
// that is genuinely ours to sell. A matching row is included.
//
// It decides only whether a vehicle APPEARS. Status still decides whether it
// reads as in-stock or as an ETA — a rule saying "this is ours" is not a
// claim about where the vehicle physically is.

export interface AvailabilityRule {
  columnLetter: string; // "E" | "H"
  matchValue: string;
  enabled: boolean;
}

// What the row offers up for matching. Only the columns rules can reference.
export interface RuleColumns {
  rawColE?: string | null;
  rawColH?: string | null;
}

// Trimmed, case-insensitive. The value arrives from a spreadsheet cell and
// may be a number (66170 not "66170"), padded, or lower-cased by whoever
// last edited the file; none of those should stop a rule matching.
function norm(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim().toUpperCase();
}

export function ruleMatches(rule: AvailabilityRule, cols: RuleColumns): boolean {
  if (!rule.enabled) return false;
  const want = norm(rule.matchValue);
  if (!want) return false; // an empty rule value would match every empty cell
  const letter = rule.columnLetter.trim().toUpperCase();
  const got =
    letter === "E" ? norm(cols.rawColE) :
    letter === "H" ? norm(cols.rawColH) :
    null;
  return got !== null && got === want;
}

// True when any enabled rule says this row belongs in the list.
export function availableByRule(rules: AvailabilityRule[], cols: RuleColumns): boolean {
  return rules.some((r) => ruleMatches(r, cols));
}
