// Some vehicles are a different model from what the feed calls them, and the
// only thing that says so is the dealer they sit at.
//
// An Explorer on a van dealer code is an Explorer Van — same model name in
// Ford's export, different vehicle to sell. It also needs saying out loud:
// TF has to check with Fleet before offering one, and a broker has to check
// with us. Getting that wrong means offering a van as a car.
//
// Kept as data rather than a hardcoded list because dealer codes move: sites
// open, close and get renumbered, and none of that should need a deploy.

export interface ModelDealerRule {
  id: string;
  modelRaw: string;      // matched against the feed's model, case-insensitive
  dealerCodes: string[]; // numeric site codes, e.g. ["97706", "97709"]
  displayName: string;   // what to call it instead — "Explorer Van"
  tfNote: string | null; // shown on /stock
  brokerNote: string | null; // shown on /broker/stock — never the TF one
  enabled: boolean;
}

// `dealer_raw` arrives as "97706 (Fleet Barnsley)" — the code is the leading
// digits and always present (verified across a full upload). Anything else
// yields null and simply never matches, rather than guessing.
export function dealerCode(dealerRaw: string | null | undefined): string | null {
  const m = /^\s*(\d+)/.exec(dealerRaw ?? "");
  return m ? m[1] : null;
}

// Parses the admin's free-text list. Deliberately forgiving about the
// separator: someone will paste codes comma-separated, someone else one per
// line, and both should work.
export function parseDealerCodes(input: string): string[] {
  return [...new Set(
    input
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s)),
  )];
}

export function formatDealerCodes(codes: string[]): string {
  return codes.join(", ");
}

// The first enabled rule whose model AND dealer both match. Model is compared
// on the FEED's raw value, not the tidied bucket, so a display rename cannot
// quietly stop a rule matching.
export function matchModelDealerRule(
  rules: ModelDealerRule[],
  modelRaw: string | null | undefined,
  dealerRaw: string | null | undefined,
): ModelDealerRule | null {
  const model = (modelRaw ?? "").trim().toUpperCase();
  const code = dealerCode(dealerRaw);
  if (!model || !code) return null;
  return rules.find((r) =>
    r.enabled &&
    r.modelRaw.trim().toUpperCase() === model &&
    r.dealerCodes.includes(code),
  ) ?? null;
}
