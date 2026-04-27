import Link from "next/link";
import { db } from "@/db";
import { customers, proposals, salesExecs } from "@/db/schema";
import { like, or } from "drizzle-orm";
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

  let custResults: { id: string; name: string }[] = [];
  let propResults: {
    id: string; customerId: string; customerName: string;
    model: string; derivative: string; status: string;
    funderName: string; financeProposalNumber: string | null; vin: string | null; orderNumber: string | null;
    execName: string | null;
  }[] = [];

  if (q && canProps) {
    const like_ = `%${q}%`;
    const custRows = await db.select().from(customers).where(like(customers.name, like_)).limit(50);
    custResults = custRows.map((c) => ({ id: c.id, name: c.name }));

    const propRows = await db
      .select()
      .from(proposals)
      .where(
        or(
          like(proposals.financeProposalNumber, like_),
          like(proposals.vin, like_),
          like(proposals.orderNumber, like_),
          like(proposals.model, like_),
          like(proposals.derivative, like_),
        ),
      )
      .limit(100);

    const custMap = new Map(custRows.map((c) => [c.id, c.name]));
    const missingCustIds = propRows.map((p) => p.customerId).filter((id) => !custMap.has(id));
    if (missingCustIds.length) {
      const more = await db.select().from(customers);
      for (const c of more) custMap.set(c.id, c.name);
    }
    const execRows = await db.select().from(salesExecs);
    const execMap = new Map(execRows.map((e) => [e.id, e.name]));

    propResults = propRows
      .filter((p) => !execScope || p.salesExecId === execScope)
      .map((p) => ({
        id: p.id,
        customerId: p.customerId,
        customerName: custMap.get(p.customerId) ?? "—",
        model: p.model,
        derivative: p.derivative,
        status: p.status,
        funderName: p.funderName,
        financeProposalNumber: p.financeProposalNumber,
        vin: p.vin,
        orderNumber: p.orderNumber,
        execName: p.salesExecId ? execMap.get(p.salesExecId) ?? null : null,
      }));

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
            placeholder="Customer, finance proposal #, VIN, order #, model…"
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
                      <span className="font-medium text-slate-900">{c.name}</span>
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
                          <div className="font-medium text-slate-900">{p.customerName}</div>
                          <div className="text-xs text-slate-600">{p.model} {p.derivative} · {p.funderName}</div>
                          <div className="text-[11px] text-slate-400">
                            {p.financeProposalNumber && <>FP: {p.financeProposalNumber} · </>}
                            {p.orderNumber && <>Order: {p.orderNumber} · </>}
                            {p.vin && <>VIN: {p.vin}</>}
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
            Search across customers, finance proposal numbers, VINs, order numbers, and vehicle models.
          </p>
        )}
      </main>
    </div>
  );
}
