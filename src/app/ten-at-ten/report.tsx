"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { shiftAnchor } from "@/lib/period";
import { ALLOCATION_TARGET_MINS, CONTACT_TARGET_MINS, formatMins, formatWall } from "@/lib/business-hours";
import type { EnquiryRow } from "@/lib/enquiries";
import {
  isSameDayReportable,
  isTransferMissing,
  neverContactedOwner,
  partitionByReportability,
  sameDayMissOwner,
  summariseResponse,
  type ResponseSummary,
} from "@/lib/enquiry-reporting";
import {
  DIMENSIONS,
  ORDER_DIMENSIONS,
  SEGMENTS,
  SOURCES,
  avgProfit,
  budgetLines,
  budgetMonths,
  periodProgress,
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
  type BudgetLine,
  type Budgets,
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

type Section = "enquiries" | "response" | "orders" | "deliveries";

export function ReportClient({ payload, orders, deliveries, budgets, responses, reportHorizon, today }: {
  payload: ReportPayload; orders: OrdersPayload; deliveries: OrdersPayload; budgets: Budgets;
  responses: EnquiryRow[]; reportHorizon: number | null; today: string;
}) {
  const enquiryRows = useMemo(() => decodeReport(payload), [payload]);
  const orderRows = useMemo(() => decodeOrders(orders), [orders]);
  // Deliveries arrive as order rows whose `day` is the DELIVERY day and
  // whose `delivery` is the status (Delivered, Arrived, Due).
  const deliveryRows = useMemo(() => decodeOrders(deliveries), [deliveries]);

  const [section, setSection] = useState<Section>("enquiries");
  const [mode, setMode] = useState<PeriodMode>("month");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });

  const range = useMemo(() => rangeFor(mode, anchor, custom), [mode, anchor, custom]);
  const minDay = useMemo(() => {
    if (section === "enquiries") return enquiryRows[0]?.day ?? today;
    if (section === "orders") return orderRows[0]?.day ?? today;
    if (section === "deliveries") return deliveryRows[0]?.day ?? today;
    return responses.reduce((m, r) => (r.enquiryDay < m ? r.enquiryDay : m), today);
  }, [section, enquiryRows, orderRows, deliveryRows, responses, today]);
  const modeMeta = MODES.find((m) => m.key === mode)!;
  const atCurrent = mode !== "custom" && range.startDay <= today && range.endDay >= today;

  return (
    <div className="mt-5 space-y-5">
      {/* Section */}
      <div className="flex gap-1 border-b border-slate-200">
        {([["enquiries", "Enquiries"], ["response", "Response times"], ["orders", "Orders"], ["deliveries", "Deliveries"]] as const).map(([key, label]) => (
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

      {section === "enquiries" && <EnquiriesSection all={enquiryRows} range={range} />}
      {section === "response" && <ResponseSection all={responses} range={range} reportHorizon={reportHorizon} />}
      {section === "orders" && <DealbookSection key="orders" variant="orders" all={orderRows} range={range} />}
      {section === "deliveries" && <DealbookSection key="deliveries" variant="deliveries" all={deliveryRows} range={range} budgets={budgets} today={today} />}
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

const TILE_COLS: Record<number, string> = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" };

function Tiles({ tiles }: { tiles: { label: string; value: string; sub?: string; hero?: boolean; tone?: "good" | "bad" }[] }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${TILE_COLS[tiles.length] ?? "sm:grid-cols-4"}`}>
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${t.hero ? "border-indigo-900 bg-indigo-950 text-white" : "border-slate-200 bg-white"}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.hero ? "text-indigo-200" : "text-slate-500"}`}>{t.label}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-3xl font-bold tabular-nums ${t.hero ? "text-white" : t.tone === "good" ? "text-emerald-700" : t.tone === "bad" ? "text-rose-700" : "text-slate-900"}`}>{t.value}</span>
            {/* The highlighted tile keeps its white figure; on/off target shows as a badge. */}
            {t.hero && t.tone && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.tone === "good" ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/25 text-rose-200"}`}>
                {t.tone === "good" ? "On target" : "Over target"}
              </span>
            )}
          </div>
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
interface Col<S, R = unknown> { key: string; label: string; render: (g: Nested<S, R>) => ReactNode; strong?: boolean; left?: boolean }

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
function hasDetail<S, R>(g: Nested<S, R>): boolean {
  return g.children.length > 1 || (g.children.length === 1 && !g.children[0].label.endsWith("(model only)"));
}

// `detail`, when given, is what a row opens into — the customers behind it
// — instead of its nested groups.
function GroupTable<S, R = unknown>({ groups, dimTitle, cols, sort, onSort, limit, swatches, detail }: {
  groups: Nested<S, R>[]; dimTitle: string; cols: Col<S, R>[]; sort?: string; onSort?: (k: string) => void; limit?: number;
  swatches?: Record<string, string>; detail?: (g: Nested<S, R>) => ReactNode;
}) {
  // Nested rows start collapsed — a group opens when it's clicked.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const shown = limit && !showAll ? groups.slice(0, limit) : groups;
  // Keep labels aligned when only some rows have a chevron.
  const opens = (g: Nested<S, R>) => (detail ? g.rows.length > 0 : hasDetail(g));
  const anyExpandable = groups.some(opens);
  const toggle = (k: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const head = (k: string, label: string, left?: boolean) => (
    <th key={k} className={`px-2 py-2 font-semibold ${left ? "text-left" : "text-right"}`}>
      {onSort && k !== "share" ? (
        <button onClick={() => onSort(k)} className={`hover:text-slate-900 ${sort === k ? "text-slate-900" : ""}`}>{label}{sort === k ? " ↓" : ""}</button>
      ) : label}
    </th>
  );
  const row = (g: Nested<S, R>, depth: number, parent?: string) => {
    const expandable = depth === 0 && opens(g);
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
              {open.has(g.key) && (detail
                ? opens(g) && (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td colSpan={cols.length + 1} className="px-2 py-2">{detail(g)}</td>
                  </tr>
                )
                : hasDetail(g) && g.children.map((c) => row(c, 1, g.key)))}
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
          {/* Same layout as every other tab: by exec full width, opening into
              the customers behind each figure. */}
          <EnquiryBreakdown title="By exec" note="Click an exec for their enquiries" rows={rows} dims={EXEC_DIMS} customers />
          <EnquiryBreakdown title="By model" note="Click a model for its derivatives" rows={rows} dims={MODEL_DIMS} />
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

function EnquiryBreakdown({ title, note, rows, dims, customers }: { title: string; note?: string; rows: ReportRow[]; dims: DimKey[]; customers?: boolean }) {
  const [sort, setSort] = useState<SortKey>("enquiries");
  const groups = useMemo(() => groupRows(rows, dims, sort), [rows, dims, sort]);
  return (
    <Card title={title} note={note}>
      <GroupTable groups={groups} dimTitle={dimLabel(dims[0])} cols={ENQ_COLS} sort={sort} onSort={(k) => setSort(k as SortKey)} limit={12}
        detail={customers ? (g) => <EnquiryList rows={g.rows} /> : undefined} />
    </Card>
  );
}

const OUTCOME_TONE: Record<string, string> = { order: "text-emerald-700 font-semibold", live: "text-slate-700", lost: "text-slate-400" };

// One line per enquiry, newest first: who, from where, for what, and where it got to.
function EnquiryList({ rows }: { rows: ReportRow[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.day.localeCompare(a.day) || a.customer.localeCompare(b.customer)), [rows]);
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wide text-slate-400">
        <tr>
          <th className="px-2 py-1 text-left font-semibold">Customer</th>
          <th className="px-2 py-1 text-left font-semibold">Source</th>
          <th className="px-2 py-1 text-left font-semibold">Vehicle</th>
          <th className="px-2 py-1 text-left font-semibold">Enquired</th>
          <th className="px-2 py-1 text-right font-semibold">Status</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i} className="border-t border-slate-100 align-top">
            <td className="max-w-[260px] truncate px-2 py-1 font-medium text-slate-800" title={r.customer}>{r.customer}</td>
            <td className="whitespace-nowrap px-2 py-1 text-slate-600">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: SOURCE_COLOURS[r.source] ?? "#94a3b8" }} />{r.source}
            </td>
            <td className="max-w-[420px] truncate px-2 py-1 text-slate-600" title={r.derivative}>{r.derivative.replace(" (model only)", "")}</td>
            <td className="whitespace-nowrap px-2 py-1 text-slate-600">{shortDate(r.day)}</td>
            <td className={`whitespace-nowrap px-2 py-1 text-right ${OUTCOME_TONE[r.outcome] ?? "text-slate-600"}`}>{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

// The count column reads "Orders" or "Deliveries" to match the tab.
const orderCols = (unit: string): Col<OrderStats>[] => [
  { key: "orders", label: unit, render: (g) => int(g.stats.orders) },
  { key: "share", label: "Share", left: true, render: (g) => <ShareCell share={g.share} /> },
  { key: "profit", label: "Total profit", render: (g) => <Money n={g.stats.priced ? g.stats.profit : null} /> },
  { key: "avg", label: "Avg profit", strong: true, render: (g) => <Money n={avgProfit(g.stats)} /> },
  { key: "loss", label: "Loss-making", render: (g) => <span className={g.stats.loss ? "text-rose-700" : "text-slate-400"}>{int(g.stats.loss)}</span> },
];
const ORDER_COLS = orderCols("Orders");
const DELIVERY_COLS = orderCols("Deliveries");

const SEGMENT_COLOURS = Object.fromEntries(Object.entries(SEGMENT_META).map(([k, v]) => [k, v.colour]));
type SegmentName = (typeof SEGMENTS)[number];

const STATUSES = ["Delivered", "Arrived", "Due"] as const;
type StatusName = (typeof STATUSES)[number];
const STATUS_COLOURS: Record<string, string> = { Delivered: "#047857", Arrived: "#0891b2", Due: "#94a3b8" };

// Orders and Deliveries are the same Dealbook report counted two ways —
// by order date, or by delivery date with a status — so one section serves
// both. Deliveries adds the status filter and the department budget panel.
function DealbookSection({ all, range, variant, budgets, today }: { all: OrderRow[]; range: Range; variant: "orders" | "deliveries"; budgets?: Budgets; today?: string }) {
  const isDel = variant === "deliveries";
  const [segments, setSegments] = useState<Set<SegmentName>>(new Set());
  const [statuses, setStatuses] = useState<Set<StatusName>>(new Set());
  const [exec, setExec] = useState("");
  const [model, setModel] = useState("");
  const [funder, setFunder] = useState("");

  const periodAll = useMemo(() => inRange(all, range), [all, range]);
  const rows = useMemo(
    () => periodAll.filter((r) =>
      (segments.size === 0 || segments.has(r.segment as SegmentName)) && (statuses.size === 0 || statuses.has(r.delivery as StatusName))
      && (!exec || r.exec === exec) && (!model || r.model === model) && (!funder || r.funder === funder)),
    [periodAll, segments, statuses, exec, model, funder],
  );
  const options = useMemo(() => ({
    exec: groupOrders(periodAll, ["exec"]).map((g) => g.label),
    model: groupOrders(periodAll, ["model"]).map((g) => g.label),
    funder: groupOrders(periodAll, ["funder"]).map((g) => g.label),
  }), [periodAll]);
  const filtersOn = segments.size > 0 || statuses.size > 0 || !!exec || !!model || !!funder;
  const s = orderStatsOf(rows);
  const noun = isDel ? "deliveries" : "orders";
  const dateLabel = isDel ? "Delivery" : "Ordered";
  const statusLabel = isDel ? "Status" : "Delivery";
  const cols = isDel ? DELIVERY_COLS : ORDER_COLS;

  if (all.length === 0) {
    return <Empty>No {noun} yet. Upload {isDel ? "Dealbook – Deliveries" : "Dealbook – Orders"} from <a href="/ten-at-ten/admin" className="font-medium text-indigo-600">Upload data</a>.</Empty>;
  }

  const delivered = rows.filter((r) => r.delivery === "Delivered").length;
  const tiles = isDel
    ? [
      { label: "Going", value: int(rows.length), sub: "delivered + arrived + due" },
      { label: "Delivered", value: int(delivered), sub: rows.length ? `${Math.round((delivered / rows.length) * 100)}% of what's going` : undefined },
      { label: "Still to deliver", value: int(rows.length - delivered), sub: `${int(rows.filter((r) => r.delivery === "Arrived").length)} arrived · ${int(rows.filter((r) => r.delivery !== "Delivered" && r.delivery !== "Arrived").length)} due` },
      { label: "Total profit", value: gbp(s.priced ? s.profit : null) },
      { label: "Avg profit per unit", value: gbp(avgProfit(s)), hero: true },
    ]
    : [
      { label: "Orders", value: int(s.orders), sub: s.orders > s.priced ? `${int(s.orders - s.priced)} without a profit figure yet` : undefined },
      { label: "Total profit", value: gbp(s.priced ? s.profit : null) },
      { label: "Avg profit per unit", value: gbp(avgProfit(s)), hero: true },
    ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</span>
        <Chips options={SEGMENTS} selected={segments} onChange={setSegments} colours={SEGMENT_COLOURS} />
        {isDel && <Chips options={STATUSES} selected={statuses} onChange={setStatuses} colours={STATUS_COLOURS} />}
        <Select value={exec} onChange={setExec} all="All execs" options={options.exec} />
        <Select value={model} onChange={setModel} all="All models" options={options.model} />
        <Select value={funder} onChange={setFunder} all="All funders" options={options.funder} />
        {filtersOn && <button onClick={() => { setSegments(new Set()); setStatuses(new Set()); setExec(""); setModel(""); setFunder(""); }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Clear filters</button>}
      </div>
      {isDel && budgets && today && <BudgetPanel rows={periodAll} range={range} budgets={budgets} today={today} />}
      <Tiles tiles={tiles} />
      {rows.length === 0 ? (
        <Empty>No {noun} in {range.label}{filtersOn ? " with these filters" : ""}.</Empty>
      ) : (
        <>
          <SegmentCards rows={rows} noun={isDel ? "deliveries" : "orders"} />
          {/* The two tables that open into customer lists get the full width. */}
          <OrderBreakdown title="By exec" note="Click an exec for their customers" rows={rows} dims={O_EXEC} customers="date" dateLabel={dateLabel} statusLabel={statusLabel} cols={cols} />
          <div className="grid gap-5 lg:grid-cols-2">
            <OrderBreakdown title="By model" note="Click a model for its derivatives" rows={rows} dims={O_MODEL} cols={cols} />
            <OrderBreakdown title="By funder" note="Click a funder for its models" rows={rows} dims={O_FUNDER} cols={cols} />
          </div>
          <OrderBreakdown title="Profit bands" note="Click a band for its customers" rows={rows} dims={O_BAND} defaultSort="label" customers="profit" dateLabel={dateLabel} statusLabel={statusLabel} cols={cols} />
          <BestWorst rows={rows} title={isDel ? "Most and least profitable deliveries" : "Most and least profitable orders"} />
          <OrderBuilder rows={rows} cols={cols} />
        </>
      )}
    </div>
  );
}

// Department vs budget: Car, CV and combined, for the whole months in the
// period. Always the department — the filters above don't narrow it.
function BudgetPanel({ rows, range, budgets, today }: { rows: OrderRow[]; range: Range; budgets: Budgets; today: string }) {
  const months = budgetMonths(range);
  if (!months) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-2.5 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">Budget</span> is set by month — choose Month or Quarter (or a custom range of whole months) to compare against it.
      </div>
    );
  }
  const lines = budgetLines(rows, budgets, months);
  const pace = { ...periodProgress(range, today), word: months.length === 1 ? "month" : months.length === 3 && range.label.startsWith("Q") ? "quarter" : "period" };
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {([["car", "Car", "#334155"], ["cv", "CV (commercial)", SEGMENT_META.Van.colour], ["combined", "Combined", "#312e81"]] as const).map(([k, title, colour]) => (
        <BudgetCard key={k} title={title} colour={colour} line={lines[k]} pace={pace} />
      ))}
    </div>
  );
}

// Two questions, kept apart. First the overall number: everything Dealbook
// says is going in the period against budget, and the gap. Then, separately,
// how much of what's going has actually been handed over.
function BudgetCard({ title, colour, line, pace }: { title: string; colour: string; line: BudgetLine; pace: { day: number; days: number; pct: number; word: string } }) {
  const { budget, going, delivered, arrived, due, missing } = line;
  const gap = budget == null ? null : going - budget;
  const ofBudget = budget ? Math.round((going / budget) * 100) : null;
  const deliveredPct = going ? Math.round((delivered / going) * 100) : null;
  const bar = (n: number, of: number) => `${of ? Math.min(100, (n / of) * 100) : 0}%`;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${colour}` }}>
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{budget == null ? "No budget set" : `Budget ${int(budget)}`}</div>
      </div>

      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Going vs budget</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{int(going)}</span>
        {budget != null && <span className="text-sm text-slate-500">of {int(budget)} · {ofBudget}%</span>}
      </div>
      {budget != null && (
        <>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" title={`${going} going against a budget of ${budget}`}>
            <div className="h-full rounded-full" style={{ width: bar(going, budget), background: colour }} />
          </div>
          <div className={`mt-1 text-sm font-semibold ${gap! >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {gap! >= 0 ? `${int(gap!)} over budget` : `${int(-gap!)} short of budget`}
          </div>
        </>
      )}
      {missing.length > 0 && budget != null && <div className="text-xs text-amber-700">No budget set for {missing.join(", ")}</div>}

      <div className="mt-3 border-t border-slate-100 pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Delivered of what&apos;s going</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-slate-900">{deliveredPct == null ? "—" : `${deliveredPct}%`}</span>
          <span className="text-xs text-slate-500">{int(delivered)} of {int(going)} delivered</span>
        </div>
        {/* The marker is how far through the period today is — delivered
            share against time gone is the pace check. */}
        <div className="relative mt-1 h-1.5 w-full rounded-full bg-slate-100" title={`${pace.pct.toFixed(0)}% through the ${pace.word} (day ${pace.day} of ${pace.days})`}>
          <div className="h-full rounded-full" style={{ width: bar(delivered, going), background: colour, opacity: 0.7 }} />
          <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-slate-900" style={{ left: `calc(${Math.min(100, pace.pct)}% - 1px)` }} />
        </div>
        {deliveredPct != null && (
          <div className="mt-1 text-xs text-slate-600">
            vs <b>{pace.pct.toFixed(0)}%</b> through the {pace.word} <span className="text-slate-400">(day {pace.day} of {pace.days})</span> —{" "}
            <b className={deliveredPct >= Math.round(pace.pct) ? "text-emerald-700" : "text-rose-700"}>
              {deliveredPct >= Math.round(pace.pct) ? `${deliveredPct - Math.round(pace.pct)} pts ahead of pace` : `${Math.round(pace.pct) - deliveredPct} pts behind pace`}
            </b>
          </div>
        )}
        <div className="mt-0.5 text-xs text-slate-500">{int(arrived + due)} still to deliver · {int(arrived)} arrived · {int(due)} due</div>
      </div>
    </div>
  );
}

