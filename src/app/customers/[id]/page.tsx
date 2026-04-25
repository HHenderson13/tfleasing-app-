import { notFound } from "next/navigation";
import Link from "next/link";
import { countDeclinedForCustomer, getCustomerTimeline } from "@/lib/proposals";
import { CustomerTimeline } from "./timeline";
import { TopNav } from "@/components/top-nav";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCustomerTimeline(id);
  if (!data) notFound();
  const declinedCount = await countDeclinedForCustomer(id);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="proposals" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link href="/proposals" className="text-xs text-slate-500 hover:text-slate-900">← All proposals</Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{data.customer.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data.items.length} proposal{data.items.length === 1 ? "" : "s"} · {declinedCount} declined
            </p>
          </div>
        </div>
        <div className="mt-6">
          <CustomerTimeline
            customerId={id}
            declinedCount={declinedCount}
            items={data.items.map((it) => ({
              proposal: {
                id: it.proposal.id,
                model: it.proposal.model,
                derivative: it.proposal.derivative,
                contract: it.proposal.contract,
                maintenance: it.proposal.maintenance,
                termMonths: it.proposal.termMonths,
                annualMileage: it.proposal.annualMileage,
                initialRentalMultiplier: it.proposal.initialRentalMultiplier,
                funderId: it.proposal.funderId,
                funderName: it.proposal.funderName,
                funderRank: it.proposal.funderRank,
                financeProposalNumber: it.proposal.financeProposalNumber,
                monthlyRental: it.proposal.monthlyRental,
                status: it.proposal.status,
                underwritingNotes: it.proposal.underwritingNotes,
                acceptedAt: it.proposal.acceptedAt ? it.proposal.acceptedAt.toISOString() : null,
                createdAt: it.proposal.createdAt.toISOString(),
                updatedAt: it.proposal.updatedAt.toISOString(),
                isBroker: it.proposal.isBroker,
                brokerName: it.proposal.brokerName,
                brokerEmail: it.proposal.brokerEmail,
                isGroupBq: it.proposal.isGroupBq,
              },
              exec: it.exec ? { id: it.exec.id, name: it.exec.name, email: it.exec.email } : null,
              groupSite: it.groupSite ? { id: it.groupSite.id, name: it.groupSite.name } : null,
              events: it.events.map((e) => ({
                id: e.id,
                kind: e.kind,
                fromStatus: e.fromStatus,
                toStatus: e.toStatus,
                note: e.note,
                createdAt: e.createdAt.toISOString(),
              })),
            }))}
          />
        </div>
      </main>
    </div>
  );
}
