import Link from "next/link";
import { listProposals } from "@/lib/proposals";
import { STATUS_LABELS } from "@/lib/proposal-constants";
import { TopNav } from "@/components/top-nav";
import { db } from "@/db";
import { proposals, proposalStageChecks, salesExecs, stageCheckDefs, stockVehicles } from "@/db/schema";
import { asc, eq, inArray, isNull, and } from "drizzle-orm";
import { ExecFilter } from "../exec-filter";
import { OrderRow, Section } from "../order-row";
import { ManualEtaEditor } from "./manual-row";
import { DeliveryEditor } from "./delivery-row";
import { ExpandableDelivery } from "./expandable-delivery";
import { matchProposalAgainstStock, type StockHit } from "@/lib/stock-match";
import { requireOrdersAccess } from "@/lib/auth-guard";
import { isAdmin } from "@/lib/auth";
import { StatTile } from "@/components/stat-tile";

export const dynamic = "force-dynamic";

type StockRow = StockHit;

type Match = {
  delivered: boolean;
  etaAt: Date | null;
  location: string | null;
  source: "stock-vin" | "stock-order" | "manual" | "none";
  interestBearingAt: Date | null;
  adoptedAt: Date | null;
  // Previously delivered (deliveredDetectedAt set) but no longer on the
  // current stock list — likely taxed off the report. Needs human review.
  registeredReview: boolean;
};

function isDeliveredStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  const u = s.toUpperCase();
  return u === "DELIVERED" || u === "DEALER";
}

