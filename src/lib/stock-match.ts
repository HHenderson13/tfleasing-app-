import "server-only";

// Branches we treat as "ours" for order-number matching. VIN matches ignore this.
export const TF_BRANCH_CODES = ["62133", "62134"];

export interface StockHit {
  vin: string | null;
  orderNo: string | null;
  dealerRaw: string | null;
  locationStatus: string | null;
  etaAt: Date | null;
  interestBearingAt?: Date | null;
  adoptedAt?: Date | null;
}

// Normalize order numbers / VINs so trivial whitespace, case, and leading-zero
// differences don't break the join. Excel often round-trips numbers, and users
// occasionally type with extra spaces.
function normId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return s ? s.replace(/^0+/, "") || s : null;
}

function dealerHasTfBranch(dealerRaw: string | null): boolean {
  if (!dealerRaw) return false;
  return TF_BRANCH_CODES.some((c) => dealerRaw.includes(c));
}

export interface MatchResult {
  hit: StockHit | null;
  source: "vin" | "order" | "none";
}

// VIN match: any row regardless of branch (per spec — "if its a VIN, column b
// can be any value"). Order-number match: branch (column B) must be a TF code,
// then the order number (column AF) is compared.
export function matchProposalAgainstStock(
  p: { vin: string | null; orderNumber: string | null },
  stock: StockHit[],
): MatchResult {
  const propVin = normId(p.vin);
  if (propVin) {
    const hit = stock.find((s) => normId(s.vin) === propVin);
    if (hit) return { hit, source: "vin" };
  }
  const propOrder = normId(p.orderNumber);
  if (propOrder) {
    // Filter THEN find — a row with the same order number at a non-TF branch
    // shouldn't shadow a real TF-branch match.
    const candidates = stock.filter(
      (s) => dealerHasTfBranch(s.dealerRaw) && normId(s.orderNo) === propOrder,
    );
    if (candidates.length > 0) return { hit: candidates[0], source: "order" };
  }
  return { hit: null, source: "none" };
}
