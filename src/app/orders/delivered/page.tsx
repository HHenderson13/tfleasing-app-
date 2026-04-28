import { listProposals } from "@/lib/proposals";
import { STATUS_LABELS } from "@/lib/proposal-constants";
import { TopNav } from "@/components/top-nav";
import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ExecFilter } from "../exec-filter";
import { OrderRow, Section } from "../order-row";

export const dynamic = "force-dynamic";

export default async function DeliveredPage({
  searchParams,
}: {
  searchParams: Promise<{ exec?: string }>;
}) {
  const sp = await searchParams;
  const execFilter = sp.exec && sp.exec !== "all" ? sp.exec : null;

  const [rows, execs] = await Promise.all([
    listProposals(),
    db.select().from(salesExecs).orderBy(asc(salesExecs.name)),
  ]);

  const filtered = execFilter ? rows.filter((r) => r.salesExecId === execFilter) : rows;
  const delivered = filtered
    .filter((r) => r.status === "delivered")
    .sort((a, b) => (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0));

  // Group by month delivered.
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const groups = new Map<string, typeof delivered>();
  for (const p of delivered) {
    const d = p.deliveredAt;
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => (a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a)));

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  const ytdYear = now.getFullYear();

  const total = delivered.length;
  const thisMonthCount = (groups.get(thisMonthKey) ?? []).length;
  const lastMonthCount = (groups.get(lastMonthKey) ?? []).length;
  const ytdCount = delivered.filter((p) => p.deliveredAt && p.deliveredAt.getFullYear() === ytdYear).length;
  const monthlySum = delivered.reduce((acc, p) => acc + (p.monthlyRental ?? 0), 0);

  function bucketLabel(key: string) {
    if (key === "unknown") return "No delivery date";
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="orders" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Delivered</h1>
            <p className="mt-1 text-sm text-slate-500">Deals handed over to the customer. Grouped by month delivered.</p>
          </div>
          <ExecFilter
            execs={execs.map((e) => ({ id: e.id, name: e.name }))}
            value={execFilter ?? "all"}
          />
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total delivered" value={total} tone="slate" />
          <StatTile label="This month" value={thisMonthCount} tone="emerald" />
          <StatTile label="Last month" value={lastMonthCount} tone="teal" />
          <StatTile label={`Year-to-date (${ytdYear})`} value={ytdCount} tone="sky" />
        </section>
        <div className="mt-2 text-right text-[11px] text-slate-400">Total monthly rental delivered: £{monthlySum.toFixed(2)}</div>

        {sortedKeys.length === 0 ? (
          <Section title="Delivered" empty="No deliveries yet.">{[]}</Section>
        ) : (
          sortedKeys.map((key) => (
            <Section key={key} title={bucketLabel(key)} empty="">
              {groups.get(key)!.map((p) => {
                const meta = `${p.funderName} · £${p.monthlyRental.toFixed(2)}/mo${p.regNumber ? " · " + p.regNumber : ""}${p.vin ? " · VIN " + p.vin : ""}${p.isGroupBq ? " · Group BQ" + (p.groupSite ? " " + p.groupSite.name : "") : p.exec ? " · " + p.exec.name : ""}`;
                return (
                  <OrderRow
                    key={p.id}
                    id={p.id}
                    customerId={p.customer?.id ?? ""}
                    customer={p.customer?.name ?? "—"}
                    title={`${p.model} ${p.derivative}`}
                    meta={meta}
                    status={p.status as keyof typeof STATUS_LABELS}
                    right={
                      <div className="text-right">
                        <div className="text-xs font-medium text-slate-700">
                          {p.deliveredAt ? p.deliveredAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </div>
                        <div className="text-[10px] text-slate-400">handed over</div>
                      </div>
                    }
                  />
                );
              })}
            </Section>
          ))
        )}
      </main>
    </div>
  );
}

const TILE_TONES: Record<string, { bg: string; ring: string; text: string; num: string }> = {
  slate:   { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-600",   num: "text-slate-900" },
  sky:     { bg: "bg-sky-50",     ring: "ring-sky-200",     text: "text-sky-700",     num: "text-sky-900" },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", num: "text-emerald-900" },
  teal:    { bg: "bg-teal-50",    ring: "ring-teal-200",    text: "text-teal-700",    num: "text-teal-900" },
};

function StatTile({ label, value, tone }: { label: string; value: number; tone: keyof typeof TILE_TONES }) {
  const t = TILE_TONES[tone];
  return (
    <div className={`rounded-2xl ${t.bg} px-4 py-3 ring-1 ${t.ring}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.num}`}>{value}</div>
    </div>
  );
}