const O_EXEC: OrderDimKey[] = ["exec"];
const O_MODEL: OrderDimKey[] = ["model", "derivative"];
const O_FUNDER: OrderDimKey[] = ["funder", "model"];
const O_BAND: OrderDimKey[] = ["profitBand"];

// The headline averages: ICE cars, BEV cars and vans side by side.
function SegmentCards({ rows, noun = "orders" }: { rows: OrderRow[]; noun?: string }) {
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
              <div className="text-xs text-slate-500">{g ? `${int(g.stats.orders)} units · ${g.share.toFixed(0)}% of ${noun}` : `No ${noun}`}</div>
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

function OrderBreakdown({ title, note, rows, dims, defaultSort = "orders", customers, dateLabel, statusLabel, cols = ORDER_COLS }: {
  title: string; note?: string; rows: OrderRow[]; dims: OrderDimKey[]; defaultSort?: OrderSortKey; cols?: Col<OrderStats>[];
  /** Open each row into its individual orders, newest first or lowest profit first. */
  customers?: "date" | "profit";
  dateLabel?: string; statusLabel?: string;
}) {
  const [sort, setSort] = useState<OrderSortKey>(defaultSort);
  const groups = useMemo(() => groupOrders(rows, dims, sort), [rows, dims, sort]);
  return (
    <Card title={title} note={note}>
      <GroupTable groups={groups} dimTitle={orderDimLabel(dims[0])} cols={cols} sort={sort} onSort={(k) => setSort(k as OrderSortKey)} limit={12}
        detail={customers ? (g) => <OrderList rows={g.rows} by={customers} showExec={dims[0] !== "exec"} dateLabel={dateLabel} statusLabel={statusLabel} /> : undefined} />
    </Card>
  );
}

// One line per order: who bought what, when, how it was funded, and what it made.
function OrderList({ rows, by, showExec = true, dateLabel = "Ordered", statusLabel = "Delivery" }: {
  rows: OrderRow[]; by: "date" | "profit"; showExec?: boolean; dateLabel?: string; statusLabel?: string;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) =>
    by === "date" ? b.day.localeCompare(a.day) || a.customer.localeCompare(b.customer) : (a.profit ?? Infinity) - (b.profit ?? Infinity),
  ), [rows, by]);
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wide text-slate-400">
        <tr>
          <th className="px-2 py-1 text-left font-semibold">Customer</th>
          <th className="px-2 py-1 text-left font-semibold">Vehicle</th>
          {showExec && <th className="px-2 py-1 text-left font-semibold">Exec</th>}
          <th className="px-2 py-1 text-left font-semibold">{dateLabel}</th>
          <th className="px-2 py-1 text-left font-semibold">Funder</th>
          <th className="px-2 py-1 text-left font-semibold">{statusLabel}</th>
          <th className="px-2 py-1 text-right font-semibold">Profit</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i} className="border-t border-slate-100 align-top">
            <td className="max-w-[260px] truncate px-2 py-1 font-medium text-slate-800" title={r.customer}>{r.customer}</td>
            <td className="max-w-[420px] truncate px-2 py-1 text-slate-600" title={r.derivative}>{r.derivative.replace(" (model only)", "")}</td>
            {showExec && <td className="whitespace-nowrap px-2 py-1 text-slate-600">{r.exec}</td>}
            <td className="whitespace-nowrap px-2 py-1 text-slate-600">{shortDate(r.day)}</td>
            <td className="whitespace-nowrap px-2 py-1 text-slate-600">{r.funder}</td>
            <td className="whitespace-nowrap px-2 py-1 text-slate-600">{r.delivery}</td>
            <td className="px-2 py-1 text-right font-semibold tabular-nums"><Money n={r.profit} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

