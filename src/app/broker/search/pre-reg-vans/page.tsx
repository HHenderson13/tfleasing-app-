import { requireBrokerUser } from "@/lib/auth-guard";
import { BrokerHeader } from "../../header";

export const dynamic = "force-dynamic";

// Pre-registered vans require a separate data source — they're not in the
// regular Dealerweb stock report. Phase 4 wires the admin upload flow;
// for now this page tells brokers it's coming so they don't bookmark a
// 404.
export default async function BrokerPreRegVanSearchPage() {
  const me = await requireBrokerUser();
  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/search/pre-reg-vans" />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center sm:p-12">
          <div className="text-4xl">🚐</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Pre-registered vans</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Pre-reg van data lives in a separate feed from the new-vehicle list. Once your TrustFord contact
            has uploaded it on the admin side, the stock will appear here with the same filter and quoting
            experience as new cars and vans.
          </p>
        </div>
      </main>
    </div>
  );
}
