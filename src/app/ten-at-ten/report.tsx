"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { shiftAnchor } from "@/lib/period";
import {
  DIMENSIONS,
  ORDER_DIMENSIONS,
  SEGMENTS,
  SOURCES,
  avgProfit,
  conversionPct,
  decodeOrders,
  decodeReport,
  dimLabel,
  groupOrders,
  groupRows,
  inRange,
  orderDimLabel,
  orderStatsOf,
  rangeFor,
  statsOf,
  type DimKey,
  type Nested,
  type OrderDimKey,
  type OrderRow,
  type OrderSortKey,
  type OrderStats,
  type OrdersPayload,
  type PeriodMode,
  type Range,
  type ReportPayload,
  type ReportRow,
  type SortKey,
  type Stats,
} from "@/lib/ten-at-ten-report";

const SOURCE_COLOURS: Record<string, string> = {
  "TF Lead": "#1d4ed8",
  "Leasing.com": "#0891b2",
  LeaseLoco: "#7c3aed",
  CarWow: "#ea580c",
  "Broker / Prospect": "#64748b",
};

const SEGMENT_META: Record<string, { title: string; colour: string }> = {
  "ICE Car": { title: "ICE Cars", colour: "#b45309" },
  "BEV Car": { title: "BEV Cars", colour: "#047857" },
  Van: { title: "Vans", colour: "#1d4ed8" },
};

const MODES: { key: PeriodMode; label: string; current: string }[] = [
  { key: "day", label: "Day", current: "Today" },
  { key: "week", label: "Week", current: "This week" },
  { key: "month", label: "Month", current: "This month" },
  { key: "quarter", label: "Quarter", current: "This quarter" },
  { key: "custom", label: "Custom", current: "" },
];

const pct = (n: number | null, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);
const int = (n: number) => n.toLocaleString("en-GB");
const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbp = (n: number | null) => (n == null ? "—" : GBP.format(Math.round(n)).replace("-", "−"));

type Section = "enquiries" | "orders";

