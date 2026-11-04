import { PageShell, PageTitle, StatusPill } from "@/components/ui";
import { StockBrowser, type StockRow } from "@/components/stock-browser";
import { requireStockAccess } from "@/lib/auth-guard";
import { loadMappedStock } from "@/lib/stock-list";

export const dynamic = "force-dynamic";

export default async function PublicStockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStockAccess();
  // ?q= starts the search, e.g. from a Customer Profile's "Check stock" link.
  const q = String((await searchParams).q ?? "").slice(0, 80);
  const { rows, latestUploadedAt } = await loadMappedStock();
  // Mapped rows are the full, unredacted superset StockRow expects — the
  // broker view is the same rows with fields stripped (see
  // redactForBroker in lib/stock-list.ts), not a different pipeline.
  const out: StockRow[] = rows;
  return (
    <PageShell width="7xl">
      <PageTitle title="Available stock"
        pill={latestUploadedAt ? <StatusPill>{`Updated ${new Date(latestUploadedAt).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}</StatusPill> : undefined}>
        {`${out.length.toLocaleString("en-GB")} vehicles in stock. Use the filters to narrow it down, or paste a broker's TF- reference into the search to jump straight to their vehicle.`}
      </PageTitle>
      <StockBrowser rows={out} audience="tf" initialQuery={q} />
    </PageShell>
  );
}
