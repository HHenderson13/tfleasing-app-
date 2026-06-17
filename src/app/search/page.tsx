import Link from "next/link";
import { db } from "@/db";
import { customers, proposals, salesExecs } from "@/db/schema";
import { inArray, like, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth-guard";
import { canSeeProposals, isAdmin, isExec } from "@/lib/auth";
import { statusColor, statusLabel } from "@/lib/proposal-constants";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const canProps = canSeeProposals(me);
  const execScope = isExec(me) && !isAdmin(me) ? me.salesExecId ?? null : null;

  let custResults: { id: string; name: string; businessName: string | null }[] = [];
  let propResults: {
    id: string; customerId: string; customerName: string; businessName: string | null;
    model: string; derivative: string; status: string;
    funderName: string; financeProposalNumber: string | null; vin: string | null;
    orderNumber: string | null; regNumber: string | null;
    execName: string | null; brokerName: string | null;
  }[] = [];

  if (q && canProps) {
    const like_ = `%${q}%`;

    // Customers — match on personal name OR business name so "Acme Ltd"
    // surfaces every personal contact at that business too.
    const custRows = await db
      .select()
      .from(customers)
      .where(or(
        like(customers.name, like_),
        like(customers.businessName, like_),
      ))
      .limit(50);

    // Proposals — direct field match across every identifier a user might
    // search by. Covers every status (proposal received → delivered) since
    // we don't filter by status.
    const propRowsDirect = await db
      .select()
      .from(proposals)
      .where(
        or(
          like(proposals.financeProposalNumber, like_),
          like(proposals.vin, like_),
          like(proposals.orderNumber, like_),
          like(proposals.regNumber, like_),
          like(proposals.model, like_),
          like(proposals.derivative, like_),
          like(proposals.brokerName, like_),
        ),
      )
      .limit(100);

    // ALSO pull every proposal belonging to a customer that matched on
    // name/business — this is the fix for "search by business name only
    // shows the customer, not their deals". Without this, an "Acme Ltd"
    // search would miss every Acme proposal whose own fields didn't
    // contain the word.
    const matchedCustIds = custRows.map((c) => c.id);
    const propRowsByCust = matchedCustIds.length
      ? await db.select().from(proposals).where(inArray(proposals.customerId, matchedCustIds)).limit(200)
      : [];

    // Merge the two proposal sets, deduping on id.
    const seen = new Set<string>();
    const propRows = [...propRowsDirect, ...propRowsByCust].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Build a customer-id → row map covering both the customer matches
    // and any extras referenced by direct proposal matches.
    const custMap = new Map(custRows.map((c) => [c.id, c]));
    const missingCustIds = propRows.map((p) => p.customerId).filter((id) => !custMap.has(id));
    if (missingCustIds.length) {
      const more = await db
        .select()
        .from(customers)
        .where(inArray(customers.id, [...new Set(missingCustIds)]));
      for (const c of more) custMap.set(c.id, c);
    }
    const execRows = await db.select().from(salesExecs);
    const execMap = new Map(execRows.map((e) => [e.id, e.name]));

    custResults = custRows.map((c) => ({
      id: c.id,
      name: c.name,
      businessName: c.businessName ?? null,
    }));

    propResults = propRows
      .filter((p) => !execScope || p.salesExecId === execScope)
      .map((p) => {
        const cust = custMap.get(p.customerId);
        return {
          id: p.id,
          customerId: p.customerId,
          customerName: cust?.name ?? "—",
          businessName: cust?.businessName ?? null,
          model: p.model,
          derivative: p.derivative,
          status: p.status,
          funderName: p.funderName,
          financeProposalNumber: p.financeProposalNumber,
          vin: p.vin,
          orderNumber: p.orderNumber,
          regNumber: p.regNumber,
          execName: p.salesExecId ? execMap.get(p.salesExecId) ?? null : null,
          brokerName: p.brokerName,
        };
      });

    // Sort proposals so the most recently touched land first — every
    // proposal returned could be at any stage of the pipeline.
    propResults.sort((a, b) => a.customerName.localeCompare(b.customerName));

    if (execScope) {
      const allowedCustIds = new Set(propResults.map((p) => p.customerId));
      custResults = custResults.filter((c) => allowedCustIds.has(c.id));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">← Back to home</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Search</h1>
        <form className="mt-4">
          <input
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Name, business, finance prop #, VIN, order #, reg, broker, model…"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
          />
        </form>

        {!canProps && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Your role doesn&apos;t have access to proposal data — search is unavailable.
          </p>
        )}

        {q && canProps && (
          <div className="mt-8 space-y-8">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Customers ({custResults.length})</h2>
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {custResults.map((c) => (
                  <li key={c.id}>
                    <Link href={`/customers/${c.id}`} className="block px-4 py-2 text-sm hover:bg-slate-50">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.businessName && (
                        <div className="text-[11px] text-slate-500">{c.businessName}</div>
                      )}
                    </Link>
                  </li>
                ))}
                {custResults.length === 0 && <li className="px-4 py-3 text-xs text-slate-400">No customers</li>}
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Proposals ({propResults.length})</h2>
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {propResults.map((p) => {
                  const tone = statusColor(p.status);
                  return (
                    <li key={p.id}>
                      <Link href={`/customers/${p.customerId}`} className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                        <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
                          {statusLabel(p.status)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900">
                            {p.customerName}
                            {p.businessName && <span className="ml-1.5 text-[11px] font-normal text-slate-500">· {p.businessName}</span>}
                          </div>
                          <div className="text-xs text-slate-600">{p.model} {p.derivative} · {p.funderName}</div>
                          <div className="text-[11px] text-slate-400">
                            {p.financeProposalNumber && <>FP: {p.financeProposalNumber} · </>}
                            {p.orderNumber && <>Order: {p.orderNumber} · </>}
                            {p.vin && <>VIN: {p.vin} · </>}
                            {p.regNumber && <>Reg: {p.regNumber} · </>}
                            {p.brokerName && <>Broker: {p.brokerName}</>}
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">{p.execName ?? "—"}</span>
                      </Link>
                    </li>
                  );
                })}
                {propResults.length === 0 && <li className="px-4 py-3 text-xs text-slate-400">No proposals</li>}
              </ul>
            </section>
          </div>
        )}

        {!q && (
          <p className="mt-6 text-sm text-slate-500">
            Search across every stage of the pipeline — proposals, in-order, awaiting delivery, delivered.
            Matches on customer name, business name, finance proposal #, VIN, order #, reg, broker, and vehicle model.
          </p>
        )}
      </main>
    </div>
  );
}
