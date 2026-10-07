"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSlots,
  dedupeListings,
  distinctNumeric,
  groupBy,
  type Segment,
  type Slot,
} from "@/lib/market-slots";
import {
  compareSlots,
  type Cause,
  type LeadChange,
  type RangeStats,
  type TrendRun,
} from "@/lib/market-trends";
import { gapStr, hmClass, milesLabel, modelShort, pct } from "../intel-lib";
import { loadRun } from "../run-cache";
import { LineChart } from "./LineChart";

// The Trends tab: how our position moves from run to run. Deliberately its
// own tab, reading the same slots as Intelligence, so nothing here changes
// what the Intelligence tab shows.

const SEGMENTS: Array<{ id: Segment; label: string }> = [
  { id: "car", label: "Cars" },
  { id: "van", label: "Vans" },
];
const BLUE = "#2563eb";
const ORANGE = "#eb6834";
const DAY = 86_400_000;

function runDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  return withTime
    ? `${date} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
    : date;
}

function runName(r: TrendRun): string {
  return `${runDate(r.startedAt, true)} · ${r.label || "Unlabelled"}`;
}

function statsFor(r: TrendRun, segment: Segment, range: string): RangeStats | null {
  const seg = r.summary?.[segment];
  if (!seg) return null;
  return range ? seg.ranges[range] ?? null : seg.overall;
}

export function TrendsPanel() {
  const [runs, setRuns] = useState<TrendRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>("car");
  const [range, setRange] = useState("");
  const [picked, setPicked] = useState<{ before: string; after: string } | null>(null);

  useEffect(() => {
    fetch("/api/scraper/trends")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
        return r.json() as Promise<TrendRun[]>;
      })
      .then(setRuns)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const inSegment = useMemo(
    () => (runs ?? []).filter((r) => r.summary?.[segment]),
    [runs, segment]
  );
  const ranges = useMemo(
    () => [...new Set(inSegment.flatMap((r) => Object.keys(r.summary![segment]!.ranges)))].sort(),
    [inSegment, segment]
  );

  // Default comparison: the latest run against the latest one at least six
  // days older. Runs are often repeated within a day or two, and "what
  // changed since this morning" is nearly always "nothing".
  const defaults = useMemo(() => {
    if (inSegment.length < 2) return null;
    const after = inSegment[inSegment.length - 1];
    const cutoff = new Date(after.startedAt).getTime() - 6 * DAY;
    const before =
      [...inSegment].reverse().find((r) => new Date(r.startedAt).getTime() <= cutoff) ??
      inSegment[inSegment.length - 2];
    return { before: before.id, after: after.id };
  }, [inSegment]);
  // A pick survives a segment switch only if both runs cover the new segment.
  const pickValid =
    picked &&
    inSegment.some((r) => r.id === picked.before) &&
    inSegment.some((r) => r.id === picked.after);
  const pair = pickValid ? picked : defaults;

  const changeSegment = (s: Segment) => {
    setSegment(s);
    setRange("");
  };

  return (
    <>
      <div className="intel-toolbar">
        <div>
          <div className="intel-title">Trends</div>
          <div className="intel-subtitle">
            {runs === null
              ? error
                ? `Couldn't load: ${error}`
                : "Loading run history… (the first visit summarises every past run once)"
              : `${inSegment.length} runs with ${segment === "van" ? "vans" : "cars"} · ${runDate(inSegment[0]?.startedAt ?? new Date().toISOString())} to ${runDate(inSegment[inSegment.length - 1]?.startedAt ?? new Date().toISOString())}`}
          </div>
        </div>
        <div className="intel-toolbar-right">
          <div className="seg-toggle" role="tablist">
            {SEGMENTS.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={segment === s.id}
                className={segment === s.id ? "active" : ""}
                onClick={() => changeSegment(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="">All ranges</option>
            {ranges.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="intel-scroll">
        {runs !== null && inSegment.length === 0 && (
          <div className="empty-state">No runs with {segment === "van" ? "vans" : "cars"} yet.</div>
        )}
        {inSegment.length > 0 && (
          <>
            <History
              runs={inSegment}
              segment={segment}
              range={range}
              ranges={range ? [range] : ranges}
              onPick={(after) => {
                const i = inSegment.findIndex((r) => r.id === after);
                if (i > 0) setPicked({ before: inSegment[i - 1].id, after });
              }}
            />
            {pair && (
              // Keyed so a new pair, segment or range starts clean — no
              // half-open vehicle from the previous comparison.
              <WhatChanged
                key={`${segment}|${range}|${pair.before}>${pair.after}`}
                runs={inSegment}
                segment={segment}
                range={range}
                beforeId={pair.before}
                afterId={pair.after}
                onBefore={(id) => setPicked({ before: id, after: pair.after })}
                onAfter={(id) => setPicked({ before: pair.before, after: id })}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Position over time ─────────────────────────────────────────────────────

function History({
  runs,
  segment,
  range,
  ranges,
  onPick,
}: {
  runs: TrendRun[];
  segment: Segment;
  range: string;
  ranges: string[];
  onPick: (afterId: string) => void;
}) {
  const stats = runs.map((r) => statsFor(r, segment, range));
  // The table reads oldest → newest like the charts above it, but it's the
  // newest runs that matter, so it opens scrolled to the right-hand end.
  const heatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = heatRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [segment, range, runs.length]);
  // Runs don't all search the same URLs, so the combo count rides along in
  // the tooltip: a dip on a run that covered half as much is not a trend.
  const points = runs.map((r, i) => ({
    x: new Date(r.startedAt).getTime(),
    label: `${runName(r)} · ${(stats[i]?.compared ?? 0).toLocaleString()} combos`,
  }));
  const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

  return (
    <div className="tr-section">
      <div className="tr-section-title">
        Position over time
        <span>{range || "All ranges"} · one point per run</span>
      </div>
      <div className="tr-charts">
        <LineChart
          title="Price advantage vs the cheapest rival"
          subtitle="Average £/mo, like-for-like. Above zero we're cheaper."
          points={points}
          zero
          format={(v) => (v === 0 ? "£0" : `${v > 0 ? "+" : "−"}£${Math.abs(v).toFixed(0)}`)}
          series={[
            { name: "Advantage", color: BLUE, values: stats.map((s) => (s?.gap != null ? -s.gap : null)) },
          ]}
        />
        <LineChart
          title="How often we're cheapest"
          subtitle="Like-for-like by term, and on headline price (our best at any term vs theirs)."
          points={points}
          domain={[0, 100]}
          format={(v) => `${Math.round(v)}%`}
          series={[
            { name: "Like-for-like", color: BLUE, values: stats.map((s) => (s ? ratio(s.cheapest, s.compared) : null)) },
            { name: "Headline", color: ORANGE, values: stats.map((s) => (s ? ratio(s.headline.lowest, s.headline.compared) : null)) },
          ]}
        />
      </div>

      <div className="tr-heat-wrap" ref={heatRef}>
        <table className="intel-table tr-heat">
          <thead>
            <tr>
              <th className="tr-sticky">Range · avg gap</th>
              {runs.map((r, i) => (
                <th
                  key={r.id}
                  title={`${runName(r)} — click to compare with the run before`}
                  className={i > 0 ? "tr-pickable" : ""}
                  onClick={() => i > 0 && onPick(r.id)}
                >
                  {runDate(r.startedAt)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="no-click">
            {ranges.map((rg) => (
              <tr key={rg}>
                <td className="tr-sticky td-our-price">{rg}</td>
                {runs.map((r) => {
                  const s = r.summary?.[segment]?.ranges[rg];
                  if (!s || s.gap === null) return <td key={r.id} className="tr-cell hm-none">—</td>;
                  return (
                    <td
                      key={r.id}
                      className={`tr-cell ${hmClass(s.gap)}`}
                      title={`${rg}, ${runName(r)}\nAvg gap ${gapStr(s.gap)}/mo over ${s.compared} combos\nCheapest on ${s.cheapest} (${pct(s.cheapest, s.compared)})\nLowest headline on ${s.headline.lowest} of ${s.headline.compared}`}
                    >
                      {gapStr(s.gap).replace(/\.\d+$/, "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dd-hint">
        Gap is our price minus the cheapest rival&apos;s, shown from our side: green we&apos;re cheaper,
        amber within £20, red more than £20 dearer. Click a date to see what changed since the run before it.
      </div>
    </div>
  );
}

// ── What changed between two runs ──────────────────────────────────────────

function causeLabel(c: Cause): string {
  switch (c.kind) {
    case "tf-rose": return "We rose";
    case "tf-cut": return "We cut";
    case "rival-cut": return `${c.broker} cut`;
    case "new-rival": return `${c.broker} new`;
    case "rival-rose": return `${c.broker} rose`;
    case "rival-left": return `${c.broker} left`;
  }
}

function tally(changes: LeadChange[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const c of changes) for (const x of c.causes) m.set(causeLabel(x), (m.get(causeLabel(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function WhatChanged({
  runs,
  segment,
  range,
  beforeId,
  afterId,
  onBefore,
  onAfter,
}: {
  runs: TrendRun[];
  segment: Segment;
  range: string;
  beforeId: string;
  afterId: string;
  onBefore: (id: string) => void;
  onAfter: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; before: Slot[]; after: Slot[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [mode, setMode] = useState<"lost" | "gained">("lost");
  const [vehicle, setVehicle] = useState<{ range: string; vehicleKey: string } | null>(null);
  const pairKey = `${beforeId}>${afterId}`;

  useEffect(() => {
    let live = true;
    Promise.all([loadRun(beforeId), loadRun(afterId)])
      .then(([b, a]) => {
        if (!live) return;
        setLoaded({
          key: pairKey,
          before: buildSlots(dedupeListings(b).rows),
          after: buildSlots(dedupeListings(a).rows),
        });
      })
      .catch((e) => live && setFailed(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      live = false;
    };
  }, [beforeId, afterId, pairKey]);

  const ready = loaded?.key === pairKey ? loaded : null;
  const cmp = useMemo(() => {
    if (!ready) return null;
    const keep = (s: Slot) => s.segment === segment && (!range || s.range === range);
    return compareSlots(ready.before.filter(keep), ready.after.filter(keep));
  }, [ready, segment, range]);

  const before = runs.find((r) => r.id === beforeId);
  const after = runs.find((r) => r.id === afterId);
  const days = before && after
    ? Math.round((new Date(after.startedAt).getTime() - new Date(before.startedAt).getTime()) / DAY)
    : 0;

  const list = useMemo(() => (cmp ? (mode === "lost" ? cmp.lost : cmp.gained) : []), [cmp, mode]);
  const byVehicle = useMemo(
    () =>
      [...groupBy(list, (c) => `${c.after.range}||${c.after.vehicleKey}`).values()]
        .map((cs) => ({
          first: cs[0].after,
          count: cs.length,
          rivals: [...new Set(cs.map((c) => c.rival))],
          causes: tally(cs),
        }))
        .sort((a, b) => b.count - a.count),
    [list]
  );
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? byVehicle : byVehicle.slice(0, 10);

  return (
    <div className="tr-section">
      <div className="tr-section-title">
        What changed
        <span>{range || "All ranges"} · combos priced in both runs</span>
      </div>
      <div className="tr-pickers">
        <label>
          From
          <select value={beforeId} onChange={(e) => onBefore(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id} disabled={r.id === afterId}>{runName(r)}</option>
            ))}
          </select>
        </label>
        <span className="tr-arrow">→</span>
        <label>
          To
          <select value={afterId} onChange={(e) => onAfter(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id} disabled={r.id === beforeId}>{runName(r)}</option>
            ))}
          </select>
        </label>
        {days !== 0 && <span className="tr-days">{Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} apart</span>}
      </div>

      {failed && <div className="empty-state">Couldn&apos;t load runs: {failed}</div>}
      {!cmp && !failed && <div className="empty-state">Loading both runs…</div>}

      {cmp && vehicle && (
        <VehicleChange
          pairs={[...cmp.pairs.values()].filter(
            (p) => p.after.range === vehicle.range && p.after.vehicleKey === vehicle.vehicleKey
          )}
          onBack={() => setVehicle(null)}
        />
      )}

      {cmp && !vehicle && (
        <>
          <div className="intel-summary tr-cards">
            <Card
              value={`${pct(cmp.before.cheapest, cmp.before.compared)} → ${pct(cmp.after.cheapest, cmp.after.compared)}`}
              label="We're cheapest"
              sub={`on ${cmp.matched.toLocaleString()} combos in both runs`}
            />
            <Card
              value={`${gapStr(cmp.before.gap)} → ${gapStr(cmp.after.gap)}`}
              label="Avg gap vs cheapest"
              sub="£/mo, from our side"
            />
            <Card value={cmp.lost.length.toLocaleString()} label="Lost cheapest" color="#dc2626" />
            <Card value={cmp.gained.length.toLocaleString()} label="Gained cheapest" color="#16a34a" />
            <Card
              value={`${(cmp.brokers.filter((b) => b.isTF).reduce((n, b) => n + b.rises, 0)).toLocaleString()} up · ${(cmp.brokers.filter((b) => b.isTF).reduce((n, b) => n + b.cuts, 0)).toLocaleString()} down`}
              label="Our price moves"
              sub={`${cmp.tfAdded} newly listed · ${cmp.tfDropped} dropped`}
            />
          </div>

          <div className="ov-block ov-wide">
            <div className="ov-title ov-title-row">
              <div>
                {mode === "lost" ? "Where we lost the cheapest spot" : "Where we took the cheapest spot"}
                <span className="ov-count">
                  {list.length === 0
                    ? "None."
                    : "Why: " + tally(list).slice(0, 5).map(([l, n]) => `${l} ×${n.toLocaleString()}`).join(" · ")}
                </span>
              </div>
              <div className="chip-toggle">
                <button className={mode === "lost" ? "active" : ""} onClick={() => setMode("lost")}>
                  Lost · {cmp.lost.length.toLocaleString()}
                </button>
                <button className={mode === "gained" ? "active" : ""} onClick={() => setMode("gained")}>
                  Gained · {cmp.gained.length.toLocaleString()}
                </button>
              </div>
            </div>
            {byVehicle.length > 0 && (
              <table className="intel-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Combos</th>
                    <th>{mode === "lost" ? "Now cheapest" : "Was cheapest"}</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((v) => (
                    <tr
                      key={`${v.first.range}||${v.first.vehicleKey}`}
                      onClick={() => setVehicle({ range: v.first.range, vehicleKey: v.first.vehicleKey })}
                    >
                      <td className="td-wrap">
                        <span className="veh-range">{v.first.range}</span>
                        {modelShort(v.first.model, v.first.range) && (
                          <span className="veh-model">{modelShort(v.first.model, v.first.range)}</span>
                        )}
                        {v.first.derivative}
                      </td>
                      <td>{v.count}</td>
                      <td className="td-wrap">
                        {v.rivals.slice(0, 2).join(", ")}
                        {v.rivals.length > 2 ? ` +${v.rivals.length - 2}` : ""}
                      </td>
                      <td className="td-wrap">
                        {v.causes.slice(0, 3).map(([l, n]) => (
                          <span key={l} className={`cause-chip ${l.startsWith("We ") ? "cause-us" : ""}`}>
                            {l} ×{n}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {byVehicle.length > 10 && (
              <button className="ov-more" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show all ${byVehicle.length}`}
              </button>
            )}
          </div>

          <div className="ov-block ov-wide">
            <div className="ov-title">
              Price moves by broker
              <span className="ov-count">On combos each broker listed in both runs. Avg is £/mo per move.</span>
            </div>
            <table className="intel-table">
              <thead>
                <tr>
                  <th>Broker / Dealer</th>
                  <th>In both</th>
                  <th>Cut</th>
                  <th>Raised</th>
                  <th>New listings</th>
                  <th>Withdrawn</th>
                </tr>
              </thead>
              <tbody className="no-click">
                {cmp.brokers.map((b) => (
                  <tr key={b.broker} className={b.isTF ? "tr-tf-row" : ""}>
                    <td className="td-wrap" style={{ fontWeight: b.isTF ? 600 : 400, color: b.isTF ? "var(--accent)" : undefined }}>
                      {b.broker}
                      {b.isTF ? " ★" : ""}
                    </td>
                    <td>{b.matched.toLocaleString()}</td>
                    <td>
                      {b.cuts > 0 ? (
                        <>
                          <span className="td-gap-neg">{b.cuts.toLocaleString()}</span>
                          <span className="veh-model">avg −£{b.avgCut!.toFixed(2)}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td>
                      {b.rises > 0 ? (
                        <>
                          <span className="td-gap-pos">{b.rises.toLocaleString()}</span>
                          <span className="veh-model">avg +£{b.avgRise!.toFixed(2)}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td>{b.added ? b.added.toLocaleString() : "—"}</td>
                    <td>{b.withdrawn ? b.withdrawn.toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(cmp.onlyBefore > 0 || cmp.onlyAfter > 0) && (
            <div className="dd-hint">
              Not compared: {cmp.onlyBefore.toLocaleString()} combos only in the earlier run and{" "}
              {cmp.onlyAfter.toLocaleString()} only in the later one (different search coverage, or
              nobody listing them).
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ value, label, sub, color }: { value: string; label: string; sub?: string; color?: string }) {
  return (
    <div className="intel-sum-card">
      <div className="intel-sum-val" style={color ? { color } : undefined}>{value}</div>
      <div className="intel-sum-lbl">{label}</div>
      {sub && <div className="intel-sum-sub">{sub}</div>}
    </div>
  );
}

// One vehicle, both runs side by side: every term × mileage, our price and
// the cheapest rival's, before → after. Click a cell for every broker.
function VehicleChange({
  pairs,
  onBack,
}: {
  pairs: Array<{ before: Slot; after: Slot }>;
  onBack: () => void;
}) {
  const profiles = useMemo(
    () => [...new Set(pairs.map((p) => `${p.after.finance}||${p.after.upfront}`))].sort(),
    [pairs]
  );
  const [profile, setProfile] = useState(profiles[0] ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const inProfile = pairs.filter((p) => `${p.after.finance}||${p.after.upfront}` === profile);
  const afters = inProfile.map((p) => p.after);
  const terms = distinctNumeric(afters, (s) => s.term);
  const mileages = distinctNumeric(afters, (s) => s.mileage);
  const cell = new Map(inProfile.map((p) => [`${p.after.term}||${p.after.mileage}`, p]));
  const sel = inProfile.find((p) => p.after.key === selected) ?? null;
  const first = pairs[0]?.after;
  if (!first) return null;

  const money = (v: number | undefined) => (v === undefined ? "—" : `£${v.toFixed(0)}`);

  return (
    <>
      <div className="intel-drill-header" style={{ padding: 0, margin: "8px 0 16px" }}>
        <button className="intel-back" onClick={onBack}>← Back</button>
        <div>
          <div className="veh-range">
            Ford {first.range}
            {modelShort(first.model, first.range) ? ` · ${modelShort(first.model, first.range)}` : ""}
          </div>
          <div className="intel-drill-title">{first.derivative}</div>
        </div>
        {profiles.length > 1 && (
          <div className="drill-filters">
            <select value={profile} onChange={(e) => { setProfile(e.target.value); setSelected(null); }}>
              {profiles.map((p) => <option key={p} value={p}>{p.replace("||", " · ")} months upfront</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="intel-table dd-grid" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Term \ Mileage</th>
              {mileages.map((m) => <th key={m} style={{ textAlign: "center" }}>{milesLabel(m)}/yr</th>)}
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t}>
                <td className="td-our-price">{t}mo</td>
                {mileages.map((m) => {
                  const p = cell.get(`${t}||${m}`);
                  if (!p) return <td key={m} style={{ textAlign: "center", color: "var(--text3)" }}>—</td>;
                  const { before: b, after: a } = p;
                  const wasLead = !!b.tf && !!b.best && b.rank === 1;
                  const isLead = !!a.tf && !!a.best && a.rank === 1;
                  const status =
                    b.tf && b.best && a.tf && a.best && wasLead !== isLead
                      ? isLead ? "gained" : "lost"
                      : null;
                  return (
                    <td
                      key={m}
                      className={[
                        status === "lost" ? "vc-lost" : status === "gained" ? "vc-gained" : "",
                        a.key === selected ? "dd-cell-selected" : "",
                      ].join(" ")}
                      style={{ textAlign: "center", cursor: "pointer" }}
                      onClick={() => setSelected(a.key)}
                    >
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>
                        {money(b.tf?.monthly)} → {money(a.tf?.monthly)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>
                        Rival {money(b.best?.monthly)} → {money(a.best?.monthly)}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600 }} className={status === "lost" ? "td-gap-pos" : status === "gained" ? "td-gap-neg" : ""}>
                        {status === "lost" ? "Lost cheapest" : status === "gained" ? "Took cheapest" : a.rank ? `#${b.rank ?? "–"} → #${a.rank}` : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel ? (
        <BrokerChange before={sel.before} after={sel.after} onClose={() => setSelected(null)} />
      ) : (
        <div className="dd-hint">Click a cell to see every broker&apos;s price in both runs.</div>
      )}
    </>
  );
}

function BrokerChange({ before, after, onClose }: { before: Slot; after: Slot; onClose: () => void }) {
  const brokers = [...new Set([...after.offers, ...before.offers].map((o) => o.broker))];
  const rows = brokers
    .map((broker) => ({
      broker,
      isTF: (after.offers.find((o) => o.broker === broker) ?? before.offers.find((o) => o.broker === broker))!.isTF,
      b: before.offers.find((o) => o.broker === broker)?.monthly ?? null,
      a: after.offers.find((o) => o.broker === broker)?.monthly ?? null,
    }))
    .sort((x, y) => (x.a ?? Infinity) - (y.a ?? Infinity) || (x.b ?? Infinity) - (y.b ?? Infinity));
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="deepdive-section-label" style={{ margin: 0 }}>
          {after.term}mo · {milesLabel(after.mileage)}/yr
          {after.upfront ? ` · ${after.upfront} months upfront` : ""} · {after.finance}
        </div>
        <button className="intel-back" onClick={onClose}>✕ Close</button>
      </div>
      <table className="deepdive-slot-table">
        <thead>
          <tr>
            <th>Broker / Dealer</th>
            <th>Before</th>
            <th>Now</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.a !== null && r.b !== null ? r.a - r.b : null;
            return (
                <tr key={r.broker} style={{ background: r.isTF ? "rgba(37,99,235,0.05)" : undefined }}>
                  <td style={{ fontWeight: r.isTF ? 600 : 400, color: r.isTF ? "var(--accent)" : undefined }}>
                    {r.broker}{r.isTF ? " ★" : ""}
                  </td>
                  <td>{r.b !== null ? `£${r.b.toFixed(2)}` : <span style={{ color: "var(--text3)" }}>not listed</span>}</td>
                  <td style={{ fontWeight: 600 }}>{r.a !== null ? `£${r.a.toFixed(2)}` : <span style={{ color: "var(--text3)", fontWeight: 400 }}>withdrawn</span>}</td>
                  <td className={d === null ? "" : d < -0.005 ? "td-gap-neg" : d > 0.005 ? "td-gap-pos" : ""}>
                    {d === null ? (r.b === null ? "new" : "—") : Math.abs(d) <= 0.005 ? "no change" : `${d > 0 ? "+" : "−"}£${Math.abs(d).toFixed(2)}`}
                  </td>
                </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