export function ReportClient({ payload, orders, today }: { payload: ReportPayload; orders: OrdersPayload; today: string }) {
  const enquiryRows = useMemo(() => decodeReport(payload), [payload]);
  const orderRows = useMemo(() => decodeOrders(orders), [orders]);

  const [section, setSection] = useState<Section>("enquiries");
  const [mode, setMode] = useState<PeriodMode>("month");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });

  const range = useMemo(() => rangeFor(mode, anchor, custom), [mode, anchor, custom]);
  const active = section === "enquiries" ? enquiryRows : orderRows;
  const minDay = active[0]?.day ?? today;
  const modeMeta = MODES.find((m) => m.key === mode)!;
  const atCurrent = mode !== "custom" && range.startDay <= today && range.endDay >= today;

  return (
    <div className="mt-5 space-y-5">
      {/* Section */}
      <div className="flex gap-1 border-b border-slate-200">
        {([["enquiries", "Enquiries"], ["orders", "Orders"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${section === key ? "border-indigo-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Period, shared by both sections */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "custom" ? (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2 py-1" />
            <span className="text-slate-400">to</span>
            <input type="date" value={custom.to} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2 py-1" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} disabled={range.startDay <= minDay}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-30" aria-label="Previous period">‹</button>
            <span className="min-w-[200px] text-center text-sm font-semibold text-slate-900">{range.label}</span>
            <button onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} disabled={range.endDay >= today}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-30" aria-label="Next period">›</button>
            {!atCurrent && (
              <button onClick={() => setAnchor(today)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">{modeMeta.current}</button>
            )}
          </div>
        )}
      </div>

      {section === "enquiries"
        ? <EnquiriesSection all={enquiryRows} range={range} />
        : <OrdersSection all={orderRows} range={range} />}
    </div>
  );
}

// ─── Shared pieces ─────────────────────────────────────────────────────────

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">{children}</div>;
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {note && <span className="text-[11px] text-slate-400">{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tiles({ tiles }: { tiles: { label: string; value: string; sub?: string; hero?: boolean }[] }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${tiles.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${t.hero ? "border-indigo-900 bg-indigo-950 text-white" : "border-slate-200 bg-white"}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.hero ? "text-indigo-200" : "text-slate-500"}`}>{t.label}</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${t.hero ? "text-white" : "text-slate-900"}`}>{t.value}</div>
          {t.sub && <div className={`mt-0.5 text-xs ${t.hero ? "text-indigo-200" : "text-slate-500"}`}>{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function Chips<T extends string>({ options, selected, onChange, colours }: {
  options: readonly T[]; selected: Set<T>; onChange: (s: Set<T>) => void; colours: Record<string, string>;
}) {
  return (
    <>
      {options.map((o) => {
        const on = selected.has(o);
        return (
          <button
            key={o}
            onClick={() => { const n = new Set(selected); if (n.has(o)) n.delete(o); else n.add(o); onChange(n); }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: colours[o] }} />
            {o}
          </button>
        );
      })}
    </>
  );
}

function Select({ value, onChange, all, options }: { value: string; onChange: (v: string) => void; all: string; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
      <option value="">{all}</option>
      {options.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>
  );
}

// A table of nested groups. Columns are supplied by the section, so the
// enquiry and order tables share the expanding, sorting and "show all".
interface Col<S> { key: string; label: string; render: (g: Nested<S>) => ReactNode; strong?: boolean; left?: boolean }

function ShareCell({ share }: { share: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-slate-400" style={{ width: `${Math.min(100, share)}%` }} /></div>
      <span className="w-10 text-right text-xs tabular-nums text-slate-500">{share.toFixed(1)}%</span>
    </div>
  );
}

// A group whose only child is its own "(model only)" bucket has nothing to
// expand into, so it gets no chevron.
function hasDetail<S>(g: Nested<S>): boolean {
  return g.children.length > 1 || (g.children.length === 1 && !g.children[0].label.endsWith("(model only)"));
}

function GroupTable<S>({ groups, dimTitle, cols, sort, onSort, limit, swatches }: {
  groups: Nested<S>[]; dimTitle: string; cols: Col<S>[]; sort?: string; onSort?: (k: string) => void; limit?: number; swatches?: Record<string, string>;
}) {
  // Nested rows start collapsed — a group opens when it's clicked.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const shown = limit && !showAll ? groups.slice(0, limit) : groups;
  // Keep labels aligned when only some rows have a chevron.
  const anyExpandable = groups.some((g) => hasDetail(g));
  const toggle = (k: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const head = (k: string, label: string, left?: boolean) => (
    <th key={k} className={`px-2 py-2 font-semibold ${left ? "text-left" : "text-right"}`}>
      {onSort && k !== "share" ? (
        <button onClick={() => onSort(k)} className={`hover:text-slate-900 ${sort === k ? "text-slate-900" : ""}`}>{label}{sort === k ? " ↓" : ""}</button>
      ) : label}
    </th>
  );
  const row = (g: Nested<S>, depth: number, parent?: string) => {
    const expandable = depth === 0 && hasDetail(g);
    return (
      <tr key={parent ? `${parent}›${g.key}` : g.key}
        className={`border-b border-slate-100 ${depth > 0 ? "bg-slate-50/70 text-slate-600" : ""} ${expandable ? "cursor-pointer hover:bg-slate-50" : ""}`}
        onClick={expandable ? () => toggle(g.key) : undefined}>
        <td className={`px-2 py-1.5 ${depth > 0 ? "pl-8 text-xs" : "font-medium text-slate-900"}`}>
          <span className="inline-flex items-center gap-2">
            {expandable ? <span className="w-3 text-slate-400">{open.has(g.key) ? "▾" : "▸"}</span> : depth === 0 && anyExpandable && <span className="w-3" />}
            {depth === 0 && swatches?.[g.label] && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: swatches[g.label] }} />}
            {g.label}
          </span>
        </td>
        {cols.map((c) => (
          <td key={c.key} className={`px-2 py-1.5 tabular-nums ${c.left ? "" : "text-right"} ${c.strong ? "font-semibold text-slate-900" : ""}`}>{c.render(g)}</td>
        ))}
      </tr>
    );
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500">
          <tr className="border-b border-slate-200">
            {head("label", dimTitle, true)}
            {cols.map((c) => head(c.key, c.label, c.left))}
          </tr>
        </thead>
        <tbody>
          {shown.map((g) => (
            <Fragment key={g.key}>
              {row(g, 0)}
              {hasDetail(g) && open.has(g.key) && g.children.map((c) => row(c, 1, g.key))}
            </Fragment>
          ))}
        </tbody>
      </table>
      {limit && groups.length > limit && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800">
          {showAll ? "Show fewer" : `Show all ${groups.length}`}
        </button>
      )}
    </div>
  );
}

// "Build a breakdown": two dimension pickers over a nested table whose
// rows stay collapsed until a group is clicked.
function BuilderCard<D extends string>({ dims, first, second, setFirst, setSecond, labelOf, children }: {
  dims: { key: D; label: string }[]; first: D; second: D | ""; setFirst: (d: D) => void; setSecond: (d: D | "") => void; labelOf: (d: D) => string; children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <h2 className="mr-2 text-sm font-semibold text-slate-900">Build a breakdown</h2>
        <span className="text-xs text-slate-500">By</span>
        <select value={first} onChange={(e) => setFirst(e.target.value as D)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
          {dims.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <span className="text-xs text-slate-500">then by</span>
        <select value={second} onChange={(e) => setSecond(e.target.value as D | "")} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">Nothing</option>
          {dims.filter((d) => d.key !== first).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        {second && second !== first && (
          <span className="text-[11px] text-slate-400">Click a {labelOf(first).toLowerCase()} to see its {labelOf(second as D).toLowerCase()} mix.</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ─── Enquiries ─────────────────────────────────────────────────────────────

const ENQ_COLS: Col<Stats>[] = [
  { key: "enquiries", label: "Enquiries", render: (g) => int(g.stats.enquiries) },
  { key: "share", label: "Share", left: true, render: (g) => <ShareCell share={g.share} /> },
  { key: "orders", label: "Orders", render: (g) => int(g.stats.orders) },
  { key: "conversion", label: "Conv.", strong: true, render: (g) => pct(conversionPct(g.stats)) },
  { key: "live", label: "Live", render: (g) => <span className="text-slate-500">{int(g.stats.live)}</span> },
  { key: "lost", label: "Lost", render: (g) => <span className="text-slate-500">{int(g.stats.lost)}</span> },
];

type SourceName = (typeof SOURCES)[number];

function EnquiriesSection({ all, range }: { all: ReportRow[]; range: Range }) {
  const [sources, setSources] = useState<Set<SourceName>>(new Set());
  const [exec, setExec] = useState("");
  const [model, setModel] = useState("");

  const periodAll = useMemo(() => inRange(all, range), [all, range]);
  const rows = useMemo(
    () => periodAll.filter((r) => (sources.size === 0 || sources.has(r.source as SourceName)) && (!exec || r.exec === exec) && (!model || r.model === model)),
    [periodAll, sources, exec, model],
  );
  const execOptions = useMemo(() => groupRows(periodAll, ["exec"]).map((g) => g.label), [periodAll]);
  const modelOptions = useMemo(() => groupRows(periodAll, ["model"]).map((g) => g.label), [periodAll]);
  const filtersOn = sources.size > 0 || !!exec || !!model;
  const s = statsOf(rows);

  if (all.length === 0) return <Empty>No enquiries yet. Upload an enquiry log from <a href="/ten-at-ten/admin" className="font-medium text-indigo-600">Upload data</a>.</Empty>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</span>
        <Chips options={SOURCES} selected={sources} onChange={setSources} colours={SOURCE_COLOURS} />
        <Select value={exec} onChange={setExec} all="All execs" options={execOptions} />
        <Select value={model} onChange={setModel} all="All models" options={modelOptions} />
        {filtersOn && <button onClick={() => { setSources(new Set()); setExec(""); setModel(""); }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Clear filters</button>}
      </div>
      <Tiles tiles={[
        { label: "Enquiries", value: int(s.enquiries) },
        { label: "Orders", value: int(s.orders) },
        { label: "Conversion", value: pct(conversionPct(s)), sub: "orders ÷ enquiries raised", hero: true },
        { label: "Live", value: int(s.live) },
        { label: "Lost", value: int(s.lost) },
      ]} />
      {rows.length === 0 ? (
        <Empty>No enquiries in {range.label}{filtersOn ? " with these filters" : ""}.</Empty>
      ) : (
        <>
          <SourceShare rows={rows} />
          <div className="grid gap-5 lg:grid-cols-2">
            <EnquiryBreakdown title="By exec" rows={rows} dims={EXEC_DIMS} />
            <EnquiryBreakdown title="By model" note="Click a model for its derivatives" rows={rows} dims={MODEL_DIMS} />
          </div>
          <EnquiryBuilder rows={rows} />
        </>
      )}
    </div>
  );
}

const EXEC_DIMS: DimKey[] = ["exec"];
const MODEL_DIMS: DimKey[] = ["model", "derivative"];

function SourceShare({ rows }: { rows: ReportRow[] }) {
  const groups = useMemo(() => groupRows(rows, ["source"], "label"), [rows]);
  return (
    <Card title="Enquiries by source">
      <div className="flex h-9 w-full overflow-hidden rounded-lg">
        {groups.map((g) => (
          <div key={g.key} title={`${g.label}: ${int(g.stats.enquiries)} (${g.share.toFixed(1)}%)`}
            className="flex items-center justify-center text-[11px] font-semibold text-white"
            style={{ width: `${g.share}%`, background: SOURCE_COLOURS[g.label] ?? "#94a3b8", borderRight: "2px solid white" }}>
            {g.share >= 7 ? `${g.share.toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
      <div className="mt-4"><GroupTable groups={groups} dimTitle="Source" cols={ENQ_COLS} swatches={SOURCE_COLOURS} /></div>
    </Card>
  );
}

function EnquiryBreakdown({ title, note, rows, dims }: { title: string; note?: string; rows: ReportRow[]; dims: DimKey[] }) {
  const [sort, setSort] = useState<SortKey>("enquiries");
  const groups = useMemo(() => groupRows(rows, dims, sort), [rows, dims, sort]);
  return (
    <Card title={title} note={note}>
      <GroupTable groups={groups} dimTitle={dimLabel(dims[0])} cols={ENQ_COLS} sort={sort} onSort={(k) => setSort(k as SortKey)} limit={12} />
    </Card>
  );
}

function EnquiryBuilder({ rows }: { rows: ReportRow[] }) {
  const [first, setFirst] = useState<DimKey>("source");
  const [second, setSecond] = useState<DimKey | "">("model");
  const [sort, setSort] = useState<SortKey>("enquiries");
  const dims = useMemo(() => (second && second !== first ? [first, second] : [first]) as DimKey[], [first, second]);
  const groups = useMemo(() => groupRows(rows, dims, sort), [rows, dims, sort]);
  return (
    <BuilderCard dims={DIMENSIONS} first={first} second={second} setFirst={setFirst} setSecond={setSecond} labelOf={dimLabel}>
      <GroupTable key={dims.join("|")} groups={groups} dimTitle={dims.map(dimLabel).join(" › ")} cols={ENQ_COLS}
        sort={sort} onSort={(k) => setSort(k as SortKey)} swatches={first === "source" ? SOURCE_COLOURS : undefined} />
    </BuilderCard>
  );
}

// ─── Orders ────────────────────────────────────────────────────────────────

function Money({ n }: { n: number | null }) {
  return <span className={`whitespace-nowrap ${n != null && n < 0 ? "text-rose-700" : ""}`}>{gbp(n)}</span>;
}

const ORDER_COLS: Col<OrderStats>[] = [
  { key: "orders", label: "Orders", render: (g) => int(g.stats.orders) },
  { key: "share", label: "Share", left: true, render: (g) => <ShareCell share={g.share} /> },
  { key: "profit", label: "Total profit", render: (g) => <Money n={g.stats.priced ? g.stats.profit : null} /> },
  { key: "avg", label: "Avg profit", strong: true, render: (g) => <Money n={avgProfit(g.stats)} /> },
  { key: "loss", label: "Loss-making", render: (g) => <span className={g.stats.loss ? "text-rose-700" : "text-slate-400"}>{int(g.stats.loss)}</span> },
];

const SEGMENT_COLOURS = Object.fromEntries(Object.entries(SEGMENT_META).map(([k, v]) => [k, v.colour]));
type SegmentName = (typeof SEGMENTS)[number];

function OrdersSection({ all, range }: { all: OrderRow[]; range: Range }) {
  const [segments, setSegments] = useState<Set<SegmentName>>(new Set());
  const [exec, setExec] = useState("");
  const [model, setModel] = useState("");
  const [funder, setFunder] = useState("");

  const periodAll = useMemo(() => inRange(all, range), [all, range]);
  const rows = useMemo(
    () => periodAll.filter((r) =>
      (segments.size === 0 || segments.has(r.segment as SegmentName)) && (!exec || r.exec === exec)
      && (!model || r.model === model) && (!funder || r.funder === funder)),
    [periodAll, segments, exec, model, funder],
  );
  const options = useMemo(() => ({
    exec: groupOrders(periodAll, ["exec"]).map((g) => g.label),
    model: groupOrders(periodAll, ["model"]).map((g) => g.label),
    funder: groupOrders(periodAll, ["funder"]).map((g) => g.label),
  }), [periodAll]);
  const filtersOn = segments.size > 0 || !!exec || !!model || !!funder;
  const s = orderStatsOf(rows);

  if (all.length === 0) return <Empty>No orders yet. Upload an order list from <a href="/ten-at-ten/admin" className="font-medium text-indigo-600">Upload data</a>.</Empty>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</span>
        <Chips options={SEGMENTS} selected={segments} onChange={setSegments} colours={SEGMENT_COLOURS} />
        <Select value={exec} onChange={setExec} all="All execs" options={options.exec} />
        <Select value={model} onChange={setModel} all="All models" options={options.model} />
        <Select value={funder} onChange={setFunder} all="All funders" options={options.funder} />
        {filtersOn && <button onClick={() => { setSegments(new Set()); setExec(""); setModel(""); setFunder(""); }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Clear filters</button>}
      </div>
      <Tiles tiles={[
        { label: "Orders", value: int(s.orders), sub: s.orders > s.priced ? `${int(s.orders - s.priced)} without a profit figure yet` : undefined },
        { label: "Total profit", value: gbp(s.priced ? s.profit : null) },
        { label: "Avg profit per unit", value: gbp(avgProfit(s)), hero: true },
        { label: "Loss-making", value: int(s.loss), sub: s.priced ? `${((s.loss / s.priced) * 100).toFixed(0)}% of units` : undefined },
      ]} />
      {rows.length === 0 ? (
        <Empty>No orders in {range.label}{filtersOn ? " with these filters" : ""}.</Empty>
      ) : (
        <>
          <SegmentCards rows={rows} />
          <div className="grid gap-5 lg:grid-cols-2">
            <OrderBreakdown title="By exec" rows={rows} dims={O_EXEC} />
            <OrderBreakdown title="By model" note="Click a model for its derivatives" rows={rows} dims={O_MODEL} />
            <OrderBreakdown title="By funder" note="Click a funder for its models" rows={rows} dims={O_FUNDER} />
            <OrderBreakdown title="Profit bands" rows={rows} dims={O_BAND} defaultSort="label" />
          </div>
          <BestWorst rows={rows} />
          <OrderBuilder rows={rows} />
        </>
      )}
    </div>
  );
}

const O_EXEC: OrderDimKey[] = ["exec"];
const O_MODEL: OrderDimKey[] = ["model", "derivative"];
const O_FUNDER: OrderDimKey[] = ["funder", "model"];
const O_BAND: OrderDimKey[] = ["profitBand"];

// The headline averages: ICE cars, BEV cars and vans side by side.
function SegmentCards({ rows }: { rows: OrderRow[] }) {
  const groups = useMemo(() => new Map(groupOrders(rows, ["segment"]).map((g) => [g.label, g])), [rows]);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {SEGMENTS.map((seg) => {
        const g = groups.get(seg);
        const meta = SEGMENT_META[seg];
        const st = g?.stats;
        const avg = st ? avgProfit(st) : null;
        return (
          <div key={seg} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${meta.colour}` }}>
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold text-slate-900">{meta.title}</div>
              <div className="text-xs text-slate-500">{g ? `${int(g.stats.orders)} units · ${g.share.toFixed(0)}% of orders` : "No orders"}</div>
            </div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Avg profit per unit</div>
            <div className={`text-3xl font-bold tabular-nums ${avg != null && avg < 0 ? "text-rose-700" : "text-slate-900"}`}>{gbp(avg)}</div>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
              <span>Total <b className="tabular-nums">{st ? gbp(st.priced ? st.profit : null) : "—"}</b></span>
              <span>Loss-making <b className={`tabular-nums ${st?.loss ? "text-rose-700" : ""}`}>{st ? int(st.loss) : "—"}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderBreakdown({ title, note, rows, dims, defaultSort = "orders" }: { title: string; note?: string; rows: OrderRow[]; dims: OrderDimKey[]; defaultSort?: OrderSortKey }) {
  const [sort, setSort] = useState<OrderSortKey>(defaultSort);
  const groups = useMemo(() => groupOrders(rows, dims, sort), [rows, dims, sort]);
  return (
    <Card title={title} note={note}>
      <GroupTable groups={groups} dimTitle={orderDimLabel(dims[0])} cols={ORDER_COLS} sort={sort} onSort={(k) => setSort(k as OrderSortKey)} limit={12} />
    </Card>
  );
}

function BestWorst({ rows }: { rows: OrderRow[] }) {
  const priced = useMemo(() => rows.filter((r) => r.profit != null).sort((a, b) => (b.profit as number) - (a.profit as number)), [rows]);
  if (priced.length < 2) return null;
  const n = Math.min(5, Math.floor(priced.length / 2));
  const list = (title: string, items: OrderRow[]) => (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {items.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-1.5 pr-2">
                <div className="font-medium text-slate-900">{r.customer}</div>
                <div className="text-xs text-slate-500">
                  {r.derivative.replace(" (model only)", "")} · {r.exec} ·{" "}
                  {new Date(`${r.day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}
                </div>
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums"><Money n={r.profit} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Card title="Most and least profitable orders">
      <div className="grid gap-6 lg:grid-cols-2">
        {list("Most profitable", priced.slice(0, n))}
        {list("Least profitable", priced.slice(-n).reverse())}
      </div>
    </Card>
  );
}

function OrderBuilder({ rows }: { rows: OrderRow[] }) {
  const [first, setFirst] = useState<OrderDimKey>("segment");
  const [second, setSecond] = useState<OrderDimKey | "">("model");
  const [sort, setSort] = useState<OrderSortKey>("orders");
  const dims = useMemo(() => (second && second !== first ? [first, second] : [first]) as OrderDimKey[], [first, second]);
  const groups = useMemo(() => groupOrders(rows, dims, sort), [rows, dims, sort]);
  return (
    <BuilderCard dims={ORDER_DIMENSIONS} first={first} second={second} setFirst={setFirst} setSecond={setSecond} labelOf={orderDimLabel}>
      <GroupTable key={dims.join("|")} groups={groups} dimTitle={dims.map(orderDimLabel).join(" › ")} cols={ORDER_COLS}
        sort={sort} onSort={(k) => setSort(k as OrderSortKey)} swatches={first === "segment" ? SEGMENT_COLOURS : undefined} />
    </BuilderCard>
  );
}
