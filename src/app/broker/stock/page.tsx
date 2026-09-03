import { StockBrowser } from "@/components/stock-browser";
import { BrokerHeader } from "../header";
import { WatermarkFrame } from "../watermark-frame";
import { requireBrokerTermsAccepted } from "@/lib/auth-guard";
import { loadMappedStock, redactForBroker } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

// The broker stock list. Same rows, same pipeline and the same component
// as /stock — the differences live in redactForBroker() (what leaves the
// server) and the audience="broker" prop (what gets rendered). Changes to
// the TF stock view land here automatically; that's the point.
//
// WatermarkFrame wraps it: every broker-facing screen is stamped with the
// viewer's identity and carries the capture deterrents. See
// lib/broker-watermark.ts for what that does and does not achieve.
export default async function BrokerStockPage() {
  const me = await requireBrokerTermsAccepted();
  const { rows, latestUploadedAt } = await loadMappedStock();
  const out = redactForBroker(rows);
  return (
    <WatermarkFrame me={me}>
      <div className="min-h-screen bg-slate-50">
        <BrokerHeader me={me} pathname="/broker/stock" />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Available stock</h1>
              <p className="mt-1 text-sm text-slate-500">
                {out.length.toLocaleString()} vehicles. Filter by availability to see what&rsquo;s in stock now or
                landing in a given month.
                {latestUploadedAt && (
                  <> · <span className="text-slate-400">Updated {new Date(latestUploadedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></>
                )}
              </p>
            </div>
          </div>
          <div className="mt-6">
            <StockBrowser rows={out} audience="broker" enquiryFrom={{ name: me.name, brokerName: me.brokerName }} />
          </div>
        </main>
      </div>
    </WatermarkFrame>
  );
}
