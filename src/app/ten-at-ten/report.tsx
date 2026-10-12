"use client";

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { shiftAnchor } from "@/lib/period";
import { ALLOCATION_TARGET_MINS, CONTACT_TARGET_MINS, formatMins, formatWall } from "@/lib/business-hours";
import type { EnquiryRow } from "@/lib/enquiries";
import type { MarketOverview, MarketSegmentView } from "@/lib/market-overview";
import type { CompetitorRow } from "@/lib/market-slots";
import type { RangeStats } from "@/lib/market-trends";
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
  brokerPct,
  budgetLines,
  budgetMonths,
  periodProgress,
  conversionPct,
  daysToCancel,
  decodeOrders,
  decodeReport,
  dimLabel,
  groupOrders,
  groupRows,
  inRange,
  inboundPct,
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
  type CancellationView,
} from "@/lib/ten-at-ten-report";
import { saveCancellationNoteAction, setCancellationStatusAction } from "./actions";

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

type Section = "summary" | "enquiries" | "response" | "orders" | "deliveries" | "cancellations" | "market";

const SECTIONS: [Section, string][] = [
  ["summary", "Summary"], ["enquiries", "Enquiries"], ["response", "Response times"], ["orders", "Orders"],
  ["deliveries", "Deliveries"], ["cancellations", "Cancellations"], ["market", "Market Analysis"],
];

