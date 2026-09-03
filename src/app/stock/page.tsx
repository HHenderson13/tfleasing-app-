import { TopNav } from "@/components/top-nav";
import { StockBrowser, type StockRow } from "@/components/stock-browser";
import { requireStockAccess } from "@/lib/auth-guard";
import { loadMappedStock } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

export default async function PublicStockPage() {
  await requireStockAccess();
  const { rows, latestUploadedAt } = await loadMappedStock();
  // Mapped rows are the full, unredacted superset StockRow expects — the
  // broker view is the same rows with fields stripped (see
  // redactForBroker in lib/stock-list.ts), not a different pipeline.
  const out: StockRow[] = rows;
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="stock" />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Available stock</h1>
            <p className="mt-1 text-sm text-slate-500">
              {out.length.toLocaleString()} vehicles in stock. Use the filters to narrow down, or paste a
              broker&rsquo;s <span className="font-mono text-slate-600">TF-</span> reference into search to jump straight to their vehicle.
              {latestUploadedAt && (
                <> · <span className="text-slate-400">Updated {new Date(latestUploadedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="mt-6">
          <StockBrowser rows={out} audience="tf" />
        </div>
      </main>
    </div>
  );
}
