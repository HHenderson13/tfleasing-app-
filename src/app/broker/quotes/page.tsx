import Link from "next/link";
import { db } from "@/db";
import { brokerUsers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireBrokerUser } from "@/lib/auth-guard";
import { listBrokerQuotes, parseVehicleSnapshot } from "@/lib/broker-quotes";
import { FUNDING_ROUTES, formatGbp, type FundingRoute } from "@/lib/broker-quote-pricing";
import { BrokerHeader } from "../header";

export const dynamic = "force-dynamic";

export default async function BrokerSavedQuotesPage() {
  const me = await requireBrokerUser();
  const quotes = await listBrokerQuotes(me.brokerId);

  // One follow-up query for every broker user mentioned on any quote so
  // we can show the "Saved by …" line. Cheap — there are at most a few
  // users at a typical broker.
  const userIds = Array.from(new Set(quotes.map((q) => q.createdByBrokerUserId)));
  const userRows = userIds.length
    ? await db.select({ id: brokerUsers.id, name: brokerUsers.name }).from(brokerUsers).where(inArray(brokerUsers.id, userIds))
    : [];
  const userName = new Map(userRows.map((u) => [u.id, u.name]));

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quotes" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Saved quotes</h1>
            <p className="mt-1 text-sm text-slate-500">
              Shared across everyone at <strong>{me.brokerName}</strong>.
            </p>
          </div>
          <Link href="/broker/search/new-car" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
            Start a new quote
          </Link>
        </div>

        {quotes.length === 0 ? (
          <div className="mt-8 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No quotes saved yet. Start one from a vehicle on <Link href="/broker/search/new-car" className="font-medium text-slate-700 underline">New cars</Link> or <Link href="/broker/search/new-van" className="font-medium text-slate-700 underline">New vans</Link>.
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {quotes.map((q) => {
              const snap = parseVehicleSnapshot(q.vehicleSnapshot);
              const route = (q.fundingRoute in FUNDING_ROUTES) ? FUNDING_ROUTES[q.fundingRoute as FundingRoute] : q.fundingRoute;
              return (
                <Link
                  key={q.id}
                  href={`/broker/quotes/${q.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold text-slate-900">{snap?.bucket ?? "—"}</span>
                        <span className="text-sm text-slate-700">{snap?.variant ?? ""}</span>
                        {snap?.derivative && <span className="text-xs text-slate-500">· {snap.derivative}</span>}
                        {snap?.modelYear && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{snap.modelYear}</span>}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 space-x-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{route}</span>
                        <span>· Ref <span className="font-mono">{q.vehicleRef}</span></span>
                        <span>· Saved {new Date(q.updatedAt).toLocaleDateString("en-GB")}</span>
                        <span>· by {userName.get(q.createdByBrokerUserId) ?? "Unknown"}</span>
                      </div>
                      {q.notes && <div className="mt-1.5 line-clamp-1 text-xs text-slate-500">&ldquo;{q.notes}&rdquo;</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Customer pays</div>
                      <div className="text-lg font-semibold tabular-nums text-slate-900">{formatGbp(q.customerTotalGbp)}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
