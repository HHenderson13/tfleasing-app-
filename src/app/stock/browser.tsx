"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type StockRow = {
  vin: string;
  bucket: string;        // sheet bucket from parser: Focus | Puma | Kuga | ...
  variant: string;       // mapped model · series display name (trim for cars, payload/wheelbase for vans)
  derivative: string | null; // Sport | Limited | Trend (from WERS_SUB_SERIES_DESC), mapped
  series: string | null;
  modelYear: string | null;
  bodyStyle: string | null;
  engine: string | null;
  transmission: string | null;
  drive: string | null;
  colour: string;
  options: string[];
  orderNo: string | null;
  status: string | null;
  gateRelease: string | null;
  eta: string | null;
  delivered: string | null;
  interestBearing: string | null;
  adopted: string | null;
  dealer: string;
  destination: string | null;
};

type SortKey = "eta-asc" | "eta-desc" | "gate-desc" | "model" | "dealer";

type FacetId =
  | "model" | "variant" | "derivative" | "year" | "body" | "engine" | "transmission"
  | "drive" | "colour" | "option" | "status" | "funding" | "dealer" | "destination";

// Only flag funding when the date has actually passed — a future "interest bearing date"
// means the vehicle isn't bearing interest yet, so don't surface it.
function isPast(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= Date.now();
}
function fundingState(r: StockRow): string | null {
  if (isPast(r.adopted)) return "Adopted";
  if (isPast(r.interestBearing)) return "Interest bearing";
  return null;
}

const FACETS: { id: FacetId; label: string; get: (r: StockRow) => string | string[] | null }[] = [
  { id: "model",        label: "Model",        get: (r) => r.bucket },
  { id: "variant",      label: "Variant",      get: (r) => r.variant },
  { id: "derivative",   label: "Derivative",   get: (r) => r.derivative },
  { id: "year",         label: "Model year",   get: (r) => r.modelYear },
  { id: "body",         label: "Body style",   get: (r) => r.bodyStyle },
  { id: "engine",       label: "Engine",       get: (r) => r.engine },
  { id: "transmission", label: "Transmission", get: (r) => r.transmission },
  { id: "drive",        label: "Drive",        get: (r) => r.drive },
  { id: "colour",       label: "Colour",       get: (r) => r.colour },
  { id: "option",       label: "Factory options", get: (r) => r.options },
  { id: "status",       label: "Status",       get: (r) => r.status },
  { id: "funding",      label: "Funding",      get: (r) => fundingState(r) },
  { id: "dealer",       label: "Dealer",       get: (r) => r.dealer },
  { id: "destination",  label: "Destination",  get: (r) => r.destination },
];

