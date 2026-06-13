import { listAwaitingForTracker } from "@/lib/proposals";
import { TopNav } from "@/components/top-nav";
import { db } from "@/db";
import { salesExecs, stockVehicles } from "@/db/schema";
import { asc, inArray, or, sql } from "drizzle-orm";
import { buildStockMatchIndex, type StockHit } from "@/lib/stock-match";
import { requireOrdersAccess } from "@/lib/auth-guard";
import { isAdmin } from "@/lib/auth";
import { AwaitingClient, type AwaitingItemPayload } from "./awaiting-client";
import type { Match } from "./types";

export const dynamic = "force-dynamic";

function isDeliveredStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  const u = s.toUpperCase();
  return u === "DELIVERED" || u === "DEALER";
}

export default async function OrdersAwaitingPage() {
  const me = await requireOrdersAccess();
  const admin = isAdmin(me);

  // Single targeted call replaces the old listProposals("orders") fan-out.
  // listAwaitingForTracker only queries the awaiting_delivery slice and
  // pre-joins customers / execs / sites / dealer-fit / stage-check ticks.
  const { items: awaiting, ticksByProposal, dealerFitByProposal, deliveryDefs } =
    await listAwaitingForTracker();

  // Build the candidate VIN + order-number sets from the proposals we
  // actually need to match. The stock table can be tens of thousands of
  // rows; pulling everything was the second-biggest cost on this page.
  // Drizzle IN-clause keeps the query under SQLite's variable-count limit
  // because awaiting is in the hundreds at worst.
  const vins = new Set<string>();
  const orderNos = new Set<string>();
  for (const p of awaiting) {
    if (p.vin) vins.add(p.vin.trim().toUpperCase());
    if (p.orderNumber) orderNos.add(p.orderNumber.trim().toUpperCase().replace(/^0+/, "") || p.orderNumber.trim().toUpperCase());
  }

  // Stock + execs in parallel. The stock query is narrowed to only rows
  // that COULD match an awaiting proposal — VIN match OR (order number
  // match at a TF branch). Both checks live on the DB rather than scanning
  // the full table in JS.
  const [stockRaw, execs] = await Promise.all([
    vins.size === 0 && orderNos.size === 0
      ? Promise.resolve([])
      : db
          .select({
            vin: stockVehicles.vin,
            orderNo: stockVehicles.orderNo,
            dealerRaw: stockVehicles.dealerRaw,
            locationStatus: stockVehicles.locationStatus,
            etaAt: stockVehicles.etaAt,
            interestBearingAt: stockVehicles.interestBearingAt,
            adoptedAt: stockVehicles.adoptedAt,
          })
          .from(stockVehicles)
          .where(
            or(
              vins.size > 0 ? inArray(stockVehicles.vin, Array.from(vins)) : sql`1=0`,
              orderNos.size > 0 ? inArray(stockVehicles.orderNo, Array.from(orderNos)) : sql`1=0`,
            ),
          ),
    db.select({ id: salesExecs.id, name: salesExecs.name }).from(salesExecs).orderBy(asc(salesExecs.name)),
  ]);

  const matcher = buildStockMatchIndex(stockRaw as StockHit[]);

  // Pre-flatten everything the client needs. The client component is purely
  // a renderer + filter — no further DB work happens after this point.
  const payload: AwaitingItemPayload[] = awaiting.map((p) => {
    const isBq = p.isGroupBq;
    const match: Match = isBq
      ? { delivered: false, etaAt: null, location: null, source: "none", interestBearingAt: null, adoptedAt: null, registeredReview: false }
      : matchToView(p, matcher.match(p));
    const checks = deliveryDefs
      .filter((d) => isBq ? d.appliesToBq : true)
      .map((d) => ({ id: d.id, label: d.label, checked: ticksByProposal.get(p.id)?.has(d.id) ?? false }));
    const locationLabel = match.location ?? (match.delivered ? "Arrived" : match.source === "none" ? null : "Pending");
    const etaLabel = match.etaAt
      ? new Date(match.etaAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : null;
    const deliveryBookedAtIso = p.deliveryBookedAt ? p.deliveryBookedAt.toISOString().slice(0, 10) : null;
    return {
      salesExecId: p.salesExecId,
      isGroupBq: isBq,
      deliveryBookedAtIso,
      match,
      calendarEntry: deliveryBookedAtIso
        ? {
            proposalId: p.id,
            customerName: p.customer?.name ?? "—",
            customerId: p.customer?.id ?? "",
            model: `${p.model} ${p.derivative}`,
            funderName: p.funderName,
            execName: p.exec?.name ?? null,
            isEv: p.isEv,
            isGroupBq: isBq,
            deliveryBookedAt: deliveryBookedAtIso,
          }
        : null,
      card: {
        id: p.id,
        customerName: p.customer?.name ?? "—",
        customerId: p.customer?.id ?? "",
        businessName: p.customer?.businessName ?? null,
        model: p.model,
        derivative: p.derivative,
        funderName: p.funderName,
        isGroupBq: isBq,
        execName: p.exec?.name ?? (isBq ? "Group BQ" : null),
        isEv: p.isEv,
        wallboxIncluded: p.wallboxIncluded,
        customerSavingGbp: p.customerSavingGbp,
        monthlyRental: p.monthlyRental,
        financeProposalNumber: p.financeProposalNumber,
        locationLabel,
        etaLabel,
        orderNumber: p.orderNumber,
        vin: p.vin,
        vehicleColour: p.vehicleColour ?? null,
        factoryOptions: p.factoryOptions ?? null,
        regNumber: p.regNumber,
        pdiDone: p.pdiDone ?? false,
        financeAgreementSigned: p.financeAgreementSigned,
        invoiced: p.invoiced ?? false,
        itcComplete: p.itcComplete ?? false,
        taxed: p.taxed ?? false,
        deliveryBookedAt: deliveryBookedAtIso,
        gapPolicyStatus: (p.gapPolicyStatus as "none" | "pending" | "complete") ?? "none",
        gapPolicyNumber: p.gapPolicyNumber ?? null,
        tfpPolicyStatus: (p.tfpPolicyStatus as "none" | "pending" | "complete") ?? "none",
        tfpPolicyNumber: p.tfpPolicyNumber ?? null,
        deliveryNotes: p.deliveryNotes ?? null,
        deliveryPackSubmitted: p.deliveryPackSubmitted ?? false,
        deliveryDetailsChecked: p.deliveryDetailsChecked ?? false,
        checks,
        dealerFitOptions: dealerFitByProposal.get(p.id) ?? [],
      },
    };
  });

  // Default exec view: own deals for sales execs, all-department for admins.
  // The client can flip via the in-page exec filter without a round-trip.
  const myExecId = me.salesExecId ?? null;
  const defaultExecId = admin ? null : myExecId;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Awaiting delivery</h1>
            <p className="mt-1 text-sm text-slate-500">
              All actions completed — waiting for Ford to deliver to us, or for us to deliver to the customer.
            </p>
          </div>
        </div>

        <AwaitingClient
          items={payload}
          execs={execs}
          defaultExecId={defaultExecId}
          myExecId={myExecId}
          adminAddDealHref={admin ? "/orders/awaiting/new" : null}
        />
      </main>
    </div>
  );
}

