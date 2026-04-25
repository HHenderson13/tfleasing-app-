import Link from "next/link";
import { listProposals } from "@/lib/proposals";
import { STATUS_LABELS, STATUS_COLORS, PROPOSAL_SECTION_STATUSES, type ProposalStatus } from "@/lib/proposal-constants";
import { TopNav } from "@/components/top-nav";
import { db } from "@/db";
import { salesExecs } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ProposalsFilter, type RangeKey } from "./proposals-filter";

export const dynamic = "force-dynamic";

const TILE_TONES: Record<ProposalStatus, { bg: string; ring: string; text: string; num: string; activeRing: string }> = {
  proposal_received: { bg: "bg-sky-50", ring: "ring-sky-200", text: "text-sky-700", num: "text-sky-900", activeRing: "ring-sky-500" },
  accepted: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", num: "text-emerald-900", activeRing: "ring-emerald-500" },
  referred_to_underwriter: { bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-700", num: "text-amber-900", activeRing: "ring-amber-500" },
  referred_to_dealer: { bg: "bg-violet-50", ring: "ring-violet-200", text: "text-violet-700", num: "text-violet-900", activeRing: "ring-violet-500" },
  declined: { bg: "bg-rose-50", ring: "ring-rose-200", text: "text-rose-700", num: "text-rose-900", activeRing: "ring-rose-500" },
  not_eligible: { bg: "bg-orange-50", ring: "ring-orange-200", text: "text-orange-700", num: "text-orange-900", activeRing: "ring-orange-500" },
  lost_sale: { bg: "bg-slate-100", ring: "ring-slate-200", text: "text-slate-600", num: "text-slate-900", activeRing: "ring-slate-500" },
  in_order: { bg: "bg-slate-50", ring: "ring-slate-200", text: "text-slate-500", num: "text-slate-700", activeRing: "ring-slate-500" },
  awaiting_delivery: { bg: "bg-slate-50", ring: "ring-slate-200", text: "text-slate-500", num: "text-slate-700", activeRing: "ring-slate-500" },
};

const RANGE_KEYS = ["month", "last", "3m", "6m", "ytd", "all"] as const;

function buildQuery(params: { exec?: string | null; status?: ProposalStatus | null; range?: RangeKey | null; q?: string | null }) {
  const qs = new URLSearchParams();
  if (params.exec) qs.set("exec", params.exec);
  if (params.status) qs.set("status", params.status);
  if (params.range && params.range !== "month") qs.set("range", params.range);
  if (params.q) qs.set("q", params.q);
  const s = qs.toString();
  return s ? `/proposals?${s}` : "/proposals";
}

function rangeStart(range: RangeKey, now = new Date()): Date | null {
  if (range === "all") return null;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (range === "month") {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  if (range === "last") {
    return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  if (range === "ytd") {
    return new Date(d.getFullYear(), 0, 1);
  }
  if (range === "3m") {
    const x = new Date(d);
    x.setMonth(x.getMonth() - 3);
    return x;
  }
  if (range === "6m") {
    const x = new Date(d);
    x.setMonth(x.getMonth() - 6);
    return x;
  }
  return null;
}

function rangeEnd(range: RangeKey, now = new Date()): Date | null {
  if (range === "last") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  return null;
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ exec?: string; status?: string; range?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const execFilter = sp.exec && sp.exec !== "all" ? sp.exec : null;
  const statusFilter = (PROPOSAL_SECTION_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ProposalStatus)
    : null;
  const range: RangeKey = (RANGE_KEYS as readonly string[]).includes(sp.range ?? "")
    ? (sp.range as RangeKey)
    : "month";
  const query = (sp.q ?? "").trim();
  const queryLower = query.toLowerCase();

  const [rows, execs] = await Promise.all([
    listProposals("proposals"),
    db.select().from(salesExecs).orderBy(asc(salesExecs.name)),
  ]);

  // Group by customer — latest proposal per group is shown on the front.
  type Row = (typeof rows)[number];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.customer?.id ?? r.customerId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  type Group = { customerId: string; latest: Row; attempts: Row[] };
  let grouped: Group[] = [];
  for (const [customerId, items] of groups) {
    const sorted = [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    grouped.push({ customerId, latest: sorted[0], attempts: sorted });
  }
  grouped.sort((a, b) => new Date(b.latest.updatedAt).getTime() - new Date(a.latest.updatedAt).getTime());

  // Apply filters at group (customer) level.
  const start = rangeStart(range);
  const end = rangeEnd(range);
  grouped = grouped.filter((g) => {
    const t = new Date(g.latest.updatedAt).getTime();
    if (start && t < start.getTime()) return false;
    if (end && t >= end.getTime()) return false;
    if (execFilter && g.latest.salesExecId !== execFilter) return false;
    if (queryLower && !(g.latest.customer?.name ?? "").toLowerCase().includes(queryLower)) return false;
    return true;
  });

  const counts = Object.fromEntries(
    PROPOSAL_SECTION_STATUSES.map((s) => [s, grouped.filter((g) => g.latest.status === s).length])
  ) as Record<ProposalStatus, number>;

  const visible = statusFilter ? grouped.filter((g) => g.latest.status === statusFilter) : grouped;

  const base = { exec: execFilter, range, q: query || null };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="proposals" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Proposals</h1>
            <p className="mt-1 text-sm text-slate-500">One row per customer, latest status on top. Use the range and search to find older proposals.</p>
          </div>
          <ProposalsFilter
            execs={execs.map((e) => ({ id: e.id, name: e.name }))}
            execValue={execFilter ?? "all"}
            status={statusFilter}
            range={range}
            query={query}
          />
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {PROPOSAL_SECTION_STATUSES.map((s) => (
            <StatTile
              key={s}
              label={STATUS_LABELS[s]}
              value={counts[s]}
              tone={s}
              href={buildQuery({ ...base, status: statusFilter === s ? null : s })}
              active={statusFilter === s}
            />
          ))}
        </section>

        {(statusFilter || query || range !== "month" || execFilter) && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
            <div className="text-slate-700">
              Showing <span className="font-medium">{visible.length}</span> {visible.length === 1 ? "customer" : "customers"}
              {statusFilter && <> · latest status <span className="font-medium">{STATUS_LABELS[statusFilter]}</span></>}
              {range !== "all" && <> · <span className="font-medium">{range === "month" ? "this month" : range === "last" ? "last month" : range === "3m" ? "last 3 months" : range === "6m" ? "last 6 months" : "year to date"}</span></>}
              {query && <> · matching &ldquo;{query}&rdquo;</>}
            </div>
            <Link href={buildQuery({})} className="text-xs font-medium text-slate-600 hover:underline">Reset filters</Link>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Latest vehicle</th>
                <th className="px-4 py-3 text-left font-medium">Funder · FP#</th>
                <th className="px-4 py-3 text-right font-medium">Monthly</th>
                <th className="px-4 py-3 text-left font-medium">Sales exec</th>
                <th className="px-4 py-3 text-left font-medium">Latest status</th>
                <th className="px-4 py-3 text-left font-medium">Attempts</th>
                <th className="px-4 py-3 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((g) => {
                const p = g.latest;
                const status = p.status as ProposalStatus;
                const c = STATUS_COLORS[status];
                return (
                  <tr key={g.customerId}>
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {p.customer ? (
                        <Link href={`/customers/${p.customer.id}`} className="hover:underline">{p.customer.name}</Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      <div>{p.model}</div>
                      <div className="text-xs text-slate-400">{p.derivative}</div>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      <div>{p.funderName} <span className="text-xs text-slate-400">#{p.funderRank}</span></div>
                      {p.financeProposalNumber && <div className="font-mono text-[11px] text-slate-400">FP {p.financeProposalNumber}</div>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      £{p.monthlyRental.toFixed(2)}
                      {p.isBroker && <div className="text-[10px] font-medium text-indigo-600">Broker</div>}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {p.isGroupBq ? (
                        <>
                          <div className="font-medium text-slate-700">Group BQ Deal</div>
                          {p.groupSite && <div className="text-[11px] text-slate-400">{p.groupSite.name}</div>}
                        </>
                      ) : (
                        p.exec?.name ?? "—"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text} ring-1 ${c.ring}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {g.attempts.length === 1 ? (
                        <span className="text-slate-400">1 attempt</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {g.attempts.map((a) => {
                            const ac = STATUS_COLORS[a.status as ProposalStatus];
                            return (
                              <span
                                key={a.id}
                                title={`#${a.funderRank} ${a.funderName} — ${STATUS_LABELS[a.status as ProposalStatus]}`}
                                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ac.bg} ${ac.text} ring-1 ${ac.ring}`}
                              >
                                #{a.funderRank}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(p.updatedAt).toLocaleString()}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">{statusFilter || execFilter || query || range !== "month" ? "No customers match these filters." : "No proposals in this period. Try a wider range."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function StatTile({ label, value, tone, href, active }: { label: string; value: number; tone: ProposalStatus; href: string; active: boolean }) {
  const t = TILE_TONES[tone];
  const ring = active ? `ring-2 ${t.activeRing}` : `ring-1 ${t.ring}`;
  return (
    <Link href={href} className={`block rounded-2xl ${t.bg} px-4 py-3 ${ring} transition hover:brightness-[0.98]`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.num}`}>{value}</div>
    </Link>
  );
}
