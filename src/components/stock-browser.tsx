"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { normaliseReferenceQuery } from "@/lib/stock-reference";

// ─── One browser, two audiences ────────────────────────────────────────────
//
// This component is rendered by BOTH /stock (TF) and /broker/stock. That
// is deliberate and load-bearing: work done on the stock UI has to land
// on the broker portal without being written twice.
//
// The broker view is this view minus things, expressed in exactly two
// places and nowhere else:
//
//   1. lib/stock-list.ts → redactForBroker(). Strips the sensitive
//      fields from the payload on the SERVER, so they are not merely
//      hidden in JSX — they never reach the browser at all. Hiding in
//      JSX would leak them into page source.
//   2. The `audience` prop below, read through the `only` flag on each
//      facet / sort / column, plus the handful of `isBroker` checks in
//      the card.
//
// When you add something to the stock view, the default is that brokers
// get it too. Only add an `only:` flag when it must not be shared, and
// when you do, strip the underlying field in redactForBroker() as well —
// the flag alone is presentation, not privacy.

export type StockAudience = "tf" | "broker";

export type StockRow = {
  // Public handle. Present for both audiences — a broker quotes it back
  // to us and TF pastes it into search. See lib/stock-reference.ts.
  ref: string;
  bucket: string;        // sheet bucket from parser: Focus | Puma | Kuga | ...
  variant: string;       // mapped model · series display name (trim for cars, payload/wheelbase for vans)
  derivative: string | null; // Sport | Limited | Trend (from WERS_SUB_SERIES_DESC), mapped
  series: string | null;
  bodyStyle: string | null;
  engine: string | null;
  transmission: string | null;
  drive: string | null;
  colour: string;
  options: string[];
  eta: string | null;
  inStock: boolean;      // derived server-side from the mapped status
  // ── TF-only. Absent from the broker payload, hence optional. ──────────
  delivered?: string | null;
  vin?: string | null;
  orderNo?: string | null;
  status?: string | null;
  modelYear?: string | null;
  gateRelease?: string | null;
  interestBearing?: string | null;
  adopted?: string | null;
  dealer?: string;
  destination?: string | null;
};

type SortKey = "eta-asc" | "eta-desc" | "gate-desc" | "model" | "dealer";

type FacetId =
  | "model" | "variant" | "derivative" | "availability" | "year" | "body" | "engine"
  | "transmission" | "drive" | "colour" | "option" | "status" | "funding" | "dealer" | "destination";

// Only flag funding when the date has actually passed — a future "interest bearing date"
// means the vehicle isn't bearing interest yet, so don't surface it.
function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= Date.now();
}
function fundingState(r: StockRow): string | null {
  if (isPast(r.adopted)) return "Adopted";
  if (isPast(r.interestBearing)) return "Interest bearing";
  return null;
}

