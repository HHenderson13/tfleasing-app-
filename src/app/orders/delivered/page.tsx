import { listProposals } from "@/lib/proposals";
import { TopNav } from "@/components/top-nav";
import { requireOrdersAccess } from "@/lib/auth-guard";
import { isAdmin } from "@/lib/auth";
import { DeliveredClient, type DeliveredItem } from "./delivered-client";

export const dynamic = "force-dynamic";

export default async function DeliveredPage() {
  const me = await requireOrdersAccess();
  const admin = isAdmin(me);

  const rows = await listProposals();
  const delivered = rows.filter((r) => r.status === "delivered");

  const items: DeliveredItem[] = delivered.map((p) => ({
    id: p.id,
    customerId: p.customer?.id ?? "",
    customerName: p.customer?.name ?? "—",
    businessName: p.customer?.businessName ?? null,
    model: p.model,
    derivative: p.derivative,
    funderName: p.funderName,
    regNumber: p.regNumber ?? null,
    vin: p.vin ?? null,
    execId: p.salesExecId ?? null,
    execName: p.exec?.name ?? null,
    isGroupBq: p.isGroupBq,
    groupSiteName: p.groupSite?.name ?? null,
    deliveredAtIso: p.deliveredAt ? p.deliveredAt.toISOString().slice(0, 10) : null,
    gapSold: p.gapPolicyStatus === "complete",
    tfpSold: p.tfpPolicyStatus === "complete",
  }));

  const myExecId = me.salesExecId ?? null;
  const myExecName = items.find((i) => i.execId === myExecId)?.execName ?? me.name ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Delivered</h1>
          <p className="mt-1 text-sm text-slate-500">
            Deals handed over to the customer. Yours come first, then everyone else&apos;s — pick a month to dig back through.
          </p>
        </div>

        <DeliveredClient
          items={items}
          myExecId={myExecId}
          myExecName={myExecName}
          isAdmin={admin}
        />
      </main>
    </div>
  );
}
