"use client";
import { useMemo, useState, useTransition } from "react";
import { deleteMapping, upsertMapping, type MappingKind } from "./actions";

type Mapping = {
  kind: MappingKind;
  rawKey: string;
  displayName: string;
  hidden: boolean;
  promoteToVariant: boolean;
};
type RawCount = { raw: string; count: number; buckets: string[] };

const KINDS: { id: MappingKind; label: string }[] = [
  { id: "dealer",       label: "Dealers" },
  { id: "model",        label: "Variants" },
  { id: "derivative",   label: "Derivatives" },
  { id: "body",         label: "Body / payload" },
  { id: "engine",       label: "Engines" },
  { id: "transmission", label: "Transmission" },
  { id: "drive",        label: "Drive" },
  { id: "colour",       label: "Colours" },
  { id: "option",       label: "Factory options" },
  { id: "status",       label: "Status" },
  { id: "destination",  label: "Destinations" },
];

export function StockMappingsView({
  mappings,
  rawsByKind,
  allBuckets,
}: {
  mappings: Mapping[];
  rawsByKind: Record<MappingKind, RawCount[]>;
  allBuckets: string[];
}) {
  const [tab, setTab] = useState<MappingKind>("dealer");
  const [bucketFilter, setBucketFilter] = useState<string | null>(null);

  const current = mappings.filter((m) => m.kind === tab);
  const raws = rawsByKind[tab] ?? [];

  // Bucket filter doesn't apply to dealers (they span all models).
  const bucketApplicable = tab !== "dealer";
  const filteredRaws = useMemo(() => {
    if (!bucketApplicable || !bucketFilter) return raws;
    return raws.filter((r) => r.buckets.includes(bucketFilter));
  }, [raws, bucketFilter, bucketApplicable]);

  const unmappedCounts = useMemo(() => {
    const counts: Partial<Record<MappingKind, number>> = {};
    for (const k of KINDS) {
      const seen = new Set(mappings.filter((m) => m.kind === k.id).map((m) => m.rawKey));
      counts[k.id] = (rawsByKind[k.id] ?? []).filter((r) => !seen.has(r.raw)).length;
    }
    return counts;
  }, [mappings, rawsByKind]);

  return (
    <div className="space-y-4">
      {/* Kind tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
        {KINDS.map((k) => {
          const active = tab === k.id;
          const unmapped = unmappedCounts[k.id] ?? 0;
          return (
            <button
              key={k.id}
              onClick={() => setTab(k.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${active ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}
            >
              {k.label}
              {unmapped > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-semibold ${active ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-700"}`}>
                  {unmapped}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bucket filter (per-model) */}
      {bucketApplicable && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-xs">
          <span className="mr-1 px-1 font-semibold uppercase tracking-wide text-slate-500">Model:</span>
          <BucketPill label="All" active={bucketFilter === null} onClick={() => setBucketFilter(null)} />
          {allBuckets.map((b) => (
            <BucketPill key={b} label={b} active={bucketFilter === b} onClick={() => setBucketFilter(b)} />
          ))}
        </div>
      )}

      <MappingsTable kind={tab} mappings={current} raws={filteredRaws} />
    </div>
  );
}

function BucketPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 font-medium transition ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
    >
      {label}
    </button>
  );
}

