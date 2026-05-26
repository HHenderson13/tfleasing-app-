import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, proposals, stockVehicles } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { matchProposalAgainstStock, TF_BRANCH_CODES } from "@/lib/stock-match";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Admin-only diagnostic — lives under /api/cron/* (which middleware leaves
// open for scheduled jobs) so this route MUST authenticate inside the handler.
export async function GET() {
  await requireAdmin();
  const orderProps = await db
    .select({
      id: proposals.id,
      customerId: proposals.customerId,
      vin: proposals.vin,
      orderNumber: proposals.orderNumber,
      model: proposals.model,
      derivative: proposals.derivative,
      isGroupBq: proposals.isGroupBq,
    })
    .from(proposals)
    .where(inArray(proposals.status, ["in_order", "awaiting_delivery"]));

  const stock = await db
    .select({
      vin: stockVehicles.vin,
      orderNo: stockVehicles.orderNo,
      dealerRaw: stockVehicles.dealerRaw,
      locationStatus: stockVehicles.locationStatus,
      etaAt: stockVehicles.etaAt,
    })
    .from(stockVehicles);

  const custIds = Array.from(new Set(orderProps.map((p) => p.customerId)));
  const custRows = custIds.length === 0 ? [] : await db.select().from(customers).where(inArray(customers.id, custIds));
  const custName = new Map(custRows.map((c) => [c.id, c.name]));

  const matched: { customer: string; vin: string | null; order: string | null; via: string; location: string | null; eta: string | null }[] = [];
  const unmatched: { customer: string; vin: string | null; order: string | null; reason: string; sameOrderAtNonTfBranch: { order: string; dealer: string }[]; isGroupBq: boolean }[] = [];

  for (const p of orderProps) {
    if (p.isGroupBq) continue; // BQ deals don't get stock-matched
    const { hit, source } = matchProposalAgainstStock(p, stock);
    const customer = custName.get(p.customerId) ?? "—";
    if (hit) {
      matched.push({
        customer,
        vin: p.vin,
        order: p.orderNumber,
        via: source,
        location: hit.locationStatus,
        eta: hit.etaAt ? hit.etaAt.toISOString().slice(0, 10) : null,
      });
    } else {
      // Diagnose: are there rows with the same order number but a different branch?
      const sameOrder = p.orderNumber
        ? stock
            .filter((s) => (s.orderNo ?? "").toString().trim() === (p.orderNumber ?? "").trim())
            .map((s) => ({ order: s.orderNo ?? "", dealer: s.dealerRaw ?? "" }))
        : [];
      const reason = !p.vin && !p.orderNumber
        ? "no VIN or order number on proposal"
        : sameOrder.length > 0
          ? `order found at non-TF branch (need ${TF_BRANCH_CODES.join("/")})`
          : "no row in stock with that VIN or order";
      unmatched.push({
        customer,
        vin: p.vin,
        order: p.orderNumber,
        reason,
        sameOrderAtNonTfBranch: sameOrder,
        isGroupBq: p.isGroupBq,
      });
    }
  }

  return NextResponse.json({
    stockRows: stock.length,
    proposals: orderProps.length,
    matched: matched.length,
    unmatched: unmatched.length,
    matchedSample: matched.slice(0, 5),
    unmatchedAll: unmatched,
  });
}
