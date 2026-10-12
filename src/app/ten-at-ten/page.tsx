import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { reportingHorizonFromInstant } from "@/lib/business-hours";
import { loadEnquiries, loadLatestEnquiryUploadAt } from "@/lib/enquiries";
import { encodeOrders, encodeReport } from "@/lib/ten-at-ten-report";
import { listTenAtTenUploads, loadBudgets, loadExecNames, loadTenAtTenDeliveries, loadTenAtTenOrders, loadTenAtTenRows } from "@/lib/ten-at-ten-store";
import { ReportClient } from "./report";

export const dynamic = "force-dynamic";

export default async function TenAtTenPage() {
  await requireAdmin();
  const [rows, orders, deliveries, budgets, names, uploads, responses, latestResponseUpload] = await Promise.all([
    loadTenAtTenRows(), loadTenAtTenOrders(), loadTenAtTenDeliveries(), loadBudgets(), loadExecNames(), listTenAtTenUploads(1),
    loadEnquiries(), loadLatestEnquiryUploadAt(),
  ]);
  // Response times only judges an enquiry once it has had a full working
  // day, measured from the latest MotorComplete upload (business-hours.ts).
  const reportHorizon = latestResponseUpload == null ? null : reportingHorizonFromInstant(latestResponseUpload);
  const payload = encodeReport(rows, names);
  const ordersPayload = encodeOrders(orders, names);
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
          <Link href="/ten-at-ten/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
            Upload data
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">10 at 10</h1>
            <p className="text-sm text-slate-500">Enquiries and conversion, response times against target, orders and profit, and deliveries against budget.</p>
          </div>
          {lastUpload && <p className="text-xs text-slate-400">Last upload {lastUpload}</p>}
        </div>
        <ReportClient payload={payload} orders={ordersPayload} deliveries={deliveriesPayload} budgets={budgets}
          responses={responses} reportHorizon={reportHorizon} today={today} />
      </main>
    </div>
  );
}