function BestWorst({ rows, title = "Most and least profitable orders" }: { rows: OrderRow[]; title?: string }) {
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
                  {r.derivative.replace(" (model only)", "")} · {r.exec} · {shortDate(r.day)}
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
    <Card title={title}>
      <div className="grid gap-6 lg:grid-cols-2">
        {list("Most profitable", priced.slice(0, n))}
        {list("Least profitable", priced.slice(-n).reverse())}
      </div>
    </Card>
  );
}

function OrderBuilder({ rows, cols = ORDER_COLS }: { rows: OrderRow[]; cols?: Col<OrderStats>[] }) {
  const [first, setFirst] = useState<OrderDimKey>("segment");
  const [second, setSecond] = useState<OrderDimKey | "">("model");
  const [sort, setSort] = useState<OrderSortKey>("orders");
  const dims = useMemo(() => (second && second !== first ? [first, second] : [first]) as OrderDimKey[], [first, second]);
  const groups = useMemo(() => groupOrders(rows, dims, sort), [rows, dims, sort]);
  return (
    <BuilderCard dims={ORDER_DIMENSIONS} first={first} second={second} setFirst={setFirst} setSecond={setSecond} labelOf={orderDimLabel}>
      <GroupTable key={dims.join("|")} groups={groups} dimTitle={dims.map(orderDimLabel).join(" › ")} cols={cols}
        sort={sort} onSort={(k) => setSort(k as OrderSortKey)} swatches={first === "segment" ? SEGMENT_COLOURS : undefined} />
    </BuilderCard>
  );
}

