import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { requireTenAtTenAccess } from "@/lib/auth-guard";
import { reportingHorizonFromInstant } from "@/lib/business-hours";
import { loadEnquiries, loadLatestEnquiryUploadAt } from "@/lib/enquiries";
import { logError } from "@/lib/logger";
import { loadMarketOverview, type MarketOverview } from "@/lib/market-overview";
import { encodeOrders, encodeReport } from "@/lib/ten-at-ten-report";
import {
  listTenAtTenUploads, loadBudgets, loadCancellationsReport, loadExecNames, loadTenAtTenDeliveries, loadTenAtTenOrders, loadTenAtTenRows,
} from "@/lib/ten-at-ten-store";
import { ReportClient } from "./report";

export const dynamic = "force-dynamic";

export default async function TenAtTenPage() {
  // Admins and execs read the report; uploads and the manager's
  // cancellation notes stay admin-only (the actions re-check).
  const user = await requireTenAtTenAccess();
  const canManage = isAdmin(user);
  const [rows, orders, deliveries, budgets, names, uploads, responses, latestResponseUpload, market] = await Promise.all([
    loadTenAtTenRows(), loadTenAtTenOrders(), loadTenAtTenDeliveries(), loadBudgets(), loadExecNames(), listTenAtTenUploads(1),
    loadEnquiries(), loadLatestEnquiryUploadAt(),
    // The latest scrape's digest. A problem there mustn't take the rest of
    // the report down with it.
    loadMarketOverview().catch((e): MarketOverview | null => { logError("ten-at-ten/market", e); return null; }),
  ]);
  // Response times only judges an enquiry once it has had a full working
  // day, measured from the latest MotorComplete upload (business-hours.ts).
  const reportHorizon = latestResponseUpload == null ? null : reportingHorizonFromInstant(latestResponseUpload);
  // Cancellations are matched against the Dealbook. An order we still hold
  // that was later cancelled is left out of Orders, as Dealerweb's own
  // order list drops it; the Orders tab says how many.
  const { views: cancellations, originalIds } = await loadCancellationsReport(names);
  const liveOrders = orders.filter((o) => !originalIds.has(o.id));
  const cancelledOrderDays = orders.filter((o) => originalIds.has(o.id)).map((o) => o.orderDay);
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-sm">
          <Link href="/" className="text-slate-500 hover:text-slate-900">← Home</Link>
          {canManage && (
            <Link href="/ten-at-ten/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
              Upload data
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">10 at 10</h1>
            <p className="text-sm text-slate-500">Enquiries and conversion, response times, orders and profit, deliveries against budget, cancellations and the market.</p>
          </div>
          {lastUpload && <p className="text-xs text-slate-400">Last upload {lastUpload}</p>}
        </div>
        <ReportClient payload={payload} orders={ordersPayload} deliveries={deliveriesPayload} budgets={budgets}
          responses={responses} reportHorizon={reportHorizon} today={today}
          cancellations={cancellations} cancelledOrderDays={cancelledOrderDays} market={market} canManage={canManage} />
      </main>
    </div>
  );
}
