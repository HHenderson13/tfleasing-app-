"use client";

import { Fragment, useMemo, useState } from "react";
import { shiftAnchor } from "@/lib/period";
import {
  DIMENSIONS,
  SOURCES,
  conversionPct,
  decodeReport,
  dimLabel,
  groupRows,
  inRange,
  rangeFor,
  statsOf,
  timeBuckets,
  type DimKey,
  type Group,
  type PeriodMode,
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

const MODES: { key: PeriodMode; label: string; current: string }[] = [
  { key: "day", label: "Day", current: "Today" },
  { key: "week", label: "Week", current: "This week" },
  { key: "month", label: "Month", current: "This month" },
  { key: "quarter", label: "Quarter", current: "This quarter" },
  { key: "custom", label: "Custom", current: "" },
];

const pct = (n: number | null, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);
const int = (n: number) => n.toLocaleString("en-GB");

export function ReportClient({ payload, today }: { payload: ReportPayload; today: string }) {
  const all = useMemo(() => decodeReport(payload), [payload]);
  const minDay = all[0]?.day ?? today;

  const [mode, setMode] = useState<PeriodMode>("month");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [exec, setExec] = useState("");
  const [model, setModel] = useState("");

  const range = useMemo(() => rangeFor(mode, anchor, custom), [mode, anchor, custom]);

  const filtered = useMemo(
    () => all.filter((r) => (sources.size === 0 || sources.has(r.source)) && (!exec || r.exec === exec) && (!model || r.model === model)),
    [all, sources, exec, model],
  );
  const rows = useMemo(() => inRange(filtered, range), [filtered, range]);

  // Filter lists come from the selected period, busiest first, so the
  // dropdowns offer what is actually in view.
  const periodAll = useMemo(() => inRange(all, range), [all, range]);
  const execOptions = useMemo(() => groupRows(periodAll, ["exec"]).map((g) => g.label), [periodAll]);
  const modelOptions = useMemo(() => groupRows(periodAll, ["model"]).map((g) => g.label), [periodAll]);

  const filtersOn = sources.size > 0 || !!exec || !!model;
  const modeMeta = MODES.find((m) => m.key === mode)!;
  const atCurrent = mode !== "custom" && range.startDay <= today && range.endDay >= today;

  return (
    <div className="mt-5 space-y-5">
      {/* Period */}
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</span>
        {SOURCES.map((s) => {
          const on = sources.has(s);
          return (
            <button
              key={s}
              onClick={() => setSources((cur) => { const n = new Set(cur); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLOURS[s] }} />
              {s}
            </button>
          );
        })}
        <select value={exec} onChange={(e) => setExec(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">All execs</option>
          {execOptions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">All models</option>
          {modelOptions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {filtersOn && (
          <button onClick={() => { setSources(new Set()); setExec(""); setModel(""); }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
            Clear filters
          </button>
        )}
      </div>

      {all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No enquiries yet. Upload an enquiry log from <a href="/ten-at-ten/admin" className="font-medium text-indigo-600">Upload data</a>.
        </div>
      ) : (
        <>
          <Kpis cur={statsOf(rows)} />
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
              No enquiries in {range.label}{filtersOn ? " with these filters" : ""}.
            </div>
          ) : (
            <>
              <SourceShare rows={rows} />
              <div className="grid gap-5 lg:grid-cols-2">
                <Breakdown title="By exec" rows={rows} dims={["exec"]} />
                <Breakdown title="By model" note="Click a model for its derivatives" rows={rows} dims={["model", "derivative"]} />
              </div>
              <Trend rows={rows} range={range} />
              <Builder rows={rows} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Headline tiles ────────────────────────────────────────────────────────

function Kpis({ cur }: { cur: Stats }) {
  const tiles: { label: string; value: string; hero?: boolean }[] = [
    { label: "Enquiries", value: int(cur.enquiries) },
    { label: "Orders", value: int(cur.orders) },
    { label: "Conversion", value: pct(conversionPct(cur)), hero: true },
    { label: "Live", value: int(cur.live) },
    { label: "Lost", value: int(cur.lost) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${t.hero ? "border-indigo-900 bg-indigo-950 text-white" : "border-slate-200 bg-white"}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.hero ? "text-indigo-200" : "text-slate-500"}`}>{t.label}</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${t.hero ? "text-white" : "text-slate-900"}`}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Source share ──────────────────────────────────────────────────────────

function SourceShare({ rows }: { rows: ReportRow[] }) {
  const groups = useMemo(() => groupRows(rows, ["source"], "label"), [rows]);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Enquiries by source</h2>
      <div className="mt-3 flex h-9 w-full overflow-hidden rounded-lg">
        {groups.map((g) => (
          <div key={g.key} title={`${g.label}: ${int(g.stats.enquiries)} (${g.share.toFixed(1)}%)`}
            className="flex items-center justify-center text-[11px] font-semibold text-white"
            style={{ width: `${g.share}%`, background: SOURCE_COLOURS[g.label] ?? "#94a3b8", borderRight: "2px solid white" }}>
            {g.share >= 7 ? `${g.share.toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Table groups={groups} dimTitle="Source" swatches />
      </div>
    </section>
  );
}

// ─── Tables ────────────────────────────────────────────────────────────────

function Breakdown({ title, note, rows, dims }: { title: string; note?: string; rows: ReportRow[]; dims: DimKey[] }) {
  const [sort, setSort] = useState<SortKey>("enquiries");
  const groups = useMemo(() => groupRows(rows, dims, sort), [rows, dims, sort]);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {note && <span className="text-[11px] text-slate-400">{note}</span>}
      </div>
      <div className="mt-3">
        <Table groups={groups} dimTitle={dimLabel(dims[0])} sort={sort} onSort={setSort} limit={12} />
      </div>
    </section>
  );
}

const COLS: { key: SortKey; label: string }[] = [
  { key: "enquiries", label: "Enquiries" },
  { key: "orders", label: "Orders" },
  { key: "conversion", label: "Conv." },
  { key: "live", label: "Live" },
  { key: "lost", label: "Lost" },
];

function Table({ groups, dimTitle, sort, onSort, limit, swatches, openAll }: {
  groups: Group[]; dimTitle: string; sort?: SortKey; onSort?: (s: SortKey) => void; limit?: number; swatches?: boolean; openAll?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const shown = limit && !showAll ? groups.slice(0, limit) : groups;
  const isOpen = (k: string) => (openAll ? !open.has(k) : open.has(k));
  const toggle = (k: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const head = (k: SortKey, label: string, cls: string) => (
    <th className={`px-2 py-2 font-semibold ${cls}`}>
      {onSort ? (
        <button onClick={() => onSort(k)} className={`hover:text-slate-900 ${sort === k ? "text-slate-900" : ""}`}>{label}{sort === k ? " ↓" : ""}</button>
      ) : label}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[10px] uppercase tracking-wide text-slate-500">
          <tr className="border-b border-slate-200">
            {head("label", dimTitle, "text-left")}
            {head("enquiries", "Enquiries", "text-right")}
            <th className="px-2 py-2 text-left font-semibold">Share</th>
            {COLS.slice(1).map((c) => <Fragment key={c.key}>{head(c.key, c.label, "text-right")}</Fragment>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((g) => (
            <Fragment key={g.key}>
              <Row g={g} depth={0} swatch={swatches ? SOURCE_COLOURS[g.label] : undefined}
                expandable={hasDetail(g)} expanded={isOpen(g.key)} onToggle={() => toggle(g.key)} />
              {hasDetail(g) && isOpen(g.key) && g.children.map((c) => (
                <Row key={`${g.key}›${c.key}`} g={c} depth={1} />
              ))}
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

// A model whose only child is its own "(model only)" bucket has nothing to
// expand into, so it gets no chevron.
function hasDetail(g: Group): boolean {
  return g.children.length > 1 || (g.children.length === 1 && !g.children[0].label.endsWith("(model only)"));
}

function Row({ g, depth, swatch, expandable, expanded, onToggle }: {
  g: Group; depth: number; swatch?: string; expandable?: boolean; expanded?: boolean; onToggle?: () => void;
}) {
  const conv = conversionPct(g.stats);
  return (
    <tr className={`border-b border-slate-100 ${depth > 0 ? "bg-slate-50/70 text-slate-600" : ""} ${expandable ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={expandable ? onToggle : undefined}>
      <td className={`px-2 py-1.5 ${depth > 0 ? "pl-8 text-xs" : "font-medium text-slate-900"}`}>
        <span className="inline-flex items-center gap-2">
          {expandable && <span className="w-3 text-slate-400">{expanded ? "▾" : "▸"}</span>}
          {swatch && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: swatch }} />}
          {g.label}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{int(g.stats.enquiries)}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-slate-400" style={{ width: `${Math.min(100, g.share)}%` }} /></div>
          <span className="w-10 text-right text-xs tabular-nums text-slate-500">{g.share.toFixed(1)}%</span>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{int(g.stats.orders)}</td>
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-900">{pct(conv)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{int(g.stats.live)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{int(g.stats.lost)}</td>
    </tr>
  );
}

// ─── Over time ─────────────────────────────────────────────────────────────

function Trend({ rows, range }: { rows: ReportRow[]; range: { startDay: string; endDay: string } }) {
  const buckets = useMemo(() => timeBuckets(rows, { ...range, label: "" }), [rows, range]);
  if (buckets.length === 0) return null;
  const max = Math.max(1, ...buckets.map((b) => b.stats.enquiries));
  const every = Math.ceil(buckets.length / 16);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Over time</h2>
        <span className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-200" />Enquiries</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-700" />Orders</span>
        </span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-[2px]">
        {buckets.map((b) => (
          <div key={b.key} className="group relative flex h-full flex-1 flex-col justify-end"
            title={`${b.label}: ${b.stats.enquiries} enquiries, ${b.stats.orders} orders (${pct(conversionPct(b.stats))})`}>
            <div className="relative w-full rounded-t-[3px] bg-indigo-200" style={{ height: `${(b.stats.enquiries / max) * 100}%` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-indigo-700" style={{ height: b.stats.enquiries ? `${(b.stats.orders / b.stats.enquiries) * 100}%` : 0 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-slate-400">
        {buckets.map((b, i) => <div key={b.key} className="flex-1 truncate text-center">{i % every === 0 ? b.label : ""}</div>)}
      </div>
    </section>
  );
}

// ─── Build your own ────────────────────────────────────────────────────────

function Builder({ rows }: { rows: ReportRow[] }) {
  const [first, setFirst] = useState<DimKey>("source");
  const [second, setSecond] = useState<DimKey | "">("model");
  const [sort, setSort] = useState<SortKey>("enquiries");
  const [openAll, setOpenAll] = useState(true);
  const dims = useMemo(() => (second && second !== first ? [first, second] : [first]) as DimKey[], [first, second]);
  const groups = useMemo(() => groupRows(rows, dims, sort), [rows, dims, sort]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <h2 className="mr-2 text-sm font-semibold text-slate-900">Build a breakdown</h2>
        <span className="text-xs text-slate-500">By</span>
        <select value={first} onChange={(e) => setFirst(e.target.value as DimKey)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
          {DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <span className="text-xs text-slate-500">then by</span>
        <select value={second} onChange={(e) => setSecond(e.target.value as DimKey | "")} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
          <option value="">Nothing</option>
          {DIMENSIONS.filter((d) => d.key !== first).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        {dims.length > 1 && (
          <button onClick={() => setOpenAll((v) => !v)} className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800">
            {openAll ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Share in the second level is that row&apos;s share of its {dimLabel(first).toLowerCase()}, so it reads as a mix.
      </p>
      <div className="mt-3">
        <Table key={`${dims.join("|")}|${openAll}`} groups={groups} dimTitle={dims.map(dimLabel).join(" › ")} sort={sort} onSort={setSort} openAll={openAll} swatches={first === "source"} />
      </div>
    </section>
  );
}