// ─── Response times (formerly the Enquiry Tracker) ─────────────────────────
//
// The MotorComplete enquiry export, judged against target in working hours
// only (Mon–Fri 09:00–17:30): allocation — raised to passed to an exec —
// within 5 minutes, first contact — passed to contacted — within 15, and
// contact the same day for anything in before 17:30. An enquiry is only
// judged once it has had a full working day (partitionByReportability), so
// every figure is final; the rest are held and listed.

type Focus = "alloc" | "contact" | "sameday";
type RGroup = Nested<ResponseSummary, EnquiryRow>;

const timeTone = (avg: number | null, target: number): "good" | "bad" | undefined =>
  avg == null ? undefined : avg <= target ? "good" : "bad";

function rGroups(rows: EnquiryRow[], keyOf: (r: EnquiryRow) => string, labelOf: (k: string) => string = (k) => k, total = rows.length): RGroup[] {
  const m = new Map<string, EnquiryRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const b = m.get(k);
    if (b) b.push(r); else m.set(k, [r]);
  }
  return [...m].map(([key, rs]) => ({ key, label: labelOf(key), stats: summariseResponse(rs), share: total ? (rs.length / total) * 100 : 0, rows: rs, children: [] }));
}

function ResponseSection({ all, range, reportHorizon }: { all: EnquiryRow[]; range: Range; reportHorizon: number | null }) {
  const [exec, setExec] = useState("");
  const periodAll = useMemo(() => all.filter((r) => r.enquiryDay >= range.startDay && r.enquiryDay <= range.endDay), [all, range]);
  const execOptions = useMemo(() => [...new Set(periodAll.map((r) => r.salesExec))].sort(), [periodAll]);
  const periodRows = useMemo(() => periodAll.filter((r) => !exec || r.salesExec === exec), [periodAll, exec]);
  const { reportable, held } = useMemo(() => partitionByReportability(periodRows, reportHorizon), [periodRows, reportHorizon]);
  const s = useMemo(() => summariseResponse(reportable), [reportable]);

  const attention = useMemo((): RGroup[] => {
    const make = (label: string, rows: EnquiryRow[]): RGroup =>
      ({ key: label, label, stats: summariseResponse(rows), share: reportable.length ? (rows.length / reportable.length) * 100 : 0, rows, children: [] });
    return [
      make("Missed same day — exec", reportable.filter((r) => sameDayMissOwner(r) === "exec")),
      make("Missed same day — late allocation (Sales Support)", reportable.filter((r) => sameDayMissOwner(r) === "salesSupport")),
      make("Never contacted — exec", reportable.filter((r) => neverContactedOwner(r) === "exec")),
      make(`First contact over ${CONTACT_TARGET_MINS} min`, reportable.filter((r) => r.contactMins != null && r.contactMins > CONTACT_TARGET_MINS)),
      make(`Allocation over ${ALLOCATION_TARGET_MINS} min`, reportable.filter((r) => r.allocMins != null && r.allocMins > ALLOCATION_TARGET_MINS)),
      make("Never passed to an exec (Sales Support)", reportable.filter((r) => isTransferMissing(r))),
    ];
  }, [reportable]);
  const byExec = useMemo(() => {
    const execs = rGroups(reportable, (r) => r.salesExec)
      // Worst first: most same-day misses of their own, then slowest response.
      .sort((a, b) => b.stats.sameDayMissedExec - a.stats.sameDayMissedExec || (b.stats.contactAvg ?? -1) - (a.stats.contactAvg ?? -1));
    // Sales Support carries the misses an exec couldn't have prevented: leads
    // passed over too late to call that day, never passed over, or allocated
    // over target. Its figures are allocation figures (target 5 minutes).
    const supportRows = reportable.filter((r) =>
      sameDayMissOwner(r) === "salesSupport" || isTransferMissing(r) || (r.allocMins != null && r.allocMins > ALLOCATION_TARGET_MINS));
    const support: RGroup = { key: SALES_SUPPORT, label: SALES_SUPPORT, stats: summariseResponse(reportable), share: 100, rows: supportRows, children: [] };
    return reportable.length ? [...execs, support] : execs;
  }, [reportable]);
  const byDay = useMemo(() => rGroups(reportable, (r) => r.enquiryDay, dayLabel).sort((a, b) => b.key.localeCompare(a.key)), [reportable]);

  if (all.length === 0) {
    return <Empty>No response-time data yet. Upload a MotorComplete enquiry export from <a href="/ten-at-ten/admin" className="font-medium text-indigo-600">Upload data</a>.</Empty>;
  }

  const sameDayPct = s.sameDayExpected ? Math.round((s.sameDayMet / s.sameDayExpected) * 100) : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</span>
        <Select value={exec} onChange={setExec} all="All execs" options={execOptions} />
        <span className="text-[11px] text-slate-400">Working hours only: Mon–Fri 09:00–17:30.</span>
      </div>
      {held.length > 0 && (
        <HeldNote rows={held} />
      )}
      <Tiles tiles={[
        { label: "Enquiries", value: int(s.total), sub: "judged in this period" },
        { label: `Allocation · target ${ALLOCATION_TARGET_MINS}m`, value: formatMins(s.allocAvg), tone: timeTone(s.allocAvg, ALLOCATION_TARGET_MINS), sub: `${s.allocHit} on target · ${s.allocMissed} over` },
        { label: `First contact · target ${CONTACT_TARGET_MINS}m`, value: formatMins(s.contactAvg), hero: true, tone: timeTone(s.contactAvg, CONTACT_TARGET_MINS), sub: `${s.contactHit} on target · ${s.contactMissed} over` },
        { label: "Same-day contact", value: sameDayPct == null ? "—" : `${sameDayPct}%`, tone: s.sameDayExpected ? (s.sameDayMissed === 0 ? "good" : "bad") : undefined, sub: `${s.sameDayMissed} missed of ${s.sameDayExpected} · ${s.sameDayMissedSupport} late allocation` },
        { label: "Never contacted", value: int(s.neverContacted), tone: s.neverContacted > 0 ? "bad" : undefined, sub: `${s.noTransfer} never passed to an exec` },
      ]} />
      {reportable.length === 0 ? (
        <Empty>No enquiries to judge in {range.label}{exec ? ` for ${exec}` : ""} yet.</Empty>
      ) : (
        <>
          <Card title="Needs attention" note="Click a line for the customers behind it">
            <GroupTable groups={attention} dimTitle="Issue" cols={ATTENTION_COLS} detail={(g) => <ResponseList rows={g.rows} focus={focusFor(g.key)} />} />
          </Card>
          <Card title="By exec" note="An exec's figures run from when the lead reached them; Sales Support's are allocation (target 5m) · click a row for its customers">
            <GroupTable groups={byExec} dimTitle="Exec" cols={EXEC_RESPONSE_COLS} detail={(g) => <ResponseList rows={g.rows} focus={g.key === SALES_SUPPORT ? "alloc" : "contact"} />} />
          </Card>
          <Card title="By day" note="Click a day for its customers">
            <GroupTable groups={byDay} dimTitle="Day" cols={DAY_COLS} limit={14} detail={(g) => <ResponseList rows={g.rows} focus="sameday" />} />
          </Card>
        </>
      )}
    </div>
  );
}

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).replace(",", "");

