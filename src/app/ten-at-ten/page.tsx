import { isAdmin } from "@/lib/auth";
import { requireTenAtTenAccess } from "@/lib/auth-guard";
import { reportingHorizonFromInstant } from "@/lib/business-hours";
import { loadEnquiries, loadLatestEnquiryUploadAt } from "@/lib/enquiries";
import { logError } from "@/lib/logger";
import { loadMarketOverview, type MarketOverview } from "@/lib/market-overview";
import { creditOrders } from "@/lib/ten-at-ten-cancellations";
import { encodeOrders, encodeReport } from "@/lib/ten-at-ten-report";
import { applyBonuses } from "@/lib/ten-at-ten-extract";
import {
  listTenAtTenUploads, loadBonusRates, loadBudgets, loadCancellationsReport, loadExecNames, loadExtractLines,
  loadTenAtTenDeliveries, loadTenAtTenOrders, loadTenAtTenRows,
} from "@/lib/ten-at-ten-store";
import { ReportClient } from "./report";

import { AppBar, BarLink, PageTitle, StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TenAtTenPage() {
  // Admins and execs read the report; uploads and the manager's
  // cancellation notes stay admin-only (the actions re-check).
  const user = await requireTenAtTenAccess();
  const canManage = isAdmin(user);
  const [rows, heldOrders, heldDeliveries, budgets, names, uploads, responses, latestResponseUpload, extract, bonusRates, market] = await Promise.all([
    loadTenAtTenRows(), loadTenAtTenOrders(), loadTenAtTenDeliveries(), loadBudgets(), loadExecNames(), listTenAtTenUploads(1),
    loadEnquiries(), loadLatestEnquiryUploadAt(), loadExtractLines(), loadBonusRates(),
    // The latest scrape's digest. A problem there mustn't take the rest of
    // the report down with it.
    loadMarketOverview().catch((e): MarketOverview | null => { logError("ten-at-ten/market", e); return null; }),
  ]);
  // Response times only judges an enquiry once it has had a full working
  // day, measured from the latest MotorComplete upload (business-hours.ts).
  const reportHorizon = latestResponseUpload == null ? null : reportingHorizonFromInstant(latestResponseUpload);
  // Cancellations are matched against the Dealbook. Orders counts what
  // Dealerweb's latest order list carries — an order we still hold that was
  // later cancelled, or an old copy of one, is left out — and a Re-Write's
  // re-order counts on the original order day, not the day it was keyed
  // again; the Orders tab says how many.
  const { views: cancellations, originalIds, leftOutIds, rewriteOrderDays } = await loadCancellationsReport(names);
  // Ford's quarterly bonus on each deal, by its delivery month, on the Basic
  // from its Dealbook Extract line. Only the orders the tab shows are
  // matched: an old copy of an order (DEA Gate's vans before their
  // description changed) would otherwise take the live copy's extract line.
  // Matched on the real order day, so before a Re-Write is moved below.
  const { orders, deliveries } = applyBonuses({
    orders: heldOrders.filter((o) => !leftOutIds.has(o.id)), deliveries: heldDeliveries, extract, rates: bonusRates, names,
  });
  const { lines: liveOrders, moved: rewriteMoves } = creditOrders(orders, leftOutIds, rewriteOrderDays);
  const cancelledOrderDays = heldOrders.filter((o) => originalIds.has(o.id)).map((o) => o.orderDay);
  const payload = encodeReport(rows, names);
  const ordersPayload = encodeOrders(liveOrders, names);
  const deliveriesPayload = encodeOrders(deliveries, names);
  // "Today" in UK time, resolved on the server so the first render and the
  // browser agree on which day, week, month and quarter are current.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const lastUpload = uploads[0]?.uploadedAt
    ? uploads[0].uploadedAt.toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppBar width="7xl">{canManage && <BarLink href="/ten-at-ten/admin">Upload data</BarLink>}</AppBar>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <PageTitle title="10 at 10" pill={lastUpload ? <StatusPill>{`Last upload ${lastUpload}`}</StatusPill> : undefined}>
          Enquiries and conversion, response times, orders and profit, deliveries against budget, cancellations and the market.
        </PageTitle>
        <ReportClient payload={payload} orders={ordersPayload} deliveries={deliveriesPayload} budgets={budgets}
          responses={responses} reportHorizon={reportHorizon} today={today}
          cancellations={cancellations} cancelledOrderDays={cancelledOrderDays} rewriteMoves={rewriteMoves} market={market} canManage={canManage} />
      </main>
    </div>
  );
}
