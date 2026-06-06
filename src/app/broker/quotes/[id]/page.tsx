import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { brokerUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireBrokerUser } from "@/lib/auth-guard";
import { loadBrokerQuote, parseVehicleSnapshot } from "@/lib/broker-quotes";
import { FUNDING_ROUTES, formatGbp, type FundingRoute } from "@/lib/broker-quote-pricing";
import { BrokerHeader } from "../../header";
import { QuoteActions } from "./actions-ui";

export const dynamic = "force-dynamic";

export default async function BrokerQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireBrokerUser();
  const { id } = await params;
  const quote = await loadBrokerQuote(me.brokerId, id);
  if (!quote) notFound();
  const [creator] = await db.select({ name: brokerUsers.name }).from(brokerUsers).where(eq(brokerUsers.id, quote.createdByBrokerUserId)).limit(1);
  const snap = parseVehicleSnapshot(quote.vehicleSnapshot);
  const route = (quote.fundingRoute in FUNDING_ROUTES) ? FUNDING_ROUTES[quote.fundingRoute as FundingRoute] : quote.fundingRoute;

  return (
    <div className="min-h-screen bg-slate-50">
      <BrokerHeader me={me} pathname="/broker/quotes" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/broker/quotes" className="text-xs text-slate-500 hover:text-slate-900">← All saved quotes</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{route} quote</h1>
            <div className="mt-1 text-xs text-slate-400">
              Reference <span className="font-mono font-semibold text-slate-700">{quote.vehicleRef}</span>
              <span className="mx-2">·</span>
              Saved {new Date(quote.updatedAt).toLocaleString("en-GB")} by {creator?.name ?? "Unknown"}
            </div>
          </div>
          <QuoteActions quoteId={quote.id} />
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Vehicle</h2>
          {snap ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-base font-semibold text-slate-900">{snap.bucket}</span>
                <span className="text-base text-slate-700">{snap.variant}</span>
                {snap.derivative && <span className="text-xs text-slate-500">· {snap.derivative}</span>}
                {snap.modelYear && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{snap.modelYear}</span>}
              </div>
              <div className="text-[11px] text-slate-500 space-x-2">
                {snap.bodyStyle && <span>{snap.bodyStyle}</span>}
                {snap.engine && <span>· {snap.engine}</span>}
                {snap.transmission && <span>· {snap.transmission}</span>}
                {snap.drive && <span>· {snap.drive}</span>}
                <span>· {snap.colour}</span>
              </div>
              {snap.options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {snap.options.map((o, i) => (
                    <span key={i} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-100">{o}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Vehicle snapshot unavailable.</p>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Customer</h2>
          <div className="mt-2 text-sm">
            {quote.customerType === "business" ? "Business" : "Retail / personal"}
            {quote.customerType === "business" && (
              <span className="ml-2 text-xs text-slate-500">
                {quote.customerIsVatBusiness ? "VAT registered" : "Not VAT registered"}
              </span>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pricing</h2>
          <dl className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <Row label="Vehicle cash" value={formatGbp(quote.vehicleCashGbp)} />
            {quote.stockTurnBonusGbp && quote.stockTurnBonusGbp > 0 && (
              <Row label="Stock turn bonus" value={<span className="text-emerald-700">− {formatGbp(quote.stockTurnBonusGbp)}</span>} />
            )}
            <Row label="Your commission" value={formatGbp(quote.commissionExVatGbp)} />
            <Row label="VAT on commission (20%)" value={formatGbp(quote.commissionVatGbp)} />
            <div className="my-1 border-t border-slate-200" />
            <Row label={<strong>Customer pays</strong>} value={<strong className="text-slate-900">{formatGbp(quote.customerTotalGbp)}</strong>} />
          </dl>
        </section>

        {quote.notes && (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{quote.notes}</p>
          </section>
        )}

        <p className="mt-6 text-[11px] text-slate-400">
          Send this quote to your TrustFord contact and quote the reference <span className="font-mono font-semibold text-slate-700">{quote.vehicleRef}</span> — they&apos;ll match it back to the right vehicle.
        </p>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
