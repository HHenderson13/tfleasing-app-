import Link from "next/link";
import { listProposals } from "@/lib/proposals";
import { STATUS_LABELS } from "@/lib/proposal-constants";
import { TopNav } from "@/components/top-nav";
import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ExecFilter } from "./exec-filter";
import { OrderRow, Section, CountdownBadge, type OutstandingAction } from "./order-row";
import { requireOrdersAccess } from "@/lib/auth-guard";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Focus = "agreements" | "chips" | "vehicles" | "motorComplete" | "overdue";
const FOCUS_LABELS: Record<Focus, string> = {
  agreements: "Agreements to sign",
  chips: "Chips to do",
  vehicles: "Vehicles to order",
  motorComplete: "MotorComplete to sign",
  overdue: "Overdue agreements",
};

function daysLeftFromAcceptance(acceptedAt: Date | null) {
  if (!acceptedAt) return null;
  const deadline = new Date(acceptedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const diffMs = deadline.getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

type OrderRowData = Awaited<ReturnType<typeof listProposals>>[number];

function matchesFocus(p: OrderRowData, focus: Focus): boolean {
  switch (focus) {
    case "agreements":
      return p.funderId !== "ald" && !p.financeAgreementSigned;
    case "chips":
      return p.funderId === "novuna" && !p.chipConfirmed;
    case "vehicles":
      return !p.isGroupBq && !p.orderNumber && !p.vin;
    case "motorComplete":
      return !p.isGroupBq && !p.motorCompleteSigned;
    case "overdue": {
      if (p.funderId === "ald" || p.financeAgreementSigned) return false;
      const d = daysLeftFromAcceptance(p.acceptedAt);
      return d !== null && d < 0;
    }
  }
}

function outstandingActions(p: OrderRowData): OutstandingAction[] {
  const out: OutstandingAction[] = [];
  if (matchesFocus(p, "agreements"))    out.push({ id: "agreements",    label: "Sign finance agreement", tone: "violet" });
  if (matchesFocus(p, "chips"))         out.push({ id: "chips",         label: "Do CHIP",                 tone: "sky" });
  if (matchesFocus(p, "motorComplete")) out.push({ id: "motorComplete", label: "Sign MotorComplete",      tone: "emerald" });
  if (matchesFocus(p, "vehicles"))      out.push({ id: "vehicles",      label: "Order vehicle",           tone: "amber" });
  return out;
}

function buildQuery(exec: string | null, focus: Focus | null) {
  const qs = new URLSearchParams();
  if (exec) qs.set("exec", exec);
  if (focus) qs.set("focus", focus);
  const s = qs.toString();
  return s ? `/orders?${s}` : "/orders";
}

export default async function OrdersActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ exec?: string; focus?: string }>;
}) {
  const me = await requireOrdersAccess();
  const sp = await searchParams;
  const defaultExec = !isAdmin(me) && me.salesExecId ? me.salesExecId : null;
  const execParam = sp.exec ?? (defaultExec ?? "all");
  const execFilter = execParam && execParam !== "all" ? execParam : null;
  const focusKeys: Focus[] = ["agreements", "chips", "vehicles", "motorComplete", "overdue"];
  const focus = focusKeys.includes(sp.focus as Focus) ? (sp.focus as Focus) : null;

  const [rows, execs] = await Promise.all([
    listProposals("orders"),
    db.select().from(salesExecs).orderBy(asc(salesExecs.name)),
  ]);

  const filtered = execFilter ? rows.filter((r) => r.salesExecId === execFilter) : rows;
  const inOrderAll = filtered.filter((r) => r.status === "in_order");

  const stats: Record<Focus, number> = {
    agreements: inOrderAll.filter((p) => matchesFocus(p, "agreements")).length,
    chips: inOrderAll.filter((p) => matchesFocus(p, "chips")).length,
    vehicles: inOrderAll.filter((p) => matchesFocus(p, "vehicles")).length,
    motorComplete: inOrderAll.filter((p) => matchesFocus(p, "motorComplete")).length,
    overdue: inOrderAll.filter((p) => matchesFocus(p, "overdue")).length,
  };

  const inOrder = focus ? inOrderAll.filter((p) => matchesFocus(p, focus)) : inOrderAll;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Orders awaiting actions</h1>
            <p className="mt-1 text-sm text-slate-500">Accepted proposals where something needs doing on our side before they can move to delivery.</p>
          </div>
          <ExecFilter
            execs={execs.map((e) => ({ id: e.id, name: e.name }))}
            value={execFilter ?? "all"}
          />
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label={FOCUS_LABELS.agreements} value={stats.agreements} tone="violet" href={buildQuery(execFilter, "agreements")} active={focus === "agreements"} />
          <StatTile label={FOCUS_LABELS.chips} value={stats.chips} tone="sky" href={buildQuery(execFilter, "chips")} active={focus === "chips"} />
          <StatTile label={FOCUS_LABELS.vehicles} value={stats.vehicles} tone="amber" href={buildQuery(execFilter, "vehicles")} active={focus === "vehicles"} />
          <StatTile label={FOCUS_LABELS.motorComplete} value={stats.motorComplete} tone="emerald" href={buildQuery(execFilter, "motorComplete")} active={focus === "motorComplete"} />
          <StatTile label={FOCUS_LABELS.overdue} value={stats.overdue} tone="red" href={buildQuery(execFilter, "overdue")} active={focus === "overdue"} />
        </section>

        {focus && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
            <div className="text-slate-700">
              Showing <span className="font-medium">{FOCUS_LABELS[focus]}</span> · {inOrder.length} {inOrder.length === 1 ? "deal" : "deals"}
            </div>
            <Link href={buildQuery(execFilter, null)} className="text-xs font-medium text-slate-600 hover:underline">Clear filter</Link>
          </div>
        )}

        <Section title={focus ? FOCUS_LABELS[focus] : "In order"} empty={focus ? "Nothing matches this filter." : "Nothing in the order stage yet."}>
          {inOrder.map((p) => {
            const isAld = p.funderId === "ald";
            const days = isAld ? null : daysLeftFromAcceptance(p.acceptedAt);
            const actions = outstandingActions(p);
            const customCount = p.customRemaining ?? 0;
            const remaining = actions.length + customCount;
            return (
              <OrderRow
                key={p.id}
                id={p.id}
                customerId={p.customer?.id ?? ""}
                customer={p.customer?.name ?? "—"}
                title={`${p.model} ${p.derivative}`}
                meta={`${p.funderName} · £${p.monthlyRental.toFixed(2)}/mo · FP ${p.financeProposalNumber ?? "—"}${p.isGroupBq ? " · Group BQ" + (p.groupSite ? " " + p.groupSite.name : "") : p.exec ? " · " + p.exec.name : ""}${p.isBroker && p.brokerName ? " · Broker: " + p.brokerName : ""}`}
                status={p.status as keyof typeof STATUS_LABELS}
                actions={actions}
                customCount={customCount}
                right={
                  <div className="text-right">
                    <div className="text-xs text-slate-500">{remaining === 0 ? "Ready to move" : `${remaining} step${remaining === 1 ? "" : "s"} left`}</div>
                    <CountdownBadge days={days} />
                  </div>
                }
              />
            );
          })}
        </Section>
      </main>
    </div>
  );
}

const TONES: Record<string, { bg: string; ring: string; text: string; num: string; activeRing: string }> = {
  violet:  { bg: "bg-violet-50",  ring: "ring-violet-200",  text: "text-violet-700",  num: "text-violet-900",  activeRing: "ring-violet-500" },
  sky:     { bg: "bg-sky-50",     ring: "ring-sky-200",     text: "text-sky-700",     num: "text-sky-900",     activeRing: "ring-sky-500" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-700",   num: "text-amber-900",   activeRing: "ring-amber-500" },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", num: "text-emerald-900", activeRing: "ring-emerald-500" },
  red:     { bg: "bg-red-50",     ring: "ring-red-200",     text: "text-red-700",     num: "text-red-900",     activeRing: "ring-red-500" },
};

function StatTile({ label, value, tone, href, active }: { label: string; value: number; tone: keyof typeof TONES; href: string; active: boolean }) {
  const t = TONES[tone];
  const ring = active ? `ring-2 ${t.activeRing}` : `ring-1 ${t.ring}`;
  return (
    <Link href={href} className={`block rounded-2xl ${t.bg} px-4 py-3 ${ring} transition hover:brightness-[0.98]`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.num}`}>{value}</div>
    </Link>
  );
}