function matchProposalToStock(
  p: { vin: string | null; orderNumber: string | null; manualEtaAt: Date | null; manualLocation: string | null; deliveredDetectedAt: Date | null },
  stock: StockRow[]
): Match {
  const { hit, source } = matchProposalAgainstStock(p, stock);
  if (hit) {
    const delivered = isDeliveredStatus(hit.locationStatus);
    return {
      delivered,
      etaAt: delivered ? null : hit.etaAt,
      location: hit.locationStatus,
      source: source === "vin" ? "stock-vin" : "stock-order",
      interestBearingAt: hit.interestBearingAt ?? null,
      adoptedAt: hit.adoptedAt ?? null,
      registeredReview: false,
    };
  }
  if (p.manualEtaAt || p.manualLocation) {
    const delivered = isDeliveredStatus(p.manualLocation);
    return {
      delivered,
      etaAt: delivered ? null : p.manualEtaAt,
      location: p.manualLocation,
      source: "manual",
      interestBearingAt: null,
      adoptedAt: null,
      registeredReview: false,
    };
  }
  // No live stock match. If we previously detected delivery, the vehicle has
  // probably dropped off the report after being taxed — surface for review.
  if (p.deliveredDetectedAt) {
    return {
      delivered: true,
      etaAt: null,
      location: null,
      source: "none",
      interestBearingAt: null,
      adoptedAt: null,
      registeredReview: true,
    };
  }
  return { delivered: false, etaAt: null, location: null, source: "none", interestBearingAt: null, adoptedAt: null, registeredReview: false };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function bucketKey(m: Match): string {
  if (m.delivered) return "delivered";
  if (!m.etaAt) return "tba";
  const d = m.etaAt;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(key: string): string {
  if (key === "delivered") return "Delivered";
  if (key === "tba") return "ETA to be confirmed";
  if (key === "bq") return "Group BQ";
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function bucketSortValue(key: string): number {
  if (key === "delivered") return -Infinity;
  if (key === "bq") return Infinity - 1;
  if (key === "tba") return Infinity;
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  return y * 12 + m;
}

export default async function OrdersAwaitingPage({
  searchParams,
}: {
  searchParams: Promise<{ exec?: string }>;
}) {
  const sp = await searchParams;
  const execFilter = sp.exec && sp.exec !== "all" ? sp.exec : null;
  const me = await requireOrdersAccess();
  const admin = isAdmin(me);

  const [rows, execs, stockRaw, deliveryDefs] = await Promise.all([
    listProposals("orders"),
    db.select().from(salesExecs).orderBy(asc(salesExecs.name)),
    db
      .select({
        vin: stockVehicles.vin,
        orderNo: stockVehicles.orderNo,
        dealerRaw: stockVehicles.dealerRaw,
        locationStatus: stockVehicles.locationStatus,
        etaAt: stockVehicles.etaAt,
        interestBearingAt: stockVehicles.interestBearingAt,
        adoptedAt: stockVehicles.adoptedAt,
      })
      .from(stockVehicles),
    db.select().from(stageCheckDefs).where(eq(stageCheckDefs.stage, "delivery")).orderBy(asc(stageCheckDefs.sortOrder), asc(stageCheckDefs.label)),
  ]);

  const stock: StockRow[] = stockRaw;

  const filtered = execFilter ? rows.filter((r) => r.salesExecId === execFilter) : rows;
  const awaiting = filtered.filter((r) => r.status === "awaiting_delivery");

  const ticksRaw = awaiting.length
    ? await db.select().from(proposalStageChecks).where(inArray(proposalStageChecks.proposalId, awaiting.map((p) => p.id)))
    : [];
  const ticksByProposal = new Map<string, Set<string>>();
  for (const t of ticksRaw) {
    if (!ticksByProposal.has(t.proposalId)) ticksByProposal.set(t.proposalId, new Set());
    ticksByProposal.get(t.proposalId)!.add(t.checkId);
  }

  type Bucketed = {
    p: typeof awaiting[number];
    match: Match;
  };
  const items: Bucketed[] = awaiting.map((p) => ({
    p,
    match: p.isGroupBq
      ? { delivered: false, etaAt: null, location: null, source: "none" as const, interestBearingAt: null, adoptedAt: null, registeredReview: false }
      : matchProposalToStock(p, stock),
  }));

  // Mark just-delivered: any awaiting deal observed delivered with no detected timestamp gets one now.
  const newlyDelivered = items
    .filter(({ p, match }) => match.delivered && !p.deliveredDetectedAt)
    .map(({ p }) => p.id);
  if (newlyDelivered.length) {
    await db
      .update(proposals)
      .set({ deliveredDetectedAt: new Date() })
      .where(and(inArray(proposals.id, newlyDelivered), isNull(proposals.deliveredDetectedAt)));
  }

  const groups = new Map<string, Bucketed[]>();
  for (const it of items) {
    const k = it.p.isGroupBq ? "bq" : bucketKey(it.match);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  // Within each month bucket, sort by ETA ascending so the earliest dates
  // surface at the top. Other buckets (tba/bq) keep insertion order. The
  // delivered bucket sorts so anything Adopted (worst) sits above Interest
  // Bearing, both above plain delivered.
  function ibStage(m: Match): number {
    const now = Date.now();
    if (m.registeredReview) return 3;
    if (m.adoptedAt && m.adoptedAt.getTime() <= now) return 2;
    if (m.interestBearingAt && m.interestBearingAt.getTime() <= now) return 1;
    return 0;
  }
  for (const [k, arr] of groups) {
    if (k === "tba" || k === "bq") continue;
    if (k === "delivered") {
      arr.sort((a, b) => ibStage(b.match) - ibStage(a.match));
      continue;
    }
    arr.sort((a, b) => (a.match.etaAt?.getTime() ?? 0) - (b.match.etaAt?.getTime() ?? 0));
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => bucketSortValue(a) - bucketSortValue(b));

  const total = items.length;
  const etaConfirmed = items.filter(({ match }) => !match.delivered && !!match.etaAt).length;
  const etaTba = items.filter(({ match }) => !match.delivered && !match.etaAt).length;
  const deliveryBooked = items.filter(({ p, match }) => !match.delivered && !!p.deliveryBookedAt).length;
  const arrivedAtUs = items.filter(({ match }) => match.delivered).length;
  const monthlySum = items.reduce((acc, { p }) => acc + (p.monthlyRental ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Awaiting delivery</h1>
            <p className="mt-1 text-sm text-slate-500">All actions completed — waiting for Ford to deliver to us, or for us to deliver to the customer.</p>
          </div>
          <div className="flex items-center gap-2">
            {admin && (
              <Link
                href="/orders/awaiting/new"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                + Add deal
              </Link>
            )}
            <ExecFilter
              execs={execs.map((e) => ({ id: e.id, name: e.name }))}
              value={execFilter ?? "all"}
            />
          </div>
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Awaiting" value={total} tone="slate" />
          <StatTile label="ETA confirmed" value={etaConfirmed} tone="sky" />
          <StatTile label="ETA TBA" value={etaTba} tone="amber" />
          <StatTile label="Arrived at us" value={arrivedAtUs} tone="emerald" />
          <StatTile label="Delivery booked" value={deliveryBooked} tone="teal" />
        </section>
        <div className="mt-2 text-right text-[11px] text-slate-400">Total monthly rental in pipeline: £{monthlySum.toFixed(2)}</div>

        {sortedKeys.length === 0 ? (
          <Section title="Awaiting delivery" empty="No deals waiting on delivery yet.">{[]}</Section>
        ) : (
          sortedKeys.map((key) => (
            <Section key={key} title={bucketLabel(key)} empty="">
              {groups.get(key)!.map(({ p, match }) => {
                const business = p.customer?.businessName ? ` · ${p.customer.businessName}` : "";
                const meta = `${p.funderName} · £${p.monthlyRental.toFixed(2)}/mo${business}${p.vin ? " · VIN " + p.vin : ""}${p.orderNumber ? " · Order " + p.orderNumber : ""}${p.isGroupBq ? " · Group BQ" + (p.groupSite ? " " + p.groupSite.name : "") : p.exec ? " · " + p.exec.name : ""}${p.isBroker && p.brokerName ? " · Broker: " + p.brokerName : ""}`;
                const expandable = p.isGroupBq || match.delivered;
                const rowEl = (
                  <OrderRow
                    id={p.id}
                    customerId={p.customer?.id ?? ""}
                    customer={p.customer?.name ?? "—"}
                    title={`${p.model} ${p.derivative}`}
                    meta={meta}
                    status={p.status as keyof typeof STATUS_LABELS}
                    href={expandable ? null : undefined}
                    right={
                      <div className="space-y-1 text-right">
                        {match.delivered && <IbAdoptedBadge match={match} />}
                        {!p.isGroupBq && <MatchBadge match={match} />}
                      </div>
                    }
                  />
                );
                const manualEditor =
                  !p.isGroupBq && (match.source === "none" || match.source === "manual") ? (
                    <ManualEtaEditor
                      proposalId={p.id}
                      initialEta={p.manualEtaAt ? p.manualEtaAt.toISOString().slice(0, 10) : null}
                      initialLocation={p.manualLocation}
                      lastUpdatedAt={p.manualEtaUpdatedAt ? p.manualEtaUpdatedAt.toISOString() : null}
                    />
                  ) : null;
                const deliveryEditor = expandable ? (
                  <DeliveryEditor
                    proposalId={p.id}
                    initialBookedAt={p.deliveryBookedAt ? p.deliveryBookedAt.toISOString().slice(0, 10) : null}
                    initialRegNumber={p.regNumber}
                    isGroupBq={p.isGroupBq}
                    checks={deliveryDefs
                      .filter((d) => p.isGroupBq ? d.appliesToBq : true)
                      .map((d) => ({ id: d.id, label: d.label, checked: ticksByProposal.get(p.id)?.has(d.id) ?? false }))}
                  />
                ) : null;
                return (
                  <div key={p.id}>
                    {expandable ? (
                      <ExpandableDelivery
                        orderId={p.id}
                        rowContent={rowEl}
                        deliveryContent={deliveryEditor}
                      />
                    ) : (
                      <>
                        {rowEl}
                        {manualEditor}
                      </>
                    )}
                  </div>
                );
              })}
            </Section>
          ))
        )}
      </main>
    </div>
  );
}

function IbAdoptedBadge({ match }: { match: Match }) {
  const now = Date.now();
  const adopted = match.adoptedAt && match.adoptedAt.getTime() <= now ? match.adoptedAt : null;
  const ib = match.interestBearingAt && match.interestBearingAt.getTime() <= now ? match.interestBearingAt : null;
  if (match.registeredReview) {
    return (
      <div className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
        Vehicle Registered – Review
      </div>
    );
  }
  if (!adopted && !ib) return null;
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (adopted) {
    return (
      <div className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
        Adopted · {fmt(adopted)}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
      Interest Bearing · {fmt(ib!)}
    </div>
  );
}

function MatchBadge({ match }: { match: Match }) {
  if (match.delivered) {
    return (
      <div className="text-right">
        <div className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
          Delivered
        </div>
        {match.location && <div className="mt-0.5 text-[10px] text-slate-400">{match.location}</div>}
      </div>
    );
  }
  if (match.etaAt) {
    return (
      <div className="text-right">
        <div className="text-xs font-medium text-slate-700">
          ETA {match.etaAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>
        {match.location && <div className="mt-0.5 text-[10px] text-slate-400">{match.location}</div>}
        {match.source === "manual" && <div className="text-[10px] text-amber-600">manual</div>}
      </div>
    );
  }
  // Matched in stock but no ETA yet (e.g. ORDERBANK — not in build yet).
  if (match.source === "stock-vin" || match.source === "stock-order") {
    const isOrderbank = (match.location ?? "").toUpperCase() === "ORDERBANK";
    return (
      <div className="text-right">
        <div className="text-xs font-medium text-slate-700">ETA TBA</div>
        {match.location && (
          <div className={`mt-0.5 text-[10px] ${isOrderbank ? "text-amber-600" : "text-slate-400"}`}>
            {match.location}{isOrderbank ? " · not in build" : ""}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="text-right">
      <div className="text-[11px] text-slate-400">No stock match</div>
      <div className="text-[10px] text-slate-400">enter ETA below</div>
    </div>
  );
}