const SALES_SUPPORT = "Sales Support · allocation";

const focusFor = (label: string): Focus =>
  label.startsWith("Allocation") || label.startsWith("Never passed") || label.includes("late allocation") ? "alloc"
    : label.startsWith("Missed same day") ? "sameday" : "contact";

const ATTENTION_COLS: Col<ResponseSummary, EnquiryRow>[] = [
  { key: "count", label: "Enquiries", render: (g) => <span className={g.rows.length ? "font-semibold text-rose-700" : "text-slate-400"}>{int(g.rows.length)}</span> },
  { key: "share", label: "Of all judged", left: true, render: (g) => <ShareCell share={g.share} /> },
];

const minsCell = (avg: number | null, target: number) => (
  <span className={`font-semibold ${avg == null ? "text-slate-400" : avg <= target ? "text-emerald-700" : "text-rose-700"}`}>{formatMins(avg)}</span>
);

// Each exec is judged only on what reached them in time; the Sales Support
// row carries allocation and the misses that came from it.
const isSupport = (g: { key: string }) => g.key === SALES_SUPPORT;
const EXEC_RESPONSE_COLS: Col<ResponseSummary, EnquiryRow>[] = [
  { key: "total", label: "Enquiries", render: (g) => int(g.stats.total) },
  { key: "avg", label: "Avg response", render: (g) => (isSupport(g) ? minsCell(g.stats.allocAvg, ALLOCATION_TARGET_MINS) : minsCell(g.stats.contactAvg, CONTACT_TARGET_MINS)) },
  { key: "over", label: "Over target", render: (g) => { const n = isSupport(g) ? g.stats.allocMissed : g.stats.contactMissed; return <span className={n ? "text-rose-700" : "text-slate-400"}>{int(n)}</span>; } },
  { key: "sameday", label: "Missed same day", strong: true, render: (g) => { const n = isSupport(g) ? g.stats.sameDayMissedSupport : g.stats.sameDayMissedExec; return <span className={n ? "text-rose-700" : "text-emerald-700"}>{int(n)}</span>; } },
  { key: "never", label: "Never contacted", render: (g) => { const n = isSupport(g) ? g.stats.noTransfer : g.stats.neverContactedExec; return <span className={n ? "text-rose-700" : "text-slate-400"}>{int(n)}</span>; } },
];

