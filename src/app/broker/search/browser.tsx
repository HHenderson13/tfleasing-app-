"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Broker-safe view of the stock list.
//
// What the broker sees vs the TF /stock view:
//   • ref         — unique stable reference (vehicleReferenceFromVin)
//   • bucket, variant, derivative, model year, body, engine, transmission,
//     drive, colour, options, status, eta, delivered, saving (where set)
//   • Get Quote button — links to /broker/quote/[ref] (Phase 3 page)
//
// Hidden from the broker entirely:
//   • VIN, order number, dealer, destination, gate-released date,
//     interest-bearing date, adopted date.
//
// The "Funding" facet (Interest bearing / Adopted) is removed too — those
// tags only make sense on the TF side.
//
// No CSV export button.

export interface BrokerRow {
  ref: string;             // TF-XXXXXXXX
  bucket: string;          // sourceSheet — Focus / Puma / Transit / …
  variant: string;
  derivative: string | null;
  series: string | null;
  modelYear: string | null;
  bodyStyle: string | null;
  engine: string | null;
  transmission: string | null;
  drive: string | null;
  colour: string;
  options: string[];
  status: string | null;
  eta: string | null;
  delivered: string | null;
}

type SortKey = "eta-asc" | "eta-desc" | "model";

type FacetId =
  | "model" | "variant" | "derivative" | "year" | "body" | "engine" | "transmission"
  | "drive" | "colour" | "option" | "status";

const FACETS: { id: FacetId; label: string; get: (r: BrokerRow) => string | string[] | null }[] = [
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
];