// Resolve the in-stock + manual + previously-detected paths into the
// presentation-friendly Match shape (date fields converted to ISO strings
// so the payload serialises cleanly to the client).
function matchToView(
  p: { manualEtaAt: Date | null; manualLocation: string | null; deliveredDetectedAt: Date | null },
  hit: ReturnType<ReturnType<typeof buildStockMatchIndex>["match"]>,
): Match {
  if (hit.hit) {
    const delivered = isDeliveredStatus(hit.hit.locationStatus);
    return {
      delivered,
      etaAt: delivered ? null : (hit.hit.etaAt ? hit.hit.etaAt.toISOString() : null),
      location: hit.hit.locationStatus,
      source: hit.source === "vin" ? "stock-vin" : "stock-order",
      interestBearingAt: hit.hit.interestBearingAt ? hit.hit.interestBearingAt.toISOString() : null,
      adoptedAt: hit.hit.adoptedAt ? hit.hit.adoptedAt.toISOString() : null,
      registeredReview: false,
    };
  }
  if (p.manualEtaAt || p.manualLocation) {
    const delivered = isDeliveredStatus(p.manualLocation);
    return {
      delivered,
      etaAt: delivered ? null : (p.manualEtaAt ? p.manualEtaAt.toISOString() : null),
      location: p.manualLocation,
      source: "manual",
      interestBearingAt: null,
      adoptedAt: null,
      registeredReview: false,
    };
  }
  // Previously detected delivered (vehicle dropped off the stock report
  // after being taxed) — flag for human review.
  if (p.deliveredDetectedAt) {
    return { delivered: true, etaAt: null, location: null, source: "none", interestBearingAt: null, adoptedAt: null, registeredReview: true };
  }
  return { delivered: false, etaAt: null, location: null, source: "none", interestBearingAt: null, adoptedAt: null, registeredReview: false };
}