const DAY_COLS: Col<ResponseSummary, EnquiryRow>[] = [
  { key: "total", label: "Enquiries", render: (g) => int(g.stats.total) },
  { key: "scope", label: "In scope", render: (g) => <span className="text-slate-500">{int(g.stats.sameDayExpected)}</span> },
  { key: "missed", label: "Missed same day", strong: true, render: (g) => <span className={g.stats.sameDayMissed ? "text-rose-700" : "text-emerald-700"}>{int(g.stats.sameDayMissed)}</span> },
  { key: "pct", label: "Same day", render: (g) => (g.stats.sameDayExpected ? `${Math.round((g.stats.sameDayMet / g.stats.sameDayExpected) * 100)}%` : "—") },
  { key: "avg", label: `Avg response (${CONTACT_TARGET_MINS}m)`, render: (g) => minsCell(g.stats.contactAvg, CONTACT_TARGET_MINS) },
];

function HeldNote({ rows }: { rows: EnquiryRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{rows.length} {rows.length === 1 ? "enquiry is" : "enquiries are"} not judged yet</span>
          {" — "}raised too recently to have had a full working day to be actioned. They count once that day has closed, so every figure here is final.
        </p>
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          {open ? "Hide" : "See them"}
        </button>
      </div>
      {open && <div className="mt-2"><ResponseList rows={rows} focus="contact" /></div>}
    </div>
  );
}