// Facets opened by default.
const DEFAULT_OPEN: Partial<Record<FacetId, boolean>> = {
  model: true, variant: true, derivative: true, colour: true, option: true, status: true,
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: StockRow[]) {
  const headers = [
    "VIN", "Model", "Variant", "Derivative", "Series", "Model year",
    "Body style", "Engine", "Transmission", "Drive",
    "Colour", "Factory options", "Order no", "Status",
    "Gate released", "ETA", "Delivered", "Interest bearing", "Adopted", "Dealer", "Destination",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.vin, r.bucket, r.variant, r.derivative, r.series, r.modelYear,
      r.bodyStyle, r.engine, r.transmission, r.drive,
      r.colour, r.options.join(" | "), r.orderNo, r.status,
      r.gateRelease ? r.gateRelease.slice(0, 10) : "",
      r.eta ? r.eta.slice(0, 10) : "",
      r.delivered ? r.delivered.slice(0, 10) : "",
      r.interestBearing ? r.interestBearing.slice(0, 10) : "",
      r.adopted ? r.adopted.slice(0, 10) : "",
      r.dealer, r.destination,
    ].map(csvCell).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tf-stock-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function statusTone(s: string | null): { cls: string; dot: string } {
  const u = (s ?? "").toLowerCase();
  if (!u) return { cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
  if (/deliver|dealer|arrived|at site/.test(u)) return { cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100", dot: "bg-emerald-500" };
  if (/transit|shipping|port|vessel|sail/.test(u)) return { cls: "bg-sky-50 text-sky-700 ring-1 ring-sky-100", dot: "bg-sky-500" };
  if (/build|produc/.test(u)) return { cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-100", dot: "bg-amber-500" };
  if (/order|schedul|allocat/.test(u)) return { cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-100", dot: "bg-violet-500" };
  return { cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
}

// Natural-sort: alphabetical, with embedded numbers compared numerically (so "320 LWB" sits after "280 SWB", "MY24" before "MY25").
const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

function tally<T>(rows: T[], pick: (r: T) => string | string[] | null): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r);
    if (!v) continue;
    if (Array.isArray(v)) {
      for (const x of v) { const s = x?.trim(); if (s) m.set(s, (m.get(s) ?? 0) + 1); }
    } else {
      m.set(v, (m.get(v) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => naturalCompare(a[0], b[0]));
}

export function StockBrowser({ rows }: { rows: StockRow[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<FacetId, Set<string>>>(() => {
    const o = {} as Record<FacetId, Set<string>>;
    for (const f of FACETS) o[f.id] = new Set();
    return o;
  });
  const [sort, setSort] = useState<SortKey>("eta-asc");
  const [limit, setLimit] = useState(60);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset pagination when filters change.
  useEffect(() => { setLimit(60); }, [q, sel, sort]);

  // `/` focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Apply filters except `skip` so facet counts reflect the rest.
  function matches(r: StockRow, skip: FacetId | null) {
    const needle = q.trim().toLowerCase();
    for (const f of FACETS) {
      if (f.id === skip) continue;
      const picked = sel[f.id];
      if (picked.size === 0) continue;
      const val = f.get(r);
      if (val === null || val === undefined) return false;
      if (Array.isArray(val)) {
        // AND-semantics: row must have every selected option.
        for (const s of picked) if (!val.includes(s)) return false;
      } else {
        if (!picked.has(val)) return false;
      }
    }
    if (needle) {
      const hay = `${r.vin} ${r.orderNo ?? ""} ${r.bucket} ${r.variant} ${r.derivative ?? ""} ${r.series ?? ""} ${r.colour} ${r.dealer} ${r.destination ?? ""} ${r.options.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }

  const filtered = useMemo(() => {
    const out = rows.filter((r) => matches(r, null));
    // For "soonest", delivered/at-dealer vehicles count as "available now" and sort to the top —
    // they don't have an ETA because they've already arrived.
    const isHere = (r: StockRow) => /deliver|dealer|arrived|at site/i.test(r.status ?? "");
    const etaAsc = (r: StockRow) => isHere(r) ? -Infinity : r.eta ? +new Date(r.eta) : Infinity;
    const etaDesc = (r: StockRow) => isHere(r) ? Infinity : r.eta ? +new Date(r.eta) : -Infinity;
    out.sort((a, b) => {
      switch (sort) {
        case "eta-asc":   return etaAsc(a) - etaAsc(b);
        case "eta-desc":  return etaDesc(b) - etaDesc(a);
        case "gate-desc": return (b.gateRelease ? +new Date(b.gateRelease) : -Infinity) - (a.gateRelease ? +new Date(a.gateRelease) : -Infinity);
        case "model":     return a.bucket.localeCompare(b.bucket) || a.variant.localeCompare(b.variant) || a.colour.localeCompare(b.colour);
        case "dealer":    return a.dealer.localeCompare(b.dealer);
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sel, sort]);

  // Facet options: each facet excludes its own selection so you can add/remove freely.
  const facetOptions: Record<FacetId, [string, number][]> = useMemo(() => {
    const o = {} as Record<FacetId, [string, number][]>;
    for (const f of FACETS) {
      const pool = rows.filter((r) => matches(r, f.id));
      o[f.id] = tally(pool, f.get);
    }
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sel]);

  function toggle(id: FacetId, v: string) {
    setSel((prev) => {
      const next = { ...prev };
      const s = new Set(next[id]);
      if (s.has(v)) s.delete(v); else s.add(v);
      next[id] = s;
      return next;
    });
  }

  function resetAll() {
    setQ("");
    setSel(() => {
      const o = {} as Record<FacetId, Set<string>>;
      for (const f of FACETS) o[f.id] = new Set();
      return o;
    });
  }

  const activeChips: { label: string; clear: () => void }[] = [];
  for (const f of FACETS) {
    for (const v of sel[f.id]) {
      activeChips.push({ label: `${f.label}: ${v}`, clear: () => toggle(f.id, v) });
    }
  }
  if (q) activeChips.push({ label: `"${q}"`, clear: () => setQ("") });

  const visible = filtered.slice(0, limit);

  return (
    <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
      {/* Sidebar */}
      <aside className={`${mobileFiltersOpen ? "block" : "hidden"} lg:block lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`}>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {FACETS.map((f) => {
            const opts = facetOptions[f.id];
            // Hide whole facet when current filters leave nothing to pick (and user hasn't already chosen one here).
            if (opts.length === 0 && sel[f.id].size === 0) return null;
            return (
              <FacetGroup
                key={f.id}
                title={f.label}
                options={opts}
                selected={sel[f.id]}
                onToggle={(v) => toggle(f.id, v)}
                defaultOpen={!!DEFAULT_OPEN[f.id] || sel[f.id].size > 0}
              />
            );
          })}
        </div>
      </aside>

      {/* Main column */}
      <div className="mt-4 lg:mt-0">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 -mx-6 border-b border-slate-200 bg-slate-50/85 px-6 py-3 backdrop-blur lg:mx-0 lg:rounded-2xl lg:border lg:bg-white lg:px-4 lg:shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search VIN, order no, destination, options…   (press /)"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search">×</button>
              )}
            </div>
            <button
              onClick={() => setMobileFiltersOpen((o) => !o)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-400 lg:hidden"
            >
              {mobileFiltersOpen ? "Hide filters" : "Filters"}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
            >
              <option value="eta-asc">ETA (soonest)</option>
              <option value="eta-desc">ETA (latest)</option>
              <option value="gate-desc">Gate released (newest)</option>
              <option value="model">Model A→Z</option>
              <option value="dealer">Dealer A→Z</option>
            </select>
            <button
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0e6e3a] bg-[#107c41] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0e6e3a] disabled:cursor-not-allowed disabled:opacity-50"
              title="Export the current filter to Excel (CSV)"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
                <rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" />
                <rect x="3" y="3" width="18" height="4" fill="#0e6e3a" />
                <path d="M8 10l3 4-3 4M16 10l-3 4 3 4" stroke="#107c41" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              Export ({filtered.length.toLocaleString()})
            </button>
          </div>

          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {activeChips.map((c, i) => (
                <button
                  key={i}
                  onClick={c.clear}
                  className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700 hover:border-slate-400"
                >
                  {c.label}
                  <span className="text-slate-400 group-hover:text-slate-600">×</span>
                </button>
              ))}
              <button onClick={resetAll} className="ml-1 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">Clear all</button>
            </div>
          )}

          <div className="mt-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{filtered.length.toLocaleString()}</span> {filtered.length === 1 ? "vehicle" : "vehicles"}
            {filtered.length !== rows.length && <> of {rows.length.toLocaleString()}</>}
          </div>
        </div>

        {/* Results */}
        <div className="mt-4 space-y-2">
          {visible.map((r) => (
            <Card key={r.vin} row={r} open={expanded === r.vin} onToggle={() => setExpanded(expanded === r.vin ? null : r.vin)} />
          ))}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="text-sm font-medium text-slate-700">No vehicles match these filters.</div>
              <button onClick={resetAll} className="mt-2 text-xs font-medium text-violet-600 hover:underline">Clear all filters</button>
            </div>
          )}

          {filtered.length > visible.length && (
            <div className="pt-2 text-center">
              <button
                onClick={() => setLimit((l) => l + 60)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-400"
              >
                Load {Math.min(60, filtered.length - visible.length)} more
                <span className="ml-2 text-xs text-slate-400">({(filtered.length - visible.length).toLocaleString()} remaining)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ row: r, open, onToggle }: { row: StockRow; open: boolean; onToggle: () => void }) {
  const tone = statusTone(r.status);
  const etaDays = daysUntil(r.eta);
  const etaLabel = fmtDate(r.eta);
  const isDelivered = /deliver|dealer|arrived|at site/i.test(r.status ?? "");
  const deliveredDays = daysUntil(r.delivered);
  const deliveredLabel = fmtDate(r.delivered);
  const showVariant = r.variant && r.variant.toUpperCase() !== r.bucket.toUpperCase();
  const specBits = [r.bodyStyle, r.engine, r.transmission, r.drive].filter(Boolean) as string[];

  return (
    <article className={`rounded-xl border bg-white shadow-sm transition ${open ? "border-slate-300" : "border-slate-200 hover:border-slate-300"}`}>
      <button onClick={onToggle} className="w-full p-4 text-left">
        {/* Row 1: model + badge on left, ETA on right */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg font-semibold leading-tight text-slate-900">{r.bucket}</span>
              {showVariant && <span className="text-sm font-medium text-slate-600">{r.variant}</span>}
              {r.derivative && (
                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">{r.derivative}</span>
              )}
              {r.modelYear && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{r.modelYear}</span>}
            </div>
            <div className="mt-1 text-sm">
              <span className="font-medium text-slate-800">{r.colour}</span>
              {specBits.length > 0 && <span className="text-slate-500"> · {specBits.join(" · ")}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            {isDelivered ? (
              // Single badge replaces the status pill so "Delivered" doesn't appear twice.
              <DeliveredBadge label={deliveredLabel} days={deliveredDays} />
            ) : (
              <>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {r.status ?? "Unknown"}
                </span>
                <EtaBadge etaLabel={etaLabel} etaDays={etaDays} hasEta={!!r.eta} />
              </>
            )}
            {isPast(r.adopted) ? (
              <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                Adopted · {fmtDate(r.adopted)}
              </span>
            ) : isPast(r.interestBearing) ? (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Interest bearing · {fmtDate(r.interestBearing)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Row 2: dealer / destination */}
        <div className="mt-2 text-xs text-slate-600">
          <span className="font-medium">{r.dealer}</span>
          {r.destination && r.destination !== r.dealer && <span className="text-slate-400"> · {r.destination}</span>}
        </div>

        {/* Row 3: factory options front-and-centre */}
        {r.options.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Factory options</div>
            <div className="flex flex-wrap gap-1">
              {r.options.map((o, i) => (
                <span key={i} className="inline-block rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-100">{o}</span>
              ))}
            </div>
          </div>
        )}

        {/* Row 4: footer */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            <span className="font-mono">{r.vin}</span>
            {r.orderNo && <span className="ml-2">Order #{r.orderNo}</span>}
          </span>
          <span className="text-slate-500">{open ? "Hide details ▾" : "More details ▸"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <Pair k="VIN"           v={<span className="font-mono">{r.vin}</span>} />
            <Pair k="Order No"      v={r.orderNo ?? "—"} />
            <Pair k="Gate released" v={fmtDate(r.gateRelease) ?? "—"} />
            <Pair k="ETA"           v={etaLabel ?? "—"} />
            <Pair k="Delivered"     v={fmtDate(r.delivered) ?? "—"} />
            <Pair k="Interest bearing" v={fmtDate(r.interestBearing) ?? "—"} />
            <Pair k="Adopted"       v={fmtDate(r.adopted) ?? "—"} />
            <Pair k="Dealer"        v={r.dealer} />
            <Pair k="Destination"   v={r.destination ?? "—"} />
            <Pair k="Body style"    v={r.bodyStyle ?? "—"} />
            <Pair k="Drive"         v={r.drive ?? "—"} />
            <Pair k="Engine"        v={r.engine ?? "—"} />
            <Pair k="Transmission"  v={r.transmission ?? "—"} />
            <Pair k="Model year"    v={r.modelYear ?? "—"} />
            <Pair k="Variant"       v={r.variant || "—"} />
            <Pair k="Derivative"    v={r.derivative ?? "—"} />
            <Pair k="Series"        v={r.series ?? "—"} />
          </div>
        </div>
      )}
    </article>
  );
}

function FacetGroup({
  title, options, selected, onToggle, initiallyShown = 8, defaultOpen = false,
}: {
  title: string;
  options: [string, number][];
  selected: Set<string>;
  onToggle: (v: string) => void;
  initiallyShown?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  // Always show selected options (even if filtered out by search/facet cross-filter).
  const selectedOnly: [string, number][] = [...selected]
    .filter((v) => !options.some(([x]) => x === v))
    .map((v) => [v, 0] as [string, number]);
  const unioned = [...selectedOnly, ...options];
  const filtered = needle ? unioned.filter(([v]) => v.toLowerCase().includes(needle)) : unioned;
  const shown = expanded ? filtered : filtered.slice(0, initiallyShown);
  const hiddenCount = filtered.length - shown.length;
  const showSearch = unioned.length > 10;

  return (
    <div className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{title}</span>
          {selected.size > 0 && (
            <span className="rounded-full bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-700">{selected.size}</span>
          )}
        </div>
        <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <>
          {showSearch && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Find ${title.toLowerCase()}…`}
              className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-slate-400 focus:outline-none"
            />
          )}
          <ul className="mt-2 space-y-0.5">
            {shown.map(([v, n]) => {
              const active = selected.has(v);
              return (
                <li key={v}>
                  <button
                    onClick={() => onToggle(v)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                  >
                    <span className="truncate" title={v}>{v}</span>
                    <span className={`tabular-nums text-[10px] ${active ? "text-slate-300" : "text-slate-400"}`}>{n || "—"}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="px-2 py-1 text-[11px] text-slate-400">No matches</li>
            )}
          </ul>
          {hiddenCount > 0 && !expanded && (
            <button onClick={() => setExpanded(true)} className="mt-1 text-[11px] font-medium text-slate-500 hover:text-slate-800">
              Show {hiddenCount} more
            </button>
          )}
          {expanded && filtered.length > initiallyShown && (
            <button onClick={() => setExpanded(false)} className="mt-1 text-[11px] font-medium text-slate-500 hover:text-slate-800">
              Show less
            </button>
          )}
        </>
      )}
    </div>
  );
}

function DeliveredBadge({ label, days }: { label: string | null; days: number | null }) {
  // Delivered = vehicle is here. Always emerald.
  const rel =
    days === null ? null :
    days < -1 ? `${Math.abs(days)} days ago` :
    days === -1 ? "Yesterday" :
    days === 0 ? "Today" :
    null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-right shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Delivered</div>
      {label ? (
        <>
          <div className="text-sm font-semibold tabular-nums leading-tight text-emerald-900">{label}</div>
          {rel && <div className="text-[11px] font-medium text-emerald-700">{rel}</div>}
        </>
      ) : (
        <div className="text-xs font-medium text-emerald-700">In stock</div>
      )}
    </div>
  );
}

function EtaBadge({ etaLabel, etaDays, hasEta }: { etaLabel: string | null; etaDays: number | null; hasEta: boolean }) {
  if (!hasEta || !etaLabel) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">ETA</div>
        <div className="text-xs font-medium text-slate-400">Not set</div>
      </div>
    );
  }
  // Tone by urgency: overdue → red, ≤7d → amber, ≤30d → sky, later → slate.
  let cls = "border-slate-200 bg-slate-50 text-slate-700";
  let labelCls = "text-slate-500";
  if (etaDays !== null) {
    if (etaDays < 0)       { cls = "border-red-200 bg-red-50 text-red-800";       labelCls = "text-red-600"; }
    else if (etaDays <= 7) { cls = "border-amber-200 bg-amber-50 text-amber-800"; labelCls = "text-amber-700"; }
    else if (etaDays <= 30){ cls = "border-sky-200 bg-sky-50 text-sky-800";       labelCls = "text-sky-700"; }
  }
  const rel =
    etaDays === null ? "" :
    etaDays < 0     ? `${Math.abs(etaDays)} day${Math.abs(etaDays) === 1 ? "" : "s"} ago` :
    etaDays === 0   ? "Today" :
    etaDays === 1   ? "Tomorrow" :
                      `In ${etaDays} days`;
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-right shadow-sm ${cls}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${labelCls}`}>ETA</div>
      <div className="text-sm font-semibold tabular-nums leading-tight">{etaLabel}</div>
      {rel && <div className={`text-[11px] font-medium ${labelCls}`}>{rel}</div>}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k}</div>
      <div className="mt-0.5 text-slate-800">{v}</div>
    </div>
  );
}