export function ReportClient({ payload, orders, deliveries, budgets, responses, reportHorizon, today, cancellations, cancelledOrderDays, market }: {
  payload: ReportPayload; orders: OrdersPayload; deliveries: OrdersPayload; budgets: Budgets;
  responses: EnquiryRow[]; reportHorizon: number | null; today: string;
  /** Every cancellation, already classified on the server. */
  cancellations: CancellationView[];
  /** Order days of held orders that were later cancelled — left out of Orders. */
  cancelledOrderDays: string[];
  /** The latest scrape, summarised; null before the first one. */
  market: MarketOverview | null;
}) {
  const enquiryRows = useMemo(() => decodeReport(payload), [payload]);
  const orderRows = useMemo(() => decodeOrders(orders), [orders]);
  // Deliveries arrive as order rows whose `day` is the DELIVERY day and
  // whose `delivery` is the status (Delivered, Arrived, Due).
  const deliveryRows = useMemo(() => decodeOrders(deliveries), [deliveries]);

  const [section, setSection] = useState<Section>("summary");
  const [mode, setMode] = useState<PeriodMode>("month");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });

  const range = useMemo(() => rangeFor(mode, anchor, custom), [mode, anchor, custom]);
  const minDay = useMemo(() => {
    if (section === "summary") {
      return [enquiryRows[0]?.day, orderRows[0]?.day, deliveryRows[0]?.day, today].filter((d): d is string => !!d).sort()[0];
    }
    if (section === "enquiries") return enquiryRows[0]?.day ?? today;
    if (section === "orders") return orderRows[0]?.day ?? today;
    if (section === "deliveries") return deliveryRows[0]?.day ?? today;
    if (section === "cancellations") return cancellations.reduce((m, c) => (c.day < m ? c.day : m), today);
    return responses.reduce((m, r) => (r.enquiryDay < m ? r.enquiryDay : m), today);
  }, [section, enquiryRows, orderRows, deliveryRows, responses, cancellations, today]);
  const modeMeta = MODES.find((m) => m.key === mode)!;
  const atCurrent = mode !== "custom" && range.startDay <= today && range.endDay >= today;

  return (
    <div className="mt-5 space-y-5">
      {/* Section */}
      <div className="flex gap-1 border-b border-slate-200">
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${section === key ? "border-indigo-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Period, shared by every section but the market, which is always the latest scrape */}
      {section !== "market" && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
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
      </div>}

      {section === "summary" && (
        <SummarySection range={range} today={today} enquiries={enquiryRows} responses={responses} reportHorizon={reportHorizon}
          orders={orderRows} deliveries={deliveryRows} budgets={budgets} cancellations={cancellations}
          cancelledOrderDays={cancelledOrderDays} market={market} open={setSection} />
      )}

      {section === "enquiries" && <EnquiriesSection all={enquiryRows} range={range} />}
      {section === "response" && <ResponseSection all={responses} range={range} reportHorizon={reportHorizon} />}
      {section === "orders" && <DealbookSection key="orders" variant="orders" all={orderRows} range={range}
        cancelledDays={cancelledOrderDays} onShowCancellations={() => setSection("cancellations")} />}
      {section === "deliveries" && <DealbookSection key="deliveries" variant="deliveries" all={deliveryRows} range={range} budgets={budgets} today={today} />}
      {section === "cancellations" && <CancellationsSection all={cancellations} range={range} />}
      {section === "market" && <MarketSection market={market} />}
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

// Conversion three ways, always side by side: inbound (MotorComplete) and
// broker / prospect, which together make overall.
const ENQ_COLS: Col<Stats>[] = [
  { key: "enquiries", label: "Enquiries", render: (g) => int(g.stats.enquiries) },
  { key: "share", label: "Share", left: true, render: (g) => <ShareCell share={g.share} /> },
  { key: "orders", label: "Orders", render: (g) => int(g.stats.orders) },
  { key: "inbound", label: "Inbound conv.", render: (g) => pct(inboundPct(g.stats)) },
  { key: "broker", label: "Broker conv.", render: (g) => pct(brokerPct(g.stats)) },
  { key: "conversion", label: "Overall conv.", strong: true, render: (g) => pct(conversionPct(g.stats)) },
  { key: "live", label: "Live", render: (g) => <span className="text-slate-500">{int(g.stats.live)}</span> },
  { key: "lost", label: "Lost", render: (g) => <span className="text-slate-500">{int(g.stats.lost)}</span> },
];

// By source, each source is wholly inbound or wholly broker, so one rate says it.
const SOURCE_COLS: Col<Stats>[] = ENQ_COLS
  .filter((c) => c.key !== "inbound" && c.key !== "broker")
  .map((c) => (c.key === "conversion" ? { ...c, label: "Conv." } : c));

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
      <ConversionPanel s={s} />
      <Tiles tiles={[
        { label: "Enquiries", value: int(s.enquiries), sub: `${int(s.inboundEnquiries)} inbound · ${int(s.enquiries - s.inboundEnquiries)} broker / prospect` },
        { label: "Orders", value: int(s.orders), sub: `${int(s.inboundOrders)} inbound · ${int(s.orders - s.inboundOrders)} broker / prospect` },
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

// The three conversions, kept apart: inbound is the MotorComplete leads
// alone, broker / prospect the rest, and overall the two together.
function ConversionPanel({ s }: { s: Stats }) {
  const brokerEnq = s.enquiries - s.inboundEnquiries;
  const cards = [
    { title: "Inbound conversion", what: "MotorComplete leads — TF Lead, Leasing.com, LeaseLoco, CarWow", colour: "#4f46e5", rate: inboundPct(s), orders: s.inboundOrders, enquiries: s.inboundEnquiries },
    { title: "Broker / Prospect conversion", what: "Every other source", colour: SOURCE_COLOURS["Broker / Prospect"], rate: brokerPct(s), orders: s.orders - s.inboundOrders, enquiries: brokerEnq },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${c.colour}` }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c.title}</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{pct(c.rate)}</div>
          <div className="mt-0.5 text-xs text-slate-600">{int(c.orders)} orders of {int(c.enquiries)} enquiries</div>
          <div className="mt-1 text-[11px] text-slate-400">{c.what}</div>
        </div>
      ))}
      <div className="rounded-2xl border border-indigo-900 bg-indigo-950 p-4 text-white shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">Overall conversion</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">{pct(conversionPct(s))}</div>
        <div className="mt-0.5 text-xs text-indigo-200">{int(s.orders)} orders of {int(s.enquiries)} enquiries</div>
        <div className="mt-1 text-[11px] text-indigo-300">Inbound and broker / prospect together</div>
      </div>
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
      <div className="mt-4"><GroupTable groups={groups} dimTitle="Source" cols={SOURCE_COLS} swatches={SOURCE_COLOURS} /></div>
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
function DealbookSection({ all, range, variant, budgets, today, cancelledDays, onShowCancellations }: {
  all: OrderRow[]; range: Range; variant: "orders" | "deliveries"; budgets?: Budgets; today?: string;
  cancelledDays?: string[]; onShowCancellations?: () => void;
}) {
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
  const cancelledHere = (cancelledDays ?? []).filter((d) => d >= range.startDay && d <= range.endDay).length;
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
      {cancelledHere > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-2.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">
            {cancelledHere} {cancelledHere === 1 ? "order" : "orders"} in {range.label} {cancelledHere === 1 ? "was" : "were"} cancelled afterwards
          </span>{" "}
          and {cancelledHere === 1 ? "is" : "are"} left out here, as Dealerweb&apos;s own order list now leaves {cancelledHere === 1 ? "it" : "them"} out.{" "}
          {onShowCancellations && <button onClick={onShowCancellations} className="font-semibold text-indigo-600 hover:text-indigo-800">See Cancellations</button>}
        </div>
      )}
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

// ─── Cancellations ─────────────────────────────────────────────────────────
//
// Dealerweb's Cancelled Orders, each checked against the Dealbook on the
// server (lib/ten-at-ten-cancellations.ts). A Re-Write — an order put on
// wrong, cancelled and ordered again — is listed but never counted as a
// cancellation. Every proper cancellation wants a manager's reason, saved
// for everyone; a manager can also overrule the matching either way.

interface CancelStats { proper: number; rewrites: number; unexplained: number }
type CGroup = Nested<CancelStats, CancellationView>;

const isProper = (c: CancellationView) => c.status === "proper";
const needsReason = (c: CancellationView) => isProper(c) && !c.note.trim();

function cancelStatsOf(rows: readonly CancellationView[]): CancelStats {
  return { proper: rows.filter(isProper).length, rewrites: rows.filter((c) => !isProper(c)).length, unexplained: rows.filter(needsReason).length };
}

// Share is of the proper cancellations — Re-Writes don't count.
function cGroups(rows: CancellationView[], keyOf: (c: CancellationView) => string): CGroup[] {
  const m = new Map<string, CancellationView[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const b = m.get(k);
    if (b) b.push(r); else m.set(k, [r]);
  }
  const total = rows.filter(isProper).length;
  return [...m]
    .map(([key, rs]) => { const stats = cancelStatsOf(rs); return { key, label: key, stats, share: total ? (stats.proper / total) * 100 : 0, rows: rs, children: [] }; })
    .sort((a, b) => b.stats.proper - a.stats.proper || b.stats.rewrites - a.stats.rewrites || a.label.localeCompare(b.label));
}

const CANCEL_COLS: Col<CancelStats, CancellationView>[] = [
  { key: "proper", label: "Cancellations", strong: true, render: (g) => <span className={g.stats.proper ? "text-rose-700" : "text-slate-400"}>{int(g.stats.proper)}</span> },
  { key: "share", label: "Share", left: true, render: (g) => <ShareCell share={g.share} /> },
  { key: "rewrites", label: "Re-Writes", render: (g) => <span className="text-slate-500">{int(g.stats.rewrites)}</span> },
  { key: "unexplained", label: "Reason to add", render: (g) => <span className={g.stats.unexplained ? "font-semibold text-amber-700" : "text-slate-400"}>{int(g.stats.unexplained)}</span> },
];

const daysLabel = (n: number) => (n === 0 ? "same day" : `${n} day${n === 1 ? "" : "s"} later`);
// "Mr Steven Braine" and "Steven Braine" are the same customer.
const nameKey = (s: string) => s.toLowerCase().replace(/^(mr|mrs|ms|miss|mx|dr)\.?\s+/, "").replace(/[^a-z0-9]/g, "");

function CancellationsSection({ all, range }: { all: CancellationView[]; range: Range }) {
  const [segments, setSegments] = useState<Set<SegmentName>>(new Set());
  const [exec, setExec] = useState("");
  const [model, setModel] = useState("");

  const periodAll = useMemo(() => inRange(all, range), [all, range]);
  const rows = useMemo(
    () => periodAll.filter((c) => (segments.size === 0 || segments.has(c.segment as SegmentName)) && (!exec || c.exec === exec) && (!model || c.model === model)),
    [periodAll, segments, exec, model],
  );
  const execOptions = useMemo(() => [...new Set(periodAll.map((c) => c.exec))].sort(), [periodAll]);
  const modelOptions = useMemo(() => [...new Set(periodAll.map((c) => c.model))].sort(), [periodAll]);
  const filtersOn = segments.size > 0 || !!exec || !!model;
  // Reasons still to add first, then the most recent.
  const proper = useMemo(() => rows.filter(isProper).sort((a, b) => Number(needsReason(b)) - Number(needsReason(a)) || b.day.localeCompare(a.day) || a.customer.localeCompare(b.customer)), [rows]);
  const rewrites = useMemo(() => rows.filter((c) => !isProper(c)).sort((a, b) => b.day.localeCompare(a.day) || a.customer.localeCompare(b.customer)), [rows]);
  const byExec = useMemo(() => cGroups(rows, (c) => c.exec), [rows]);
  const byModel = useMemo(() => cGroups(rows, (c) => c.model), [rows]);

  if (all.length === 0) {
    return <Empty>No cancellations yet. Upload Cancelled Orders from <a href="/ten-at-ten/admin" className="font-medium text-indigo-600">Upload data</a>.</Empty>;
  }

  const unexplained = proper.filter(needsReason).length;
  const avgDays = proper.length ? proper.reduce((n, c) => n + daysToCancel(c), 0) / proper.length : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</span>
        <Chips options={SEGMENTS} selected={segments} onChange={setSegments} colours={SEGMENT_COLOURS} />
        <Select value={exec} onChange={setExec} all="All execs" options={execOptions} />
        <Select value={model} onChange={setModel} all="All models" options={modelOptions} />
        {filtersOn && <button onClick={() => { setSegments(new Set()); setExec(""); setModel(""); }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Clear filters</button>}
        <span className="text-[11px] text-slate-400">Counted on the day it was cancelled.</span>
      </div>
      <Tiles tiles={[
        { label: "Cancellations", value: int(proper.length), sub: "cancelled and not re-ordered", hero: true },
        { label: "Re-Writes", value: int(rewrites.length), sub: "cancelled and re-ordered — not counted" },
        { label: "Reasons to add", value: int(unexplained), tone: proper.length ? (unexplained ? "bad" : "good") : undefined, sub: proper.length ? `${proper.length - unexplained} of ${proper.length} explained` : undefined },
        { label: "Avg time to cancel", value: avgDays == null ? "—" : `${Math.round(avgDays)} days`, sub: "from order to cancellation" },
      ]} />
      {rows.length === 0 ? (
        <Empty>No cancellations in {range.label}{filtersOn ? " with these filters" : ""}.</Empty>
      ) : (
        <>
          <Card title="Cancellations" note="Add the reason for each · saved for everyone">
            {proper.length === 0
              ? <p className="text-sm text-slate-500">None — everything cancelled in {range.label} was ordered again.</p>
              : <div className="divide-y divide-slate-100">{proper.map((c) => <CancellationItem key={c.id} c={c} />)}</div>}
          </Card>
          <Card title="Re-Writes" note="Cancelled and ordered again · shown, not counted as cancellations">
            {rewrites.length === 0 ? <p className="text-sm text-slate-500">None in {range.label}.</p> : <RewriteList rows={rewrites} />}
          </Card>
          <Card title="By exec" note="Click an exec for their cancellations">
            <GroupTable groups={byExec} dimTitle="Exec" cols={CANCEL_COLS} limit={12} detail={(g) => <CancellationList rows={g.rows} showExec={false} />} />
          </Card>
          <Card title="By model" note="Click a model for its cancellations">
            <GroupTable groups={byModel} dimTitle="Model" cols={CANCEL_COLS} limit={12} detail={(g) => <CancellationList rows={g.rows} />} />
          </Card>
        </>
      )}
    </div>
  );
}

// Re-Write or not, as a manager sees it: a call they made can be undone,
// handing it back to the matching.
function useReclassify(id: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (classification: "rewrite" | "proper" | null) => start(async () => {
    setError(null);
    const res = await setCancellationStatusAction({ id, classification });
    if (!res.ok) { setError(res.error ?? "Couldn't save that."); return; }
    router.refresh();
  });
  return { pending, error, set };
}

const smallButton = "rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40";

// One proper cancellation: what, who, when — and the manager's reason.
function CancellationItem({ c }: { c: CancellationView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(c.note);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const re = useReclassify(c.id);
  const dirty = text.trim() !== c.note.trim();

  function save() {
    start(async () => {
      const res = await saveCancellationNoteAction({ id: c.id, note: text });
      if (!res.ok) { setMsg({ ok: false, text: res.error ?? "Couldn't save the note." }); return; }
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    });
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{c.customer}</div>
          <div className="max-w-[640px] truncate text-xs text-slate-500" title={c.vehicle}>{c.vehicle}</div>
          <div className="mt-0.5 text-xs text-slate-600">
            {c.exec} · ordered {shortDate(c.orderDay)} · cancelled {shortDate(c.day)} <span className="text-slate-400">({daysLabel(daysToCancel(c))})</span>
            {c.registration && <> · {c.registration}</>}
            {c.orderProfit != null && <> · profit on the order <b><Money n={c.orderProfit} /></b></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.overridden && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Manager&apos;s call</span>}
          <button onClick={() => re.set(c.overridden ? null : "rewrite")} disabled={re.pending} className={smallButton}
            title={c.overridden ? `Hand it back to the matching, which found a re-order${c.reorder ? ` on ${shortDate(c.reorder.orderDay)}` : ""}` : "It was ordered again — count it as a Re-Write"}>
            {c.overridden ? "Undo" : "It's a Re-Write"}
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} rows={2} maxLength={2000}
          placeholder="Reason for the cancellation…" aria-label={`Reason ${c.customer} cancelled`}
          className={`w-full flex-1 rounded-lg border px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none ${c.note ? "border-slate-300" : "border-amber-300 bg-amber-50/40"}`} />
        <button onClick={save} disabled={pending || !dirty}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="mt-1 text-[11px]">
        {re.error ? <span className="text-rose-700">{re.error}</span>
          : msg && !msg.ok ? <span className="text-rose-700">{msg.text}</span>
          : dirty ? <span className="text-slate-400">Not saved yet</span>
          : c.note ? <span className="text-slate-400">Saved by {c.noteBy ?? "—"} · {c.noteAt}</span>
          : <span className="font-semibold text-amber-700">Reason needed</span>}
      </div>
    </div>
  );
}

function RewriteAction({ c }: { c: CancellationView }) {
  const re = useReclassify(c.id);
  return (
    <div className="text-right">
      <button onClick={() => re.set(c.overridden ? null : "proper")} disabled={re.pending} className={smallButton}
        title={c.overridden ? "Hand it back to the matching" : "It wasn't ordered again — count it as a cancellation"}>
        {c.overridden ? "Undo" : "Not a Re-Write"}
      </button>
      {re.error && <div className="mt-1 text-[10px] text-rose-700">{re.error}</div>}
    </div>
  );
}

// Each Re-Write beside the order that replaced it, and what tied the two.
function RewriteList({ rows }: { rows: CancellationView[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wide text-slate-400">
        <tr>
          <th className="px-2 py-1 text-left font-semibold">Customer</th>
          <th className="px-2 py-1 text-left font-semibold">Exec</th>
          <th className="px-2 py-1 text-left font-semibold">Ordered</th>
          <th className="px-2 py-1 text-left font-semibold">Cancelled</th>
          <th className="px-2 py-1 text-left font-semibold">Re-ordered</th>
          <th className="px-2 py-1" />
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-t border-slate-100 align-top">
            <td className="px-2 py-1.5">
              <div className="font-medium text-slate-800">{c.customer}</div>
              <div className="max-w-[360px] truncate text-[11px] text-slate-500" title={c.vehicle}>{c.vehicle}</div>
            </td>
            <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{c.exec}</td>
            <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{shortDate(c.orderDay)}</td>
            <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{shortDate(c.day)}</td>
            <td className="px-2 py-1.5 text-slate-700">
              {c.reorder ? (
                <>
                  <span className="font-semibold">{shortDate(c.reorder.orderDay)}</span>
                  {nameKey(c.reorder.customer) !== nameKey(c.customer) && <> · as {c.reorder.customer}</>}
                  {c.reorder.registration && <> · {c.reorder.registration}</>}
                  <div className="text-[10px] text-slate-400">matched on {c.reorder.on === "registration" ? "the same registration" : "the same customer and model"}</div>
                </>
              ) : (
                <span className="text-slate-500">Marked a Re-Write by a manager</span>
              )}
            </td>
            <td className="px-2 py-1.5"><RewriteAction c={c} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The drill-down under By exec / By model.
function CancellationList({ rows, showExec = true }: { rows: CancellationView[]; showExec?: boolean }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(isProper(b)) - Number(isProper(a)) || b.day.localeCompare(a.day)), [rows]);
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wide text-slate-400">
        <tr>
          <th className="px-2 py-1 text-left font-semibold">Customer</th>
          <th className="px-2 py-1 text-left font-semibold">Vehicle</th>
          {showExec && <th className="px-2 py-1 text-left font-semibold">Exec</th>}
          <th className="px-2 py-1 text-left font-semibold">Ordered</th>
          <th className="px-2 py-1 text-left font-semibold">Cancelled</th>
          <th className="px-2 py-1 text-left font-semibold">Reason</th>
          <th className="px-2 py-1 text-right font-semibold">Counts as</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((c) => (
          <tr key={c.id} className="border-t border-slate-100 align-top">
            <td className="max-w-[220px] truncate px-2 py-1 font-medium text-slate-800" title={c.customer}>{c.customer}</td>
            <td className="max-w-[320px] truncate px-2 py-1 text-slate-600" title={c.vehicle}>{c.vehicle}</td>
            {showExec && <td className="whitespace-nowrap px-2 py-1 text-slate-600">{c.exec}</td>}
            <td className="whitespace-nowrap px-2 py-1 text-slate-600">{shortDate(c.orderDay)}</td>
            <td className="whitespace-nowrap px-2 py-1 text-slate-600">{shortDate(c.day)}</td>
            <td className="max-w-[320px] truncate px-2 py-1 text-slate-600" title={c.note}>
              {isProper(c) ? (c.note || <span className="font-semibold text-amber-700">Reason needed</span>) : <span className="text-slate-400">—</span>}
            </td>
            <td className="whitespace-nowrap px-2 py-1 text-right">
              {isProper(c) ? <span className="font-semibold text-rose-700">Cancellation</span> : <span className="text-slate-500">Re-Write</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Summary ───────────────────────────────────────────────────────────────
//
// The first tab: every area's headline for the period, light enough to take
// in at once, each card opening its own tab for the detail. Same figures,
// same maths as the tabs themselves — nothing here is computed differently.

interface SummaryStat { label: string; value: string; sub?: string; tone?: "good" | "bad" }

function SummaryCard({ title, onOpen, stats, note }: { title: string; onOpen: () => void; stats: SummaryStat[]; note?: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <button onClick={onOpen} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Open →</button>
      </div>
      <div className={`mt-3 grid gap-x-4 gap-y-3 ${stats.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {stats.map((st) => (
          <div key={st.label} className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{st.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${st.tone === "good" ? "text-emerald-700" : st.tone === "bad" ? "text-rose-700" : "text-slate-900"}`}>{st.value}</div>
            {st.sub && <div className="text-[11px] leading-snug text-slate-500">{st.sub}</div>}
          </div>
        ))}
      </div>
      {note && <div className="mt-auto pt-3 text-[11px] text-slate-400">{note}</div>}
    </section>
  );
}

const share = (n: number, of: number) => (of > 0 ? (n / of) * 100 : null);

function SummarySection({ range, today, enquiries, responses, reportHorizon, orders, deliveries, budgets, cancellations, cancelledOrderDays, market, open }: {
  range: Range; today: string; enquiries: ReportRow[]; responses: EnquiryRow[]; reportHorizon: number | null;
  orders: OrderRow[]; deliveries: OrderRow[]; budgets: Budgets; cancellations: CancellationView[]; cancelledOrderDays: string[];
  market: MarketOverview | null; open: (s: Section) => void;
}) {
  const e = useMemo(() => statsOf(inRange(enquiries, range)), [enquiries, range]);
  const r = useMemo(() => {
    const period = responses.filter((x) => x.enquiryDay >= range.startDay && x.enquiryDay <= range.endDay);
    const { reportable, held } = partitionByReportability(period, reportHorizon);
    return { s: summariseResponse(reportable), held: held.length };
  }, [responses, range, reportHorizon]);
  const o = useMemo(() => orderStatsOf(inRange(orders, range)), [orders, range]);
  const d = useMemo(() => inRange(deliveries, range), [deliveries, range]);
  const c = useMemo(() => inRange(cancellations, range), [cancellations, range]);
  const cancelledHere = cancelledOrderDays.filter((x) => x >= range.startDay && x <= range.endDay).length;

  // Deliveries: against budget when the period is whole months.
  const months = budgetMonths(range);
  const line = months ? budgetLines(d, budgets, months).combined : null;
  const pace = periodProgress(range, today);
  const delivered = d.filter((x) => x.delivery === "Delivered").length;
  const arrived = d.filter((x) => x.delivery === "Arrived").length;
  const deliveredPct = d.length ? Math.round((delivered / d.length) * 100) : null;
  const gap = line?.budget != null ? line.going - line.budget : null;

  const rs = r.s;
  const sameDay = share(rs.sameDayMet, rs.sameDayExpected);
  const proper = c.filter(isProper).length;
  const unexplained = c.filter(needsReason).length;
  const cars = market?.segments.find((x) => x.segment === "car");
  const vans = market?.segments.find((x) => x.segment === "van");
  const all = market ? marketTotals(market.segments) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SummaryCard title="Enquiries" onOpen={() => open("enquiries")} stats={[
        { label: "Enquiries", value: int(e.enquiries), sub: `${int(e.inboundEnquiries)} inbound · ${int(e.enquiries - e.inboundEnquiries)} broker / prospect` },
        { label: "Inbound conv.", value: pct(inboundPct(e)), sub: "MotorComplete leads" },
        { label: "Broker conv.", value: pct(brokerPct(e)), sub: "broker / prospect" },
        { label: "Overall conv.", value: pct(conversionPct(e)), sub: `${int(e.orders)} orders` },
      ]} />
      <SummaryCard title="Response times" onOpen={() => open("response")} stats={[
        { label: "First contact", value: formatMins(rs.contactAvg), tone: timeTone(rs.contactAvg, CONTACT_TARGET_MINS), sub: `target ${CONTACT_TARGET_MINS}m · ${int(rs.contactMissed)} over` },
        { label: "Same-day contact", value: sameDay == null ? "—" : `${Math.round(sameDay)}%`, tone: rs.sameDayExpected ? (rs.sameDayMissed ? "bad" : "good") : undefined, sub: `${int(rs.sameDayMissed)} missed · ${int(rs.sameDayMissedSupport)} late allocation` },
        { label: "Never contacted", value: int(rs.neverContacted), tone: rs.neverContacted ? "bad" : undefined, sub: `of ${int(rs.total)} judged` },
      ]} note={r.held > 0 ? `${int(r.held)} more not judged yet — they need a full working day first.` : undefined} />
      <SummaryCard title="Orders" onOpen={() => open("orders")} stats={[
        { label: "Orders", value: int(o.orders), sub: cancelledHere ? `${int(cancelledHere)} cancelled since, left out` : undefined },
        { label: "Total profit", value: gbp(o.priced ? o.profit : null) },
        { label: "Avg per unit", value: gbp(avgProfit(o)), tone: (avgProfit(o) ?? 0) < 0 ? "bad" : undefined },
      ]} />
      <SummaryCard title="Deliveries" onOpen={() => open("deliveries")} stats={line ? [
        { label: "Going vs budget", value: line.budget == null ? int(line.going) : `${int(line.going)} / ${int(line.budget)}`, tone: gap == null ? undefined : gap >= 0 ? "good" : "bad",
          sub: gap == null ? "no budget set" : gap >= 0 ? `${int(gap)} over budget` : `${int(-gap)} short of budget` },
        { label: "Delivered", value: deliveredPct == null ? "—" : `${deliveredPct}%`, tone: deliveredPct == null ? undefined : deliveredPct >= Math.round(pace.pct) ? "good" : "bad",
          sub: `of what's going · ${Math.round(pace.pct)}% through` },
        { label: "Still to deliver", value: int(d.length - delivered), sub: `${int(arrived)} arrived · ${int(d.length - delivered - arrived)} due` },
      ] : [
        { label: "Going", value: int(d.length), sub: "delivered + arrived + due" },
        { label: "Delivered", value: int(delivered), sub: deliveredPct == null ? undefined : `${deliveredPct}% of what's going` },
        { label: "Still to deliver", value: int(d.length - delivered), sub: `${int(arrived)} arrived · ${int(d.length - delivered - arrived)} due` },
      ]} note={line ? "Car and CV combined." : "Budget is monthly — choose Month or Quarter to measure against it."} />
      <SummaryCard title="Cancellations" onOpen={() => open("cancellations")} stats={[
        { label: "Cancellations", value: int(proper), sub: "cancelled, not re-ordered" },
        { label: "Re-Writes", value: int(c.length - proper), sub: "re-ordered — not counted" },
        { label: "Reasons to add", value: int(unexplained), tone: proper ? (unexplained ? "bad" : "good") : undefined, sub: proper ? `${int(proper - unexplained)} of ${int(proper)} explained` : undefined },
      ]} />
      <SummaryCard title="Market Analysis" onOpen={() => open("market")} stats={market && all ? [
        { label: "Cars · cheapest", value: pct(cars ? share(cars.overall.cheapest, cars.overall.compared) : null, 0), sub: cars ? gapText(cars.overall.gap) : "not scraped" },
        { label: "Vans · cheapest", value: pct(vans ? share(vans.overall.cheapest, vans.overall.compared) : null, 0), sub: vans ? gapText(vans.overall.gap) : "not scraped" },
        { label: "Lowest headline", value: pct(share(all.headlineLowest, all.headlineCompared), 0), sub: "our best price at any term" },
      ] : [
        { label: "Cheapest", value: "—", sub: "no scrape yet" },
      ]} note={market ? `Latest scrape, ${scrapeWhen(market.run.startedAt)} — not tied to the period above.` : undefined} />
    </div>
  );
}

// ─── Market Analysis ───────────────────────────────────────────────────────
//
// The latest scrape at a glance, from the run digest the Trends tab uses
// (lib/market-overview.ts). The full analysis stays on /scraper. Gap is our
// price minus the cheapest rival's, per month, like-for-like.

const MARKET_META: Record<string, { title: string; colour: string }> = {
  car: { title: "Cars", colour: "#334155" },
  van: { title: "Vans", colour: SEGMENT_META.Van.colour },
};

const scrapeWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");

/** "£9/mo dearer" — from our side, like the Trends tab. */
function gapText(gap: number | null): string {
  if (gap == null) return "no rival priced";
  if (Math.abs(gap) < 0.5) return "level with the cheapest rival";
  return gap > 0 ? `£${Math.round(gap)}/mo dearer on average` : `£${Math.round(-gap)}/mo cheaper on average`;
}

// Green cheaper, amber within £20, red more than £20 dearer — the Trends tab's bands.
const gapTone = (gap: number | null) =>
  gap == null ? "text-slate-400" : gap <= 0 ? "text-emerald-700" : gap <= 20 ? "text-amber-700" : "text-rose-700";

const gapCell = (gap: number | null) => (
  <span className={`whitespace-nowrap font-semibold ${gapTone(gap)}`}>
    {gap == null ? "—" : Math.abs(gap) < 0.5 ? "level" : `${gap > 0 ? "+" : "−"}£${Math.round(Math.abs(gap))}`}
  </span>
);

function marketTotals(segments: MarketSegmentView[]) {
  let compared = 0, cheapest = 0, gapSum = 0, headlineCompared = 0, headlineLowest = 0;
  for (const s of segments) {
    compared += s.overall.compared;
    cheapest += s.overall.cheapest;
    gapSum += (s.overall.gap ?? 0) * s.overall.compared;
    headlineCompared += s.overall.headline.compared;
    headlineLowest += s.overall.headline.lowest;
  }
  return { compared, cheapest, gap: compared ? gapSum / compared : null, headlineCompared, headlineLowest };
}

const RANGE_COLS: Col<RangeStats>[] = [
  { key: "compared", label: "Deals", render: (g) => int(g.stats.compared) },
  { key: "cheapest", label: "Cheapest", strong: true, render: (g) => pct(share(g.stats.cheapest, g.stats.compared), 0) },
  { key: "gap", label: "Avg gap", render: (g) => gapCell(g.stats.gap) },
  { key: "headline", label: "Lowest headline", render: (g) => <span className="text-slate-600">{pct(share(g.stats.headline.lowest, g.stats.headline.compared), 0)}</span> },
];

function MarketSection({ market }: { market: MarketOverview | null }) {
  if (!market || market.segments.length === 0) {
    return (
      <Empty>
        No market data yet. Each scrape from the RateX app shows here as soon as it finishes — the full analysis is on{" "}
        <a href="/scraper" className="font-medium text-indigo-600">Market Analysis</a>.
      </Empty>
    );
  }
  const all = marketTotals(market.segments);
  const gapTileTone = all.gap == null ? undefined : all.gap <= 0 ? "good" as const : "bad" as const;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-2.5 text-xs text-slate-600">
        <span>
          <span className="font-semibold text-slate-900">Latest scrape</span> · {scrapeWhen(market.run.startedAt)}
          {market.run.label && <> · {market.run.label}</>} · {int(market.run.totalResults)} prices · updates every time a scrape finishes
        </span>
        <a href="/scraper" className="font-semibold text-indigo-600 hover:text-indigo-800">Full analysis →</a>
      </div>
      <Tiles tiles={[
        { label: "We're cheapest", value: pct(share(all.cheapest, all.compared), 0), sub: `on ${int(all.cheapest)} of ${int(all.compared)} like-for-like deals`, hero: true },
        { label: "Lowest headline price", value: pct(share(all.headlineLowest, all.headlineCompared), 0), sub: `on ${int(all.headlineLowest)} of ${int(all.headlineCompared)} — our best at any term vs theirs` },
        { label: "Avg gap to cheapest", value: all.gap == null ? "—" : `${all.gap > 0 ? "+" : all.gap < 0 ? "−" : ""}£${Math.round(Math.abs(all.gap))}`, tone: gapTileTone, sub: "per month, like-for-like · + is dearer" },
      ]} />
      <div className="grid gap-5 lg:grid-cols-2">
        {market.segments.map((s) => <MarketColumn key={s.segment} s={s} />)}
      </div>
    </div>
  );
}

function MarketColumn({ s }: { s: MarketSegmentView }) {
  const meta = MARKET_META[s.segment] ?? { title: s.segment, colour: "#64748b" };
  const o = s.overall;
  const groups = useMemo(
    () => s.ranges.map((r) => ({ key: r.name, label: r.name, stats: r.stats, share: share(r.stats.compared, o.compared) ?? 0, rows: [], children: [] })),
    [s.ranges, o.compared],
  );
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${meta.colour}` }}>
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold text-slate-900">{meta.title}</div>
          <div className="text-xs text-slate-500">{int(o.compared)} deals compared</div>
        </div>
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">We&apos;re cheapest on</div>
        <div className="text-3xl font-bold tabular-nums text-slate-900">{pct(share(o.cheapest, o.compared), 0)}</div>
        <div className={`mt-1 text-sm font-semibold ${gapTone(o.gap)}`}>{gapText(o.gap)}</div>
        <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
          <span>Lowest headline <b className="tabular-nums">{pct(share(o.headline.lowest, o.headline.compared), 0)}</b></span>
          <span>Our avg <b className="tabular-nums">{gbp(o.tfAvg)}</b> · cheapest rival <b className="tabular-nums">{gbp(o.mktAvg)}</b></span>
        </div>
      </div>
      <Card title={`${meta.title} by range`} note="Most-compared first">
        <GroupTable groups={groups} dimTitle="Range" cols={RANGE_COLS} limit={10} />
      </Card>
      <Card title={`Who undercuts us · ${meta.title.toLowerCase()}`} note="Deals where both of us are priced">
        <CompetitorList rows={s.competitors} />
      </Card>
    </div>
  );
}

function CompetitorList({ rows }: { rows: CompetitorRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Nobody undercuts us on these deals.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] uppercase tracking-wide text-slate-500">
        <tr className="border-b border-slate-200">
          <th className="px-2 py-2 text-left font-semibold">Broker</th>
          <th className="px-2 py-2 text-right font-semibold">Head to head</th>
          <th className="px-2 py-2 text-right font-semibold">Cheaper than us</th>
          <th className="px-2 py-2 text-right font-semibold">By, on average</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.broker} className="border-b border-slate-100">
            <td className="px-2 py-1.5 font-medium text-slate-900">{r.broker}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{int(r.headToHead)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">
              <span className="font-semibold text-rose-700">{int(r.undercuts)}</span>
              <span className="ml-1 text-xs text-slate-500">({pct(share(r.undercuts, r.headToHead), 0)})</span>
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{r.avgUndercut == null ? "—" : `£${Math.round(r.avgUndercut)}/mo`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
