import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import {
  buildReport,
  getDrilldown,
  getProposalsTimeseries,
  RANGE_LABELS,
  SOURCE_LABELS,
  type DrillKind,
  type RangeKey,
  type SourceKey,
} from "@/lib/reports";
import { statusColor, statusLabel } from "@/lib/proposal-constants";
import { RangePicker, SourceFilter } from "./range-picker";

export const dynamic = "force-dynamic";

const RANGE_KEYS: RangeKey[] = ["month", "quarter", "half", "ytd", "year", "all"];
const SOURCE_KEYS: SourceKey[] = ["all", "retail", "broker", "bq"];
const VALID_DRILLS: DrillKind[] = ["funder", "model", "exec", "contract", "term", "ev", "cancelled", "second", "source"];

function drillHref(range: RangeKey, source: SourceKey, kind: DrillKind, id: string, label: string): string {
  const qs = new URLSearchParams();
  if (range !== "month") qs.set("range", range);
  if (source !== "all") qs.set("source", source);
  qs.set("drill", kind);
  qs.set("id", id);
  qs.set("label", label);
  return `/reports?${qs.toString()}`;
}

function setSourceHref(range: RangeKey, source: SourceKey): string {
  const qs = new URLSearchParams();
  if (range !== "month") qs.set("range", range);
  if (source !== "all") qs.set("source", source);
  const s = qs.toString();
  return s ? `/reports?${s}` : "/reports";
}

