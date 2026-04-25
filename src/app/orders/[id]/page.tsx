import Link from "next/link";
import { notFound } from "next/navigation";
import { getProposalWithContext } from "@/lib/proposals";
import { TopNav } from "@/components/top-nav";
import { OrderDetail } from "./detail";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getProposalWithContext(id);
  if (!ctx) notFound();
  const p = ctx.proposal;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Link href="/orders" className="text-xs text-slate-500 hover:text-slate-900">← Orders</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{ctx.customer?.name ?? "—"}</h1>
            <p className="mt-1 text-sm text-slate-500">{p.model} {p.derivative}</p>
          </div>
          {ctx.customer && (
            <Link href={`/customers/${ctx.customer.id}`} className="text-xs font-medium text-slate-500 hover:text-slate-900">
              View full timeline →
            </Link>
          )}
        </div>

        <OrderDetail
          proposal={{
            id: p.id,
            status: p.status,
            funderId: p.funderId,
            funderName: p.funderName,
            funderRank: p.funderRank,
            financeProposalNumber: p.financeProposalNumber,
            model: p.model,
            derivative: p.derivative,
            contract: p.contract,
            maintenance: p.maintenance,
            termMonths: p.termMonths,
            annualMileage: p.annualMileage,
            initialRentalMultiplier: p.initialRentalMultiplier,
            monthlyRental: p.monthlyRental,
            acceptedAt: p.acceptedAt ? p.acceptedAt.toISOString() : null,
            chipConfirmed: p.chipConfirmed,
            motorCompleteSigned: p.motorCompleteSigned,
            financeAgreementSigned: p.financeAgreementSigned,
            orderNumber: p.orderNumber,
            vin: p.vin,
            isBroker: p.isBroker,
            brokerName: p.brokerName,
            brokerEmail: p.brokerEmail,
            isGroupBq: p.isGroupBq,
            groupSiteName: ctx.groupSite?.name ?? null,
          }}
          exec={ctx.exec ? { name: ctx.exec.name, email: ctx.exec.email } : null}
          customChecks={ctx.customChecks}
        />
      </main>
    </div>
  );
}