// ─── Availability (the broker's replacement for Status) ────────────────────
//
// Brokers don't see our internal pipeline language. They see the one thing
// they actually need to answer — "when can I have it?" — as a single facet:
// in stock now, or the month it lands. Month granularity because that is
// how a broker sells; a specific date is on the card.
const IN_STOCK_LABEL = "In stock";
const ETA_TBC_LABEL = "ETA to be confirmed";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function availabilityLabel(r: StockRow): string {
  if (r.inStock) return IN_STOCK_LABEL;
  const d = r.eta ? new Date(r.eta) : null;
  if (!d || isNaN(d.getTime())) return ETA_TBC_LABEL;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// What ONE vehicle is told to say, as opposed to which bucket it filters
// into. The facet groups by month because that is a useful filter; a badge
// saying "May 2026" about a specific car is vaguer than the date we have.
// Both come from this file so they stay in step.
function brokerAvailability(r: StockRow): string {
  if (r.inStock) return "Available now";
  if (!r.eta) return "To be confirmed";
  const days = daysUntil(r.eta);
  // Past its ETA — late, or the feed hasn't caught up. "Arriving 02 May"
  // read in September looks broken and invites the question we least want
  // asked, so an elapsed date collapses to "Due now".
  if (days !== null && days < 0) return "Due now";
  return fmtDate(r.eta) ?? "To be confirmed";
}

// Chronological, not alphabetical: "In stock" first, then the months in
// date order, then the unknowns. Built from the label rather than parsed
// with Date so it can't drift on locale.
function availabilitySortKey(v: string): string {
  if (v === IN_STOCK_LABEL) return "0";
  if (v === ETA_TBC_LABEL) return "9";
  const [mon, yr] = v.split(" ");
  const mi = MONTHS.indexOf(mon);
  if (mi < 0 || !yr) return "9";
  return `1-${yr}-${String(mi + 1).padStart(2, "0")}`;
}

type Facet = {
  id: FacetId;
  label: string;
  get: (r: StockRow) => string | string[] | null;
  only?: StockAudience;              // omit to show on both
  sortKey?: (v: string) => string;   // omit for natural alphabetical order
};

const FACETS: Facet[] = [
  { id: "availability", label: "Availability", only: "broker", get: availabilityLabel, sortKey: availabilitySortKey },
  { id: "model",        label: "Model",        get: (r) => r.bucket },
  { id: "variant",      label: "Variant",      get: (r) => r.variant },
  { id: "derivative",   label: "Derivative",   get: (r) => r.derivative },
  { id: "year",         label: "Model year",   only: "tf", get: (r) => r.modelYear ?? null },
  { id: "body",         label: "Body style",   get: (r) => r.bodyStyle },
  { id: "engine",       label: "Engine",       get: (r) => r.engine },
  { id: "transmission", label: "Transmission", get: (r) => r.transmission },
  { id: "drive",        label: "Drive",        get: (r) => r.drive },
  { id: "colour",       label: "Colour",       get: (r) => r.colour },
  { id: "option",       label: "Factory options", get: (r) => r.options },
  { id: "status",       label: "Status",       only: "tf", get: (r) => r.status ?? null },
  { id: "funding",      label: "Funding",      only: "tf", get: fundingState },
  { id: "dealer",       label: "Dealer",       only: "tf", get: (r) => r.dealer ?? null },
  { id: "destination",  label: "Destination",  only: "tf", get: (r) => r.destination ?? null },
];

const SORTS: { id: SortKey; label: string; only?: StockAudience }[] = [
  { id: "eta-asc",   label: "ETA (soonest)" },
  { id: "eta-desc",  label: "ETA (latest)" },
  { id: "gate-desc", label: "Gate released (newest)", only: "tf" },
  { id: "model",     label: "Model A→Z" },
  { id: "dealer",    label: "Dealer A→Z", only: "tf" },
];

// Facets opened by default. Availability leads the broker view because
// "when can I get one" is the first question they ask.
const DEFAULT_OPEN: Partial<Record<FacetId, boolean>> = {
  availability: true, model: true, variant: true, derivative: true, colour: true, option: true, status: true,
};

function forAudience<T extends { only?: StockAudience }>(items: T[], audience: StockAudience): T[] {
  return items.filter((i) => !i.only || i.only === audience);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(iso: string | null | undefined): number | null {
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

// TF only — brokers get no export button, and this is never reachable
// from the broker view.
function exportCsv(rows: StockRow[]) {
  const headers = [
    "Reference", "VIN", "Model", "Variant", "Derivative", "Series", "Model year",
    "Body style", "Engine", "Transmission", "Drive",
    "Colour", "Factory options", "Order no", "Status",
    "Gate released", "ETA", "Delivered", "Interest bearing", "Adopted", "Dealer", "Destination",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.ref, r.vin, r.bucket, r.variant, r.derivative, r.series, r.modelYear,
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

function statusTone(s: string | null | undefined): { cls: string; dot: string } {
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

function tally<T>(rows: T[], f: Facet, pick: (r: T) => string | string[] | null): [string, number][] {
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
  const key = f.sortKey ?? ((v: string) => v);
  return [...m.entries()].sort((a, b) => naturalCompare(key(a[0]), key(b[0])));
}

export function StockBrowser({ rows, audience = "tf" }: { rows: StockRow[]; audience?: StockAudience }) {
  const isBroker = audience === "broker";
  const facets = useMemo(() => forAudience(FACETS, audience), [audience]);
  const sorts = useMemo(() => forAudience(SORTS, audience), [audience]);

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

  // Reset pagination whenever the result set changes underneath it.
  //
  // A render-phase adjustment rather than an effect. An effect would commit
  // a paint showing page 5 of the *previous* filter before resetting, so
  // the list visibly flashes the wrong rows; React re-runs this component
  // before painting instead, making the reset invisible. It's also the
  // cascading render that react-hooks/set-state-in-effect warns about.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const filterSignature = useMemo(
    () => [q, sort, ...facets.map((f) => [...sel[f.id]].sort().join("\u0001"))].join("\u0002"),
    [q, sort, sel, facets],
  );
  const [pagedSignature, setPagedSignature] = useState(filterSignature);
  if (pagedSignature !== filterSignature) {
    setPagedSignature(filterSignature);
    setLimit(60);
  }

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

  // A pasted reference is an exact lookup, not a substring search — the
  // whole point of the scheme is that a broker reads "TF-2GG495H9" down
  // the phone and TF lands on that one vehicle.
  //
  // Guarded on an actual hit: eight characters of the reference alphabet
  // is a shape ordinary search text can accidentally take ("PANTHER5"),
  // and silently returning nothing for a real search would be worse than
  // not having the feature. No hit → fall through to substring.
  const refQuery = useMemo(() => {
    const norm = normaliseReferenceQuery(q);
    if (!norm) return null;
    return rows.some((r) => r.ref === norm) ? norm : null;
  }, [q, rows]);

  function haystack(r: StockRow) {
    // Only ever built from fields this audience can already see. The
    // broker payload has no VIN / order / dealer to search anyway, but
    // being explicit stops a future field leaking in via search.
    const shared = `${r.ref} ${r.bucket} ${r.variant} ${r.derivative ?? ""} ${r.series ?? ""} ${r.colour} ${r.engine ?? ""} ${r.options.join(" ")}`;
    if (isBroker) return shared.toLowerCase();
    return `${shared} ${r.vin ?? ""} ${r.orderNo ?? ""} ${r.dealer ?? ""} ${r.destination ?? ""}`.toLowerCase();
  }

  function matchesSearch(r: StockRow) {
    if (refQuery) return r.ref === refQuery;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return haystack(r).includes(needle);
  }

  // Apply filters except `skip` so facet counts reflect the rest.
  function matches(r: StockRow, skip: FacetId | null) {
    for (const f of facets) {
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
    return matchesSearch(r);
  }

  const filtered = useMemo(() => {
    const out = rows.filter((r) => matches(r, null));
    // For "soonest", vehicles already here count as "available now" and sort to
    // the top — they don't have an ETA because they've already arrived.
    const etaAsc = (r: StockRow) => r.inStock ? -Infinity : r.eta ? +new Date(r.eta) : Infinity;
    const etaDesc = (r: StockRow) => r.inStock ? Infinity : r.eta ? +new Date(r.eta) : -Infinity;
    out.sort((a, b) => {
      switch (sort) {
        case "eta-asc":   return etaAsc(a) - etaAsc(b);
        case "eta-desc":  return etaDesc(b) - etaDesc(a);
        case "gate-desc": return (b.gateRelease ? +new Date(b.gateRelease) : -Infinity) - (a.gateRelease ? +new Date(a.gateRelease) : -Infinity);
        case "model":     return a.bucket.localeCompare(b.bucket) || a.variant.localeCompare(b.variant) || a.colour.localeCompare(b.colour);
        case "dealer":    return (a.dealer ?? "").localeCompare(b.dealer ?? "");
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sel, sort, refQuery, audience]);

  // Guided faceted search — each facet's options reflect the pool filtered
  // by every OTHER facet but NOT by its own selection. This is the standard
  // multi-select faceted UX: once you pick "Focus" in Model, you can still
  // see Puma / Kuga / Transit in the Model facet to add to the selection,
  // but the Colour / Variant / etc. facets only show options available
  // across the currently-selected models.
  //
  // To avoid a separate O(N×F) pass per facet, we precompute which facets
  // each row fails once, then derive per-facet pools in O(N) by accepting
  // rows whose failure set is empty OR contains only this facet. For a
  // typical 3000-row dataset that's ~50k ops vs ~600k for the naive
  // approach — keeps the filter feel instant even on big stock lists.
  const facetOptions: Record<string, [string, number][]> = useMemo(() => {
    const SEARCH_KEY = "__search" as const;

    // Per-row: set of facets (+ search) the row fails against the current
    // selection. A row passes the entire filter when this set is empty.
    const failsByRow = new Map<StockRow, Set<string>>();
    for (const r of rows) {
      const fails = new Set<string>();
      for (const f of facets) {
        const picked = sel[f.id];
        if (picked.size === 0) continue;
        const val = f.get(r);
        if (val === null || val === undefined) { fails.add(f.id); continue; }
        let passes: boolean;
        if (Array.isArray(val)) {
          // AND-semantics on the factory-options facet — must have every selected option.
          passes = [...picked].every((s) => val.includes(s));
        } else {
          passes = picked.has(val);
        }
        if (!passes) fails.add(f.id);
      }
      if (!matchesSearch(r)) fails.add(SEARCH_KEY);
      if (fails.size > 0) failsByRow.set(r, fails);
    }

    const o: Record<string, [string, number][]> = {};
    for (const f of facets) {
      // Pool for THIS facet: every row that either passes everything
      // OR fails only against this facet's own selection. Search failures
      // always disqualify (search isn't a facet you can "skip").
      const pool = rows.filter((r) => {
        const fails = failsByRow.get(r);
        if (!fails) return true;
        if (fails.size === 1 && fails.has(f.id)) return true;
        return false;
      });
      o[f.id] = tally(pool, f, f.get);
    }
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sel, refQuery, audience]);

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
  for (const f of facets) {
    for (const v of sel[f.id]) {
      activeChips.push({ label: `${f.label}: ${v}`, clear: () => toggle(f.id, v) });
    }
  }
  if (q) activeChips.push({ label: refQuery ? `Reference ${refQuery}` : `"${q}"`, clear: () => setQ("") });

  const visible = filtered.slice(0, limit);

  return (
    <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
      {/* Sidebar */}
      <aside className={`${mobileFiltersOpen ? "block" : "hidden"} lg:block lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`}>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {facets.map((f) => {
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
                placeholder={isBroker
                  ? "Search model, colour, options, reference…   (press /)"
                  : "Search VIN, order no, reference, options…   (press /)"}
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
              {sorts.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            {!isBroker && (
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
            )}
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
            <Card
              key={r.ref}
              row={r}
              audience={audience}
              open={expanded === r.ref}
              onToggle={() => setExpanded(expanded === r.ref ? null : r.ref)}
            />
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

function Card({ row: r, audience, open, onToggle }: { row: StockRow; audience: StockAudience; open: boolean; onToggle: () => void }) {
  const isBroker = audience === "broker";
  const tone = statusTone(r.status);
  const etaDays = daysUntil(r.eta);
  const etaLabel = fmtDate(r.eta);
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
              {!isBroker && r.modelYear && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{r.modelYear}</span>}
            </div>
            <div className="mt-1 text-sm">
              <span className="font-medium text-slate-800">{r.colour}</span>
              {specBits.length > 0 && <span className="text-slate-500"> · {specBits.join(" · ")}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            {/* Brokers get exactly one badge, from one component, in every
                case — see BrokerAvailabilityBadge. TF keeps the status pill
                alongside the urgency-toned ETA. */}
            {isBroker ? (
              <BrokerAvailabilityBadge row={r} />
            ) : r.inStock ? (
              // Single badge replaces the status pill so "Delivered" doesn't appear twice.
              <DeliveredBadge label={deliveredLabel} days={daysUntil(r.delivered)} />
            ) : (
              <>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {r.status ?? "Unknown"}
                </span>
                <EtaBadge etaLabel={etaLabel} etaDays={etaDays} hasEta={!!r.eta} />
              </>
            )}
            {/* Funding is TF-only and never rendered on the broker view. */}
            {!isBroker && (isPast(r.adopted) ? (
              <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                Adopted · {fmtDate(r.adopted)}
              </span>
            ) : isPast(r.interestBearing) ? (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Interest bearing · {fmtDate(r.interestBearing)}
              </span>
            ) : null)}
          </div>
        </div>

        {/* Row 2: dealer / destination — TF only */}
        {!isBroker && (
          <div className="mt-2 text-xs text-slate-600">
            <span className="font-medium">{r.dealer}</span>
            {r.destination && r.destination !== r.dealer && <span className="text-slate-400"> · {r.destination}</span>}
          </div>
        )}

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

        {/* Row 4: footer. The reference is the broker's only handle on a
            vehicle, so it leads; TF keeps VIN and order number alongside. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            <span className="font-mono text-slate-500">{r.ref}</span>
            {!isBroker && r.vin && <span className="ml-2 font-mono">{r.vin}</span>}
            {!isBroker && r.orderNo && <span className="ml-2">Order #{r.orderNo}</span>}
          </span>
          <span className="text-slate-500">{open ? "Hide details ▾" : "More details ▸"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <Pair k="Reference"     v={<span className="font-mono">{r.ref}</span>} />
            {!isBroker && <Pair k="VIN"           v={<span className="font-mono">{r.vin ?? "—"}</span>} />}
            {!isBroker && <Pair k="Order No"      v={r.orderNo ?? "—"} />}
            {!isBroker && <Pair k="Gate released" v={fmtDate(r.gateRelease) ?? "—"} />}
            {isBroker ? (
              // Same function as the badge, so the card can't contradict itself.
              <Pair k="Availability" v={brokerAvailability(r)} />
            ) : (
              <>
                <Pair k="ETA"         v={etaLabel ?? "—"} />
                <Pair k="Delivered"   v={deliveredLabel ?? "—"} />
              </>
            )}
            {!isBroker && <Pair k="Interest bearing" v={fmtDate(r.interestBearing) ?? "—"} />}
            {!isBroker && <Pair k="Adopted"       v={fmtDate(r.adopted) ?? "—"} />}
            {!isBroker && <Pair k="Dealer"        v={r.dealer ?? "—"} />}
            {!isBroker && <Pair k="Destination"   v={r.destination ?? "—"} />}
            <Pair k="Body style"    v={r.bodyStyle ?? "—"} />
            <Pair k="Drive"         v={r.drive ?? "—"} />
            <Pair k="Engine"        v={r.engine ?? "—"} />
            <Pair k="Transmission"  v={r.transmission ?? "—"} />
            {!isBroker && <Pair k="Model year"    v={r.modelYear ?? "—"} />}
            <Pair k="Variant"       v={r.variant || "—"} />
            <Pair k="Derivative"    v={r.derivative ?? "—"} />
            <Pair k="Series"        v={r.series ?? "—"} />
          </div>
          {isBroker && (
            <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
              Quote reference <span className="font-mono font-medium text-slate-700">{r.ref}</span> when you enquire about this vehicle.
            </p>
          )}
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

// ─── Broker badge ──────────────────────────────────────────────────────────
//
// EVERY badge a broker sees comes from here. Two states, and no third:
// the vehicle is here, or it is arriving.
//
// That single-component rule is the whole point. The badges used to be
// split across DeliveredBadge and EtaBadge with audience flags threaded
// through both, and they drifted: an in-stock car WITH a delivered date
// advertised the date it landed, one without said "Available now", and an
// overdue ETA turned red and announced how many days late we were. Same
// list, three different stories.
//
// Deliberately absent: the arrival date (it prices the car — a unit that
// landed in May is a unit we plainly want rid of; `delivered` no longer
// reaches the browser at all, see redactForBroker), and any urgency
// colour or countdown on the ETA, which is our schedule pressure to feel,
// not theirs.
function BrokerAvailabilityBadge({ row }: { row: StockRow }) {
  const label = brokerAvailability(row);
  if (row.inStock) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-right shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">In stock</div>
        <div className="text-sm font-semibold leading-tight text-emerald-900">{label}</div>
      </div>
    );
  }
  // A date gets tabular figures so the column of them lines up; the two
  // word-labels ("Due now", "To be confirmed") would look wrong in them.
  const isDate = label !== "Due now" && label !== "To be confirmed";
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-right shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Arriving</div>
      <div className={`text-sm leading-tight text-sky-900 ${isDate ? "font-semibold tabular-nums" : "font-medium"}`}>{label}</div>
    </div>
  );
}

// TF only. Keeps the arrival date and the ageing count — internally that
// IS the signal, and it is exactly what the broker view withholds.
function DeliveredBadge({ label, days }: { label: string | null; days: number | null }) {
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
