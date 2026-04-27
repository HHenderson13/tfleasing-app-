import { listModels } from "@/lib/quote";
import { QuoteForm } from "./quote-form";
import { TopNav } from "@/components/top-nav";
import { requireQuoteAccess } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function QuotePage() {
  await requireQuoteAccess();
  const models = await listModels();
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="quote" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Quote</h1>
          <p className="mt-1 text-sm text-slate-500">Rank funders by monthly rental for a given vehicle and term.</p>
        </header>
        <QuoteForm models={models} />
      </main>
    </div>
  );
}