function MappingsTable({
  kind,
  mappings,
  raws,
}: {
  kind: MappingKind;
  mappings: Mapping[];
  raws: RawCount[];
}) {
  const [, start] = useTransition();
  const [filter, setFilter] = useState("");
  const mapByRaw = useMemo(() => new Map(mappings.map((m) => [m.rawKey, m])), [mappings]);

  const unmapped = raws.filter((r) => !mapByRaw.has(r.raw));
  const mapped = raws.filter((r) => mapByRaw.has(r.raw));
  const q = filter.trim().toLowerCase();
  const apply = (list: RawCount[]) =>
    q ? list.filter((r) => r.raw.toLowerCase().includes(q)) : list;

  return (
    <div className="space-y-4">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`Filter ${kind}s…`}
        className="w-72 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
      />

      <Section title={`Unmapped — ${unmapped.length}`} tint="amber">
        {apply(unmapped).length === 0 ? (
          <Empty text={unmapped.length === 0 ? "Nothing unmapped." : "No matches."} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {apply(unmapped).slice(0, 500).map((r) => (
              <UnmappedRow key={r.raw} kind={kind} raw={r.raw} count={r.count} buckets={r.buckets} onSaved={() => start(() => Promise.resolve())} />
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Mapped — ${mapped.length}`} tint="slate">
        {apply(mapped).length === 0 ? (
          <Empty text="No matches." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {apply(mapped).map((r) => {
              const m = mapByRaw.get(r.raw)!;
              return (
                <MappedRow key={r.raw} kind={kind} mapping={m} count={r.count} buckets={r.buckets} />
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children, tint }: { title: string; children: React.ReactNode; tint: "amber" | "slate" }) {
  const c = tint === "amber" ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white";
  return (
    <section className={`overflow-hidden rounded-2xl border ${c} shadow-sm`}>
      <div className="border-b border-slate-200 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <div className="bg-white">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-sm text-slate-400">{text}</div>;
}

function Buckets({ buckets }: { buckets: string[] }) {
  if (buckets.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {buckets.map((b) => (
        <span key={b} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{b}</span>
      ))}
    </div>
  );
}

function UnmappedRow({
  kind, raw, count, buckets, onSaved,
}: {
  kind: MappingKind;
  raw: string;
  count: number;
  buckets: string[];
  onSaved: () => void;
}) {
  const [, start] = useTransition();
  const [name, setName] = useState(raw);
  const [hidden, setHidden] = useState(false);
  const [promoteToVariant, setPromoteToVariant] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    start(async () => {
      const res = await upsertMapping({ kind, rawKey: raw, displayName: name, hidden, promoteToVariant });
      if (!res.ok) { setErr(res.error); return; }
      onSaved();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
      <div className="min-w-[260px] flex-1">
        <div className="font-mono text-xs text-slate-500">{raw}</div>
        <div className="text-[11px] text-slate-400">{count.toLocaleString()} vehicle{count === 1 ? "" : "s"}</div>
        <Buckets buckets={buckets} />
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-64 rounded-md border border-slate-200 px-2 py-1 text-sm"
      />
      <label className="inline-flex items-center gap-1 text-xs text-slate-500">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
        Hide
      </label>
      {kind === "derivative" && (
        <label className="inline-flex items-center gap-1 text-xs text-violet-600">
          <input type="checkbox" checked={promoteToVariant} onChange={(e) => setPromoteToVariant(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
          Use as variant
        </label>
      )}
      <button onClick={save} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">Save</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </li>
  );
}

function MappedRow({
  kind, mapping, count, buckets,
}: {
  kind: MappingKind;
  mapping: Mapping;
  count: number;
  buckets: string[];
}) {
  const [, start] = useTransition();
  const [name, setName] = useState(mapping.displayName);
  const [hidden, setHidden] = useState(mapping.hidden);
  const [promoteToVariant, setPromoteToVariant] = useState(mapping.promoteToVariant);

  function save(nextName = name, nextHidden = hidden, nextPromote = promoteToVariant) {
    start(async () => {
      await upsertMapping({ kind, rawKey: mapping.rawKey, displayName: nextName, hidden: nextHidden, promoteToVariant: nextPromote });
    });
  }
  function remove() {
    if (!confirm(`Remove mapping for "${mapping.rawKey}"? The raw value will appear again as unmapped.`)) return;
    start(async () => { await deleteMapping(kind, mapping.rawKey); });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
      <div className="min-w-[260px] flex-1">
        <div className="font-mono text-xs text-slate-400">{mapping.rawKey}</div>
        <div className="text-[11px] text-slate-400">{count.toLocaleString()} vehicle{count === 1 ? "" : "s"}</div>
        <Buckets buckets={buckets} />
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => save()}
        className="w-64 rounded-md border border-slate-200 px-2 py-1 text-sm"
      />
      <label className="inline-flex items-center gap-1 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => { const v = e.target.checked; setHidden(v); save(name, v, promoteToVariant); }}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        Hide
      </label>
      {kind === "derivative" && (
        <label className="inline-flex items-center gap-1 text-xs text-violet-600">
          <input
            type="checkbox"
            checked={promoteToVariant}
            onChange={(e) => { const v = e.target.checked; setPromoteToVariant(v); save(name, hidden, v); }}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          Use as variant
        </label>
      )}
      <button onClick={remove} className="text-slate-300 hover:text-red-500">×</button>
    </li>
  );
}