function clearDrillHref(range: RangeKey, source: SourceKey): string {
  const qs = new URLSearchParams();
  if (range !== "month") qs.set("range", range);
  if (source !== "all") qs.set("source", source);
  const s = qs.toString();
  return s ? `/reports?${s}` : "/reports";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; source?: string; drill?: string; id?: string; label?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range: RangeKey = (RANGE_KEYS as readonly string[]).includes(sp.range ?? "")
    ? (sp.range as RangeKey)
    : "month";
  const source: SourceKey = (SOURCE_KEYS as readonly string[]).includes(sp.source ?? "")
    ? (sp.source as SourceKey)
    : "all";

  const drillKind = (VALID_DRILLS as readonly string[]).includes(sp.drill ?? "") ? (sp.drill as DrillKind) : null;
  const drillId = sp.id ?? "";
  const drillLabel = sp.label ?? "";

  const [r, ts, drillRows] = await Promise.all([
    buildReport(range, source),
    getProposalsTimeseries(range, source),
    drillKind && drillId ? getDrilldown(range, drillKind, drillId, source) : Promise.resolve(null),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">← Back to home</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          {RANGE_LABELS[range]} · {SOURCE_LABELS[source]} · {r.totalProposals} proposals across {r.uniqueDeals} deals
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <RangePicker value={range} />
          <SourceFilter value={source} />
        </div>

        {drillKind && drillRows && (
          <DrilldownPanel
            range={range}
            source={source}
            kind={drillKind}
            id={drillId}
            label={drillLabel}
            rows={drillRows}
          />
        )}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroTile gradient="from-sky-500 to-indigo-600" label="Proposals submitted" value={r.totalProposals.toString()} sub={`${r.uniqueDeals} unique deals`} />
          <HeroTile gradient="from-emerald-500 to-teal-600" label="Departmental acceptance" value={`${r.deptAcceptanceRate}%`} sub={r.pendingDeals > 0 ? `${r.acceptedDeals} accepted · ${r.pendingDeals} pending` : `${r.acceptedDeals} accepted`} />
          <HeroTile gradient="from-rose-500 to-rose-700" label="Cancellation rate" value={`${r.cancellationRate}%`} sub={`${r.cancelledDeals} cancelled`} />
          <HeroTile gradient="from-violet-500 to-fuchsia-600" label="EV mix" value={`${r.evSummary.totalEv}`} sub={`${r.evSummary.wallboxPct}% wallbox · ${r.evSummary.savingPct}% saving`} />
        </section>

        <Card
          title="Source split"
          desc={source === "all" ? "Click a source to filter every chart below" : `Filtered to ${SOURCE_LABELS[source]} — click All to clear`}
          gradient="from-rose-50 to-fuchsia-50"
          accent="rose"
        >
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { key: "all" as SourceKey, label: "All sources", submitted: r.sourceSplit.reduce((a, b) => a + b.submitted, 0), accepted: r.sourceSplit.reduce((a, b) => a + b.accepted, 0), tone: "from-slate-500 to-slate-700" },
              { key: "retail" as SourceKey, label: "Retail", submitted: r.sourceSplit.find((s) => s.key === "retail")!.submitted, accepted: r.sourceSplit.find((s) => s.key === "retail")!.accepted, tone: "from-sky-500 to-indigo-600" },
              { key: "broker" as SourceKey, label: "Broker", submitted: r.sourceSplit.find((s) => s.key === "broker")!.submitted, accepted: r.sourceSplit.find((s) => s.key === "broker")!.accepted, tone: "from-amber-500 to-orange-600" },
              { key: "bq" as SourceKey, label: "Group BQ", submitted: r.sourceSplit.find((s) => s.key === "bq")!.submitted, accepted: r.sourceSplit.find((s) => s.key === "bq")!.accepted, tone: "from-emerald-500 to-teal-600" },
            ].map((s) => {
              const rate = s.submitted > 0 ? Math.round((s.accepted / s.submitted) * 1000) / 10 : 0;
              const active = source === s.key;
              return (
                <Link
                  key={s.key}
                  href={setSourceHref(range, s.key)}
                  className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${s.tone} p-4 text-white shadow transition hover:-translate-y-0.5 hover:shadow-lg ${active ? "ring-2 ring-white ring-offset-2 ring-offset-rose-50" : ""}`}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80">{s.label}{active ? " · selected" : ""}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{s.submitted}</div>
                  <div className="text-[11px] text-white/80">{s.accepted} accepted · {rate}%</div>
                </Link>
              );
            })}
          </div>
        </Card>

        {ts.length > 1 && (
          <Card title="Submitted vs accepted over time" gradient="from-sky-50 to-indigo-50" accent="sky">
            <Sparkline points={ts} />
          </Card>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Funder share" desc="Click a funder to drill into its proposals" gradient="from-sky-50 to-white" accent="sky">
            <BarList
              rows={r.funderSplit.map((f) => ({
                key: f.funderId,
                label: f.funderName,
                count: f.count,
                pct: f.pct,
                href: drillHref(range, source, "funder", f.funderId, f.funderName),
                colour: "sky",
              }))}
              empty="No proposals in this period"
            />
          </Card>

          <Card title="Funder acceptance rates" desc="1st-string only · accepted ÷ decided (referred & not-eligible excluded)" gradient="from-emerald-50 to-white" accent="emerald">
            <RateList
              rows={r.funderAcceptance.map((f) => ({
                key: f.funderId,
                label: f.funderName,
                rate: f.rate,
                sub: f.pending > 0 ? `${f.accepted}/${f.decided} · ${f.pending} pending` : `${f.accepted}/${f.decided}`,
                href: drillHref(range, source, "funder", f.funderId, f.funderName),
              }))}
              empty="No data"
            />
          </Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="2nd / 3rd-string acceptance by funder" gradient="from-amber-50 to-white" accent="amber">
            <RateList
              rows={r.secondStringByFunder.map((f) => ({
                key: f.funderId,
                label: f.funderName,
                rate: f.rate,
                sub: f.pending > 0 ? `${f.accepted}/${f.decided} · ${f.pending} pending` : `${f.accepted}/${f.decided}`,
                href: drillHref(range, source, "second", f.funderId, `${f.funderName} (2nd+)`),
              }))}
              empty="No 2nd-string proposals in this period"
            />
          </Card>

          <Card title="Funder referral rate" desc="1st-string proposals that get referred · high = chase needed" gradient="from-amber-50 to-white" accent="amber">
            <RateList
              rows={r.funderReferralRate.map((f) => ({
                key: f.funderId,
                label: f.funderName,
                rate: f.rate,
                sub: `${f.referred}/${f.submitted}`,
                href: drillHref(range, source, "funder", f.funderId, f.funderName),
              }))}
              empty="No 1st-string proposals in this period"
              invert
            />
          </Card>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card title="PCH vs BCH" gradient="from-violet-50 to-white" accent="violet">
            <DonutSplit
              rows={r.contractSplit.map((x) => ({
                label: x.key, count: x.count, pct: x.pct, href: drillHref(range, source, "contract", x.key, x.key),
              }))}
              palette={["violet", "fuchsia"]}
            />
          </Card>
          <Card title="Maintenance" gradient="from-emerald-50 to-white" accent="emerald">
            <DonutSplit
              rows={r.maintenanceSplit.map((x) => ({ label: x.key, count: x.count, pct: x.pct }))}
              palette={["emerald"]}
            />
          </Card>
          <Card title="Initial rental (months)" gradient="from-orange-50 to-white" accent="orange">
            <BarList
              rows={r.upfrontSplit.map((x) => ({ key: x.key, label: x.key, count: x.count, pct: x.pct, colour: "orange" }))}
              empty="—"
            />
          </Card>
          <Card title="Term (months)" gradient="from-sky-50 to-white" accent="sky">
            <BarList
              rows={r.termSplit.map((x) => ({
                key: x.key,
                label: x.key,
                count: x.count,
                pct: x.pct,
                href: drillHref(range, source, "term", x.key.replace(/[^0-9]/g, ""), x.key),
                colour: "sky",
              }))}
              empty="—"
            />
          </Card>
          <Card title="Annual mileage" gradient="from-amber-50 to-white" accent="amber">
            <BarList
              rows={r.mileageSplit.map((x) => ({ key: x.key, label: x.key, count: x.count, pct: x.pct, colour: "amber" }))}
              empty="—"
            />
          </Card>
          <Card title="Top models" gradient="from-fuchsia-50 to-white" accent="fuchsia">
            <BarList
              rows={r.modelSplit.map((x) => ({
                key: x.model,
                label: x.model,
                count: x.count,
                pct: x.pct,
                href: drillHref(range, source, "model", x.model, x.model),
                colour: "fuchsia",
              }))}
              empty="—"
            />
          </Card>
        </div>

        <Card title="Top derivatives" gradient="from-slate-50 to-white" accent="slate">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="py-1 text-left">Model</th><th className="py-1 text-left">Derivative</th><th className="text-right">Count</th><th className="text-right">Share</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.derivativeSplit.slice(0, 20).map((d) => (
                <tr key={`${d.model}|${d.derivative}`} className="hover:bg-slate-50">
                  <td className="py-1.5 text-slate-700">{d.model}</td>
                  <td className="py-1.5 font-medium text-slate-800">{d.derivative}</td>
                  <td className="text-right tabular-nums text-slate-600">{d.count}</td>
                  <td className="text-right tabular-nums text-slate-500">{d.pct}%</td>
                </tr>
              ))}
              {r.derivativeSplit.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-xs text-slate-400">No data</td></tr>}
            </tbody>
          </table>
        </Card>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Cancellations by funder" gradient="from-rose-50 to-white" accent="rose">
            <BarList
              rows={r.cancellationByFunder.map((x) => ({
                key: x.funderId,
                label: x.funderName,
                count: x.count,
                pct: 0,
                colour: "rose",
              }))}
              hidePct
              empty="No cancellations"
            />
            <div className="mt-3">
              <Link href={drillHref(range, source, "cancelled", "all", "All cancelled")} className="text-xs font-medium text-rose-700 hover:underline">
                View all cancelled deals →
              </Link>
            </div>
          </Card>

          <Card title="EV: customer saving vs wallbox" desc="Across all EV proposals in this period" gradient="from-violet-50 to-white" accent="violet">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="EV proposals" value={r.evSummary.totalEv.toString()} colour="slate" href={r.evSummary.totalEv > 0 ? drillHref(range, source, "ev", "all", "All EV") : undefined} />
              <MiniStat label="Wallbox" value={`${r.evSummary.wallboxPct}%`} sub={`${r.evSummary.wallbox}`} colour="violet" href={r.evSummary.wallbox > 0 ? drillHref(range, source, "ev", "wallbox", "Wallbox EV") : undefined} />
              <MiniStat label="Saving" value={`${r.evSummary.savingPct}%`} sub={`avg £${r.evSummary.avgSavingGbp.toLocaleString()}`} colour="emerald" href={r.evSummary.saving > 0 ? drillHref(range, source, "ev", "saving", "Saving EV") : undefined} />
            </div>
            {r.evByModel.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr><th className="py-1 text-left">Model</th><th className="text-right">Total</th><th className="text-right">Wallbox</th><th className="text-right">Saving</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.evByModel.map((m) => (
                    <tr key={m.model} className="hover:bg-slate-50">
                      <td className="py-1.5 font-medium text-slate-800">{m.model}</td>
                      <td className="text-right tabular-nums text-slate-600">{m.total}</td>
                      <td className="text-right tabular-nums text-violet-700">{m.wallbox}</td>
                      <td className="text-right tabular-nums text-emerald-700">{m.saving}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card title="Sales exec leaderboard" desc="Rate = accepted ÷ decided · pending shown separately" gradient="from-emerald-50 to-white" accent="emerald">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 text-left">Exec</th>
                <th className="text-right">Submitted</th>
                <th className="text-right">Accepted</th>
                <th className="text-right">Pending</th>
                <th className="text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.execLeaderboard.map((e) => (
                <tr key={e.execId} className="hover:bg-slate-50">
                  <td className="py-1.5">
                    <Link href={drillHref(range, source, "exec", e.execId, e.execName)} className="font-medium text-slate-800 hover:text-slate-950 hover:underline">
                      {e.execName}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums text-slate-600">{e.submitted}</td>
                  <td className="text-right tabular-nums text-slate-600">{e.accepted}</td>
                  <td className="text-right tabular-nums text-amber-700">{e.pending || ""}</td>
                  <td className="text-right tabular-nums font-medium text-emerald-700">{e.rate}%</td>
                </tr>
              ))}
              {r.execLeaderboard.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-xs text-slate-400">No data</td></tr>}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}

function HeroTile({ gradient, label, value, sub }: { gradient: string; label: string; value: string; sub?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-lg`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">{label}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-white/80">{sub}</div>}
      </div>
    </div>
  );
}

const ACCENT_BORDER: Record<string, string> = {
  sky: "border-sky-200",
  emerald: "border-emerald-200",
  amber: "border-amber-200",
  violet: "border-violet-200",
  rose: "border-rose-200",
  fuchsia: "border-fuchsia-200",
  orange: "border-orange-200",
  slate: "border-slate-200",
};

function Card({
  title, desc, children, gradient = "from-slate-50 to-white", accent = "slate",
}: { title: string; desc?: string; children: React.ReactNode; gradient?: string; accent?: string }) {
  return (
    <section className={`mt-6 overflow-hidden rounded-2xl border bg-gradient-to-br ${gradient} ${ACCENT_BORDER[accent]} shadow-sm`}>
      <div className="border-b border-white/60 bg-white/40 px-5 py-3 backdrop-blur">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
      <div className="bg-white/70 p-5 backdrop-blur">{children}</div>
    </section>
  );
}

const BAR_CLASS: Record<string, string> = {
  sky: "from-sky-400 to-sky-600",
  emerald: "from-emerald-400 to-emerald-600",
  amber: "from-amber-400 to-amber-600",
  violet: "from-violet-400 to-violet-600",
  rose: "from-rose-400 to-rose-600",
  fuchsia: "from-fuchsia-400 to-fuchsia-600",
  orange: "from-orange-400 to-orange-600",
};

function BarList({
  rows, empty, hidePct,
}: {
  rows: { key: string; label: string; count: number; pct: number; href?: string; colour?: string }[];
  empty: string;
  hidePct?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <div className="py-3 text-center text-xs text-slate-400">{empty}</div>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const inner = (
          <div className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs font-medium text-slate-700">{r.label}</span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div
                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${BAR_CLASS[r.colour ?? "sky"]}`}
                style={{ width: `${(r.count / max) * 100}%` }}
              />
              <span className="relative z-10 ml-2 text-[11px] font-medium leading-6 text-slate-800 tabular-nums">{r.count}</span>
            </div>
            {!hidePct && <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-500">{r.pct}%</span>}
          </div>
        );
        return (
          <li key={r.key}>
            {r.href ? <Link href={r.href} className="block rounded-md p-1 -m-1 hover:bg-slate-50">{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

function RateList({
  rows, empty, invert,
}: { rows: { key: string; label: string; rate: number; sub: string; href?: string }[]; empty: string; invert?: boolean }) {
  if (rows.length === 0) return <div className="py-3 text-center text-xs text-slate-400">{empty}</div>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const good = invert ? r.rate <= 10 : r.rate >= 70;
        const ok = invert ? r.rate <= 25 : r.rate >= 40;
        const tone = good ? "emerald" : ok ? "amber" : "rose";
        const toneClass = tone === "emerald" ? "from-emerald-400 to-emerald-600" : tone === "amber" ? "from-amber-400 to-amber-600" : "from-rose-400 to-rose-600";
        const inner = (
          <div className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs font-medium text-slate-700">{r.label}</span>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div className={`absolute inset-y-0 left-0 bg-gradient-to-r ${toneClass}`} style={{ width: `${Math.min(r.rate, 100)}%` }} />
              <span className="relative z-10 ml-2 text-xs font-semibold leading-7 text-slate-900 tabular-nums">{r.rate}%</span>
            </div>
            <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{r.sub}</span>
          </div>
        );
        return (
          <li key={r.key}>
            {r.href ? <Link href={r.href} className="block rounded-md p-1 -m-1 hover:bg-slate-50">{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

const DONUT_PALETTE: Record<string, string[]> = {
  violet: ["#8b5cf6", "#c026d3"],
  emerald: ["#10b981", "#0d9488"],
  fuchsia: ["#d946ef", "#a21caf"],
};

function DonutSplit({
  rows, palette,
}: { rows: { label: string; count: number; pct: number; href?: string }[]; palette: string[] }) {
  const total = rows.reduce((a, b) => a + b.count, 0);
  if (total === 0) return <div className="py-3 text-center text-xs text-slate-400">No data</div>;
  const colours = palette.flatMap((p) => DONUT_PALETTE[p] ?? ["#64748b"]);
  let cumulative = 0;
  const segments = rows.map((r, i) => {
    const start = cumulative / total;
    cumulative += r.count;
    const end = cumulative / total;
    return { ...r, start, end, colour: colours[i % colours.length] };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-28 w-28 -rotate-90">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="6" />
        {segments.map((s) => {
          const dash = (s.end - s.start) * 100;
          const offset = -s.start * 100;
          return (
            <circle
              key={s.label}
              cx="21" cy="21" r="15.915" fill="none"
              stroke={s.colour}
              strokeWidth="6"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <ul className="space-y-1 text-xs">
        {segments.map((s) => {
          const inner = (
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.colour }} />
              <span className="font-medium text-slate-700">{s.label}</span>
              <span className="text-slate-500 tabular-nums">{s.count} · {s.pct}%</span>
            </span>
          );
          return <li key={s.label}>{s.href ? <Link href={s.href} className="hover:underline">{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}

const MINI_STAT_BG: Record<string, string> = {
  slate: "bg-slate-50 text-slate-900",
  violet: "bg-violet-50 text-violet-900",
  emerald: "bg-emerald-50 text-emerald-900",
};

function MiniStat({ label, value, sub, colour, href }: { label: string; value: string; sub?: string; colour: string; href?: string }) {
  const inner = (
    <div className={`rounded-xl p-3 ring-1 ring-inset ring-white/40 ${MINI_STAT_BG[colour]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] opacity-70">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block transition hover:scale-[1.02]">{inner}</Link> : inner;
}

function Sparkline({ points }: { points: { label: string; submitted: number; accepted: number }[] }) {
  if (points.length < 2) return <div className="py-3 text-center text-xs text-slate-400">Not enough data yet</div>;
  const max = Math.max(1, ...points.map((p) => p.submitted));
  const w = 600, h = 120, pad = 16;
  const xStep = (w - pad * 2) / (points.length - 1);
  const path = (key: "submitted" | "accepted") => points
    .map((p, i) => {
      const x = pad + i * xStep;
      const y = h - pad - (p[key] / max) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <defs>
          <linearGradient id="grad-sub" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path("submitted")} L ${pad + (points.length - 1) * xStep} ${h - pad} L ${pad} ${h - pad} Z`} fill="url(#grad-sub)" />
        <path d={path("submitted")} fill="none" stroke="#0ea5e9" strokeWidth="2" />
        <path d={path("accepted")} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 3" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{points[0].label}</span>
        <span className="flex gap-3">
          <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-sky-500" />Submitted</span>
          <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-emerald-500" />Accepted</span>
        </span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

function DrilldownPanel({
  range, source, kind, label, rows,
}: {
  range: RangeKey;
  source: SourceKey;
  kind: DrillKind;
  id: string;
  label: string;
  rows: { id: string; customerId: string; customerName: string; model: string; derivative: string; funderName: string; status: string; monthly: number; execName: string | null; createdAt: string }[];
}) {
  const headline = label || kind;
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border-2 border-sky-300 bg-gradient-to-br from-sky-50 to-white shadow-md">
      <div className="flex items-center justify-between border-b border-sky-200 bg-sky-100/60 px-5 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">Drilldown · {kind}</div>
          <div className="text-base font-semibold text-slate-900">{headline}</div>
          <div className="text-xs text-slate-500">{rows.length} {rows.length === 1 ? "proposal" : "proposals"} · {RANGE_LABELS[range]}</div>
        </div>
        <Link href={clearDrillHref(range, source)} className="rounded-md border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50">
          Close
        </Link>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white/95 text-[11px] uppercase tracking-wide text-slate-500 backdrop-blur">
            <tr>
              <th className="px-4 py-2 text-left">Customer</th>
              <th className="px-4 py-2 text-left">Vehicle</th>
              <th className="px-4 py-2 text-left">Funder</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Monthly</th>
              <th className="px-4 py-2 text-left">Exec</th>
              <th className="px-4 py-2 text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const tone = statusColor(row.status);
              return (
                <tr key={row.id} className="hover:bg-sky-50/30">
                  <td className="px-4 py-2">
                    <Link href={`/customers/${row.customerId}`} className="font-medium text-slate-800 hover:underline">
                      {row.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{row.model} {row.derivative}</td>
                  <td className="px-4 py-2 text-slate-600">{row.funderName}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">£{row.monthly.toFixed(2)}</td>
                  <td className="px-4 py-2 text-slate-500">{row.execName ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[11px] text-slate-400">{new Date(row.createdAt).toLocaleDateString("en-GB")}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-xs text-slate-400">No proposals match this drilldown</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
