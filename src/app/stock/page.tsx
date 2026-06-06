import { TopNav } from "@/components/top-nav";
import { StockBrowser, type StockRow } from "./browser";
import { requireStockAccess } from "@/lib/auth-guard";
import { loadMappedStock } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

export default async function PublicStockPage() {
  await requireStockAccess();
  const { rows, latestUploadedAt } = await loadMappedStock();
  // Mapped rows have the exact superset of fields StockRow expects, so
  // this cast is safe — kept as a thin alias so future TF-only fields
  // can be added in StockRow without forking the broker pipeline.
  const out = rows as StockRow[];
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="stock" />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Available stock</h1>
            <p className="mt-1 text-sm text-slate-500">
              {out.length.toLocaleString()} vehicles in stock. Use the filters to narrow down.
              {latestUploadedAt && (
                <> · <span className="text-slate-400">Updated {new Date(latestUploadedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="mt-6">
          <StockBrowser rows={out} />
        </div>
      </main>
    </div>
  );
}