// One line per enquiry: who, which exec, its timeline, and the clock that
// matters for the view — allocation is sales support's, response the exec's.
function ResponseList({ rows, focus }: { rows: EnquiryRow[]; focus: Focus }) {
  const sorted = useMemo(() => [...rows].sort((a, b) =>
    focus === "alloc" ? (b.allocMins ?? -1) - (a.allocMins ?? -1)
      : focus === "contact" ? (b.contactMins ?? -1) - (a.contactMins ?? -1)
      : b.enquiryAt - a.enquiryAt,
  ), [rows, focus]);
  const target = focus === "alloc" ? ALLOCATION_TARGET_MINS : CONTACT_TARGET_MINS;
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wide text-slate-400">
        <tr>
          <th className="px-2 py-1 text-left font-semibold">Customer</th>
          <th className="px-2 py-1 text-left font-semibold">Exec</th>
          <th className="px-2 py-1 text-left font-semibold">Raised</th>
          <th className="px-2 py-1 text-left font-semibold">Passed to exec</th>
          <th className="px-2 py-1 text-left font-semibold">First contact</th>
          <th className="px-2 py-1 text-right font-semibold">{focus === "alloc" ? "Allocation" : "Response"}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const mins = focus === "alloc" ? r.allocMins : r.contactMins;
          return (
            <tr key={r.id} className="border-t border-slate-100 align-top">
              <td className="px-2 py-1">
                <div className="font-medium text-slate-800">{r.customer}</div>
                {r.source && <div className="text-[10px] text-slate-400">{r.source}</div>}
              </td>
              <td className="px-2 py-1 text-slate-600">{r.salesExec}</td>
              <td className="whitespace-nowrap px-2 py-1 font-mono text-[11px] text-slate-600">{formatWall(r.enquiryAt)}</td>
              <td className="whitespace-nowrap px-2 py-1 font-mono text-[11px] text-slate-500">{formatWall(r.transferredAt)}</td>
              <td className="whitespace-nowrap px-2 py-1 font-mono text-[11px] text-slate-500">{formatWall(r.contactedAt)}</td>
              <td className="px-2 py-1 text-right">
                <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${mins == null ? "bg-slate-100 text-slate-400" : mins <= target ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>
                  {formatMins(mins)}
                </span>
                {isSameDayReportable(r) && !r.sameDayMet && <div className="mt-0.5 text-[10px] font-bold uppercase text-rose-600">not same day</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