const DEFAULT_OPEN: Partial<Record<FacetId, boolean>> = {
  model: true, variant: true, derivative: true, colour: true, option: true, status: true,
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

export function BrokerStockBrowser({ rows }: { rows: BrokerRow[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<FacetId, Set<string>>>(() => {
    const init: Partial<Record<FacetId, Set<string>>> = {};
    for (const f of FACETS) init[f.id] = new Set();
    return init as Record<FacetId, Set<string>>;
  });
  const [open, setOpen] = useState<Record<FacetId, boolean>>(() => {
    const init: Partial<Record<FacetId, boolean>> = {};
    for (const f of FACETS) init[f.id] = !!DEFAULT_OPEN[f.id];
    return init as Record<FacetId, boolean>;
  });
  const [sort, setSort] = useState<SortKey>("eta-asc");
  const [limit, setLimit] = useState(60);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => { setLimit(60); }, [q, sel, sort]);

  function toggle(facet: FacetId, value: string) {
    setSel((prev) => {
      const next = { ...prev, [facet]: new Set(prev[facet]) };
      if (next[facet].has(value)) next[facet].delete(value);
      else next[facet].add(value);
      return next;
    });
  }

  function clearAll() {
    setSel(() => {
      const init: Partial<Record<FacetId, Set<string>>> = {};
      for (const f of FACETS) init[f.id] = new Set();
      return init as Record<FacetId, Set<string>>;
    });
    setQ("");
  }

  // Match a row against the current selection, optionally skipping one
  // facet (used for facet-count computation to show what would happen
  // if the user clicked a value within that facet).
  function matches(r: BrokerRow, skip: FacetId | null): boolean {
    const ql = q.trim().toLowerCase();
    if (ql && !`${r.bucket} ${r.variant} ${r.derivative ?? ""} ${r.modelYear ?? ""} ${r.colour}`.toLowerCase().includes(ql)) return false;
    for (const f of FACETS) {
      if (f.id === skip) continue;
      const sset = sel[f.id];
      if (sset.size === 0) continue;
      const got = f.get(r);
      if (got === null) return false;
      if (Array.isArray(got)) {
        if (!got.some((x) => sset.has(x))) return false;
      } else {
        if (!sset.has(got)) return false;
      }
    }
    return true;
  }

  const filtered = useMemo(() => {
    const out = rows.filter((r) => matches(r, null));
    if (sort === "model") out.sort((a, b) => naturalCompare(`${a.bucket} ${a.variant}`, `${b.bucket} ${b.variant}`));
    else {
      const dir = sort === "eta-asc" ? 1 : -1;
      out.sort((a, b) => {
        const ea = a.eta ? new Date(a.eta).getTime() : (dir === 1 ? Infinity : -Infinity);
        const eb = b.eta ? new Date(b.eta).getTime() : (dir === 1 ? Infinity : -Infinity);
        return (ea - eb) * dir;
      });
    }
    return out;
  }, [rows, q, sel, sort]);

  const facetOptions: Record<FacetId, [string, number][]> = useMemo(() => {
    const out: Partial<Record<FacetId, [string, number][]>> = {};
    for (const f of FACETS) {
      const pool = rows.filter((r) => matches(r, f.id));
      out[f.id] = tally(pool, f.get);
    }
    return out as Record<FacetId, [string, number][]>;
  }, [rows, q, sel]);

  const visible = filtered.slice(0, limit);
  const activeChips: { facet: FacetId; value: string }[] = [];
  for (const f of FACETS) {
    for (const v of sel[f.id]) activeChips.push({ facet: f.id, value: v });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Filters */}
      <aside className={`${mobileFiltersOpen ? "block" : "hidden"} lg:block`}>
        <div className="space-y-2">
          {FACETS.map((f) => {
            const opts = facetOptions[f.id];
            const used = sel[f.id];
            if (opts.length === 0 && used.size === 0) return null;
            return (
              <details key={f.id} open={open[f.id]} onToggle={(e) => setOpen((o) => ({ ...o, [f.id]: (e.target as HTMLDetailsElement).open }))} className="rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-medium text-slate-700">
                  <span>{f.label}{used.size > 0 && <span className="ml-1 text-[10px] text-slate-400">({used.size})</span>}</span>
                  <span className="text-slate-400">{open[f.id] ? "−" : "+"}</span>
                </summary>
                <div className="max-h-56 overflow-y-auto px-3 pb-2">
                  {opts.map(([v, n]) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs">
                      <input type="checkbox" checked={used.has(v)} onChange={() => toggle(f.id, v)} className="h-3.5 w-3.5 rounded border-slate-300" />
                      <span className="flex-1 truncate text-slate-700">{v}</span>
                      <span className="text-[10px] text-slate-400">{n}</span>
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </aside>

      {/* Body */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search model, variant, colour…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="eta-asc">ETA, soonest first</option>
            <option value="eta-desc">ETA, latest first</option>
            <option value="model">Model, A-Z</option>
          </select>
          <button onClick={() => setMobileFiltersOpen((v) => !v)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 lg:hidden">
            {mobileFiltersOpen ? "Hide filters" : "Filters"}
          </button>
        </div>

        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {activeChips.map((c, i) => (
              <button key={`${c.facet}-${c.value}-${i}`} onClick={() => toggle(c.facet, c.value)} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">
                {c.value} ×
              </button>
            ))}
            <button onClick={clearAll} className="text-[11px] text-slate-500 hover:text-slate-900">Clear all</button>
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{filtered.length.toLocaleString()}</span> {filtered.length === 1 ? "vehicle" : "vehicles"}
        </div>

        <div className="mt-3 space-y-2">
          {visible.map((r) => (
            <div key={r.ref} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-900">{r.bucket}</span>
                    <span className="text-sm text-slate-700">{r.variant}</span>
                    {r.derivative && <span className="text-xs text-slate-500">· {r.derivative}</span>}
                    {r.modelYear && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{r.modelYear}</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 space-x-2">
                    {r.bodyStyle && <span>{r.bodyStyle}</span>}
                    {r.engine && <span>· {r.engine}</span>}
                    {r.transmission && <span>· {r.transmission}</span>}
                    {r.drive && <span>· {r.drive}</span>}
                    <span>· {r.colour}</span>
                  </div>
                  {r.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.options.map((o, i) => (
                        <span key={i} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-100">{o}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right space-y-2 shrink-0">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Reference</div>
                    <div className="font-mono text-sm font-semibold text-slate-900">{r.ref}</div>
                  </div>
                  {r.status && (() => {
                    const t = statusTone(r.status);
                    return (
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
                        {r.status}
                      </div>
                    );
                  })()}
                  {r.eta && <div className="text-[11px] text-slate-500">ETA {fmtDate(r.eta)}</div>}
                  {r.delivered && <div className="text-[11px] text-emerald-700">Delivered {fmtDate(r.delivered)}</div>}
                  <Link
                    href={`/broker/quote/${r.ref}`}
                    className="inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Get quote
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length > limit && (
          <div className="mt-4 text-center">
            <button onClick={() => setLimit((l) => l + 60)} className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Load more
            </button>
          </div>
        )}
        {filtered.length === 0 && (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No vehicles match your filters yet. Try clearing one or two.
          </div>
        )}
      </section>
    </div>
  );
}
