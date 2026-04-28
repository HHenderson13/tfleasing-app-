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

export const dynamic = "force-dynamic";

const TF_BRANCH_CODES = ["62133", "62134"];

type StockRow = {
  vin: string | null;
  orderNo: string | null;
  dealerRaw: string | null;
  locationStatus: string | null;
  etaAt: Date | null;
};

type Match = {
  delivered: boolean;
  etaAt: Date | null;
  location: string | null;
  source: "stock-vin" | "stock-order" | "manual" | "none";
};

function isDeliveredStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  const u = s.toUpperCase();
  return u === "DELIVERED" || u === "DEALER";
}

function matchProposalToStock(
  p: { vin: string | null; orderNumber: string | null; manualEtaAt: Date | null; manualLocation: string | null },
  stock: StockRow[]
): Match {
  if (p.vin) {
    const hit = stock.find((s) => s.vin === p.vin);
    if (hit) {
      const delivered = isDeliveredStatus(hit.locationStatus);
      return {
        delivered,
        etaAt: delivered ? null : hit.etaAt,
        location: hit.locationStatus,
        source: "stock-vin",
      };
    }
  }
  if (p.orderNumber) {
    const hit = stock.find(
      (s) =>
        s.orderNo === p.orderNumber &&
        s.dealerRaw &&
        TF_BRANCH_CODES.some((c) => s.dealerRaw!.includes(c))
    );
    if (hit) {
      const delivered = isDeliveredStatus(hit.locationStatus);
      return {
        delivered,
        etaAt: delivered ? null : hit.etaAt,
        location: hit.locationStatus,
        source: "stock-order",
      };
    }
  }
  if (p.manualEtaAt || p.manualLocation) {
    const delivered = isDeliveredStatus(p.manualLocation);
    return {
      delivered,
      etaAt: delivered ? null : p.manualEtaAt,
      location: p.manualLocation,
      source: "manual",
    };
  }
  return { delivered: false, etaAt: null, location: null, source: "none" };
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
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function bucketSortValue(key: string): number {
  if (key === "delivered") return -Infinity;
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
  const items: Bucketed[] = awaiting.map((p) => ({ p, match: matchProposalToStock(p, stock) }));

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
    const k = bucketKey(it.match);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
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
            <Link
              href="/orders/awaiting/new"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              + Add deal
            </Link>
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
                const meta = `${p.funderName} · £${p.monthlyRental.toFixed(2)}/mo${p.vin ? " · VIN " + p.vin : ""}${p.orderNumber ? " · Order " + p.orderNumber : ""}${p.isGroupBq ? " · Group BQ" + (p.groupSite ? " " + p.groupSite.name : "") : p.exec ? " · " + p.exec.name : ""}${p.isBroker && p.brokerName ? " · Broker: " + p.brokerName : ""}`;
                const sinceMs = (p.acceptedAt ?? p.createdAt).getTime();
                const ageDays = match.delivered ? null : Math.floor((Date.now() - sinceMs) / 86_400_000);
                return (
                  <div key={p.id}>
                    <OrderRow
                      id={p.id}
                      customerId={p.customer?.id ?? ""}
                      customer={p.customer?.name ?? "—"}
                      title={`${p.model} ${p.derivative}`}
                      meta={meta}
                      status={p.status as keyof typeof STATUS_LABELS}
                      right={
                        <div className="space-y-1 text-right">
                          {ageDays !== null && <AgeBadge days={ageDays} />}
                          <MatchBadge match={match} />
                        </div>
                      }
                    />
                    {match.source === "none" || match.source === "manual" ? (
                      <ManualEtaEditor
                        proposalId={p.id}
                        initialEta={p.manualEtaAt ? p.manualEtaAt.toISOString().slice(0, 10) : null}
                        initialLocation={p.manualLocation}
                        lastUpdatedAt={p.manualEtaUpdatedAt ? p.manualEtaUpdatedAt.toISOString() : null}
                      />
                    ) : null}
                    <DeliveryEditor
                      proposalId={p.id}
                      initialBookedAt={p.deliveryBookedAt ? p.deliveryBookedAt.toISOString().slice(0, 10) : null}
                      initialRegNumber={p.regNumber}
                      checks={deliveryDefs
                        .filter((d) => p.isGroupBq ? d.appliesToBq : true)
                        .map((d) => ({ id: d.id, label: d.label, checked: ticksByProposal.get(p.id)?.has(d.id) ?? false }))}
                    />
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

const TILE_TONES: Record<string, { bg: string; ring: string; text: string; num: string }> = {
  slate:   { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-600",   num: "text-slate-900" },
  sky:     { bg: "bg-sky-50",     ring: "ring-sky-200",     text: "text-sky-700",     num: "text-sky-900" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-700",   num: "text-amber-900" },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", num: "text-emerald-900" },
  teal:    { bg: "bg-teal-50",    ring: "ring-teal-200",    text: "text-teal-700",    num: "text-teal-900" },
};

function StatTile({ label, value, tone }: { label: string; value: number; tone: keyof typeof TILE_TONES }) {
  const t = TILE_TONES[tone];
  return (
    <div className={`rounded-2xl ${t.bg} px-4 py-3 ring-1 ${t.ring}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.num}`}>{value}</div>
    </div>
  );
}

function AgeBadge({ days }: { days: number }) {
  const tone =
    days >= 120 ? "bg-red-50 text-red-700 ring-red-200" :
    days >= 60  ? "bg-amber-50 text-amber-700 ring-amber-200" :
                  "bg-slate-50 text-slate-600 ring-slate-200";
  return (
    <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone}`}>
      {days}d in pipeline
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
  return (
    <div className="text-right">
      <div className="text-[11px] text-slate-400">No stock match</div>
      <div className="text-[10px] text-slate-400">enter ETA below</div>
    </div>
  );
}
