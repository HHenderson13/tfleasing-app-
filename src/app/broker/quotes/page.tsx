import { requireBrokerUser } from "@/lib/auth-guard";
import { BrokerHeader } from "../header";

export const dynamic = "force-dynamic";

// Phase 3 wires this up to real saved quotes. For now it's a placeholder
// so the nav doesn't 404 and brokers can confirm the route lands somewhere.
export default async function BrokerSavedQuotesPage() {
  const me = await requireBrokerUser();
  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quotes" />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center sm:p-12">
          <div className="text-4xl">📝</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Saved quotes</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Quotes you save will show here, shared with everyone at <strong>{me.brokerName}</strong>.
            The quoting engine ships in the next phase — start a quote from any vehicle on the
            New car or New van search to try the flow.
          </p>
        </div>
      </main>
    </div>
  );
}
