"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import {
  buildSlots,
  competitorTable,
  dedupeListings,
  distinctNumeric,
  groupBy,
  summarise,
  vehicleTable,
  type GapSummary,
  type Listing,
  type Segment,
  type Slot,
} from "@/lib/market-slots";
import {
  badgeText,
  gapCellClass,
  gapClass,
  gapColor,
  gapStr,
  hmClass,
  milesLabel,
  modelShort,
  pct,
} from "../intel-lib";

interface Run {
  id: string;
  label?: string | null;
  startedAt: string;
  totalResults: number;
}

interface IntelligencePanelProps {
  activeRunId?: string;
  onSelectRun: (runId: string | undefined) => void;
}

const SEGMENTS: Array<{ id: Segment; label: string }> = [
  { id: "car", label: "Cars" },
  { id: "van", label: "Vans" },
];

export function IntelligencePanel({ activeRunId, onSelectRun }: IntelligencePanelProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [results, setResults] = useState<Listing[]>([]);
  const [loadedRunId, setLoadedRunId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<string>("");
  const [segment, setSegment] = useState<Segment>("car");
  const [financeFilter, setFinanceFilter] = useState<string>("");
  const [drillRange, setDrillRange] = useState<string | null>(null);
  const [deepVehicle, setDeepVehicle] = useState<string | null>(null);
  const [drillTermFilter, setDrillTermFilter] = useState<string>("");
  const [drillMileageFilter, setDrillMileageFilter] = useState<string>("");

  useEffect(() => {
    fetch("/api/scraper/runs")
      .then((r) => r.json())
      .then((data: Run[]) => {
        const filtered = data.filter((r) => r.totalResults > 0);
        setRuns(filtered);
        if (!activeRunId && filtered.length > 0) onSelectRun(filtered[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeRunId || activeRunId === loadedRunId) return;
    setLoading(true);
    setLoadProgress("");
    setResults([]);
    (async () => {
      const PER_PAGE = 10000;
      // First page tells us how many pages exist
      const firstRes = await fetch(
        `/api/scraper/results?runId=${activeRunId}&slim=true&page=1&per_page=${PER_PAGE}`
      );
      if (!firstRes.ok) {
        setLoading(false);
        return;
      }
      const first = (await firstRes.json()) as {
        results: Listing[];
        total: number;
        pages: number;
      };
      const all: Listing[] = [...first.results];
      setLoadProgress(
        `${all.length.toLocaleString()} / ${first.total.toLocaleString()}`
      );

      // Remaining pages in parallel
      if (first.pages > 1) {
        const remaining = await Promise.all(
          Array.from({ length: first.pages - 1 }, (_, i) =>
            fetch(
              `/api/scraper/results?runId=${activeRunId}&slim=true&page=${i + 2}&per_page=${PER_PAGE}`
            ).then((r) =>
              r.ok ? (r.json() as Promise<{ results: Listing[] }>) : { results: [] }
            )
          )
        );
        for (const r of remaining) all.push(...(r.results || []));
      }

      setResults(all);
      setLoadedRunId(activeRunId);
      // Open on a segment the run actually has.
      setSegment(all.some((r) => r.segment !== "van") ? "car" : "van");
      setFinanceFilter("");
      setDrillRange(null);
      setDeepVehicle(null);
      setLoading(false);
      setLoadProgress("");
    })();
  }, [activeRunId, loadedRunId]);

  // Everything downstream is built from slots: one exact vehicle on one exact
  // payment profile, one offer per broker. See lib/market-slots.ts for why.
  const { unique, removed } = useMemo(() => {
    const d = dedupeListings(results);
    return { unique: d.rows, removed: d.removed };
  }, [results]);
  const allSlots = useMemo(() => buildSlots(unique), [unique]);

  const segmentCounts = useMemo(() => {
    const c: Record<Segment, number> = { car: 0, van: 0 };
    for (const s of allSlots) c[s.segment]++;
    return c;
  }, [allSlots]);

  const segmentSlots = useMemo(
    () => allSlots.filter((s) => s.segment === segment),
    [allSlots, segment]
  );

  // Within a segment the finance type is usually fixed by the search URL
  // (cars Personal, vans Business), so the filter only appears when there is
  // something to choose between.
  const financeTypes = useMemo(
    () => [...new Set(segmentSlots.map((s) => s.finance).filter(Boolean))].sort(),
    [segmentSlots]
  );

  const slots = useMemo(
    () =>
      financeFilter
        ? segmentSlots.filter((s) => s.finance === financeFilter)
        : segmentSlots,
    [segmentSlots, financeFilter]
  );

  const terms = useMemo(() => distinctNumeric(slots, (s) => s.term), [slots]);
  const byRange = useMemo(() => groupBy(slots, (s) => s.range), [slots]);
  const ranges = useMemo(() => [...byRange.keys()].sort(), [byRange]);
  const overall = useMemo(() => summarise(slots), [slots]);
  const marketSlots = useMemo(() => slots.filter((s) => s.best).length, [slots]);

  const selectedRun = runs.find((r) => r.id === activeRunId);
  const subtitle = selectedRun
    ? `${selectedRun.label || "Unlabelled"} · ${selectedRun.startedAt.slice(0, 19).replace("T", " ")} · ${unique.length.toLocaleString()} listings` +
      (removed > 0 ? ` (${removed.toLocaleString()} repeats removed)` : "")
    : "Load a run to see analysis";

  const changeSegment = (s: Segment) => {
    setSegment(s);
    setFinanceFilter("");
    setDrillRange(null);
    setDeepVehicle(null);
  };

  const openRange = (range: string) => {
    setDrillRange(range);
    setDeepVehicle(null);
    setDrillTermFilter("");
    setDrillMileageFilter("");
  };

  return (
    <>
      {/* Toolbar */}
      <div className="intel-toolbar">
        <div>
          <div className="intel-title">TrustFord Competitive Intelligence</div>
          <div className="intel-subtitle">
            {loading
              ? loadProgress
                ? `Loading ${loadProgress}…`
                : "Loading…"
              : subtitle}
          </div>
        </div>
        <div className="intel-toolbar-right">
          {results.length > 0 && (
            <div className="seg-toggle" role="tablist">
              {SEGMENTS.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={segment === s.id}
                  className={segment === s.id ? "active" : ""}
                  disabled={segmentCounts[s.id] === 0}
                  onClick={() => changeSegment(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <select
            value={activeRunId || ""}
            onChange={(e) => onSelectRun(e.target.value || undefined)}
          >
            <option value="">— Select run —</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {(r.label || "Unlabelled")} — {r.startedAt.slice(0, 10)} (
                {r.totalResults.toLocaleString()} listings)
              </option>
            ))}
          </select>
          {financeTypes.length > 1 && (
            <select
              value={financeFilter}
              onChange={(e) => setFinanceFilter(e.target.value)}
            >
              <option value="">All Finance Types</option>
              {financeTypes.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {results.length > 0 && !drillRange && (
        <div className="intel-summary">
          <SumCard
            value={overall.gap !== null ? gapStr(overall.gap) + "/mo" : "—"}
            label="Avg Gap vs Cheapest"
            color={gapColor(overall.gap)}
          />
          <SumCard
            value={pct(overall.cheapest, overall.compared)}
            label="We're Cheapest"
            sub={`${overall.cheapest.toLocaleString()} of ${overall.compared.toLocaleString()} combos`}
          />
          <SumCard
            value={pct(overall.compared, marketSlots)}
            label="Coverage"
            sub={`priced on ${overall.compared.toLocaleString()} of ${marketSlots.toLocaleString()} market combos`}
          />
          <SumCard
            value={overall.tfAvg !== null ? "£" + overall.tfAvg.toFixed(0) : "—"}
            label="Our Avg Monthly"
          />
          <SumCard
            value={overall.mktAvg !== null ? "£" + overall.mktAvg.toFixed(0) : "—"}
            label="Cheapest Rival Avg"
          />
        </div>
      )}

      <div className="intel-scroll">
        {results.length === 0 && !loading && (
          <div className="empty-state">
            {runs.length === 0
              ? "No runs yet. Run a scrape from the desktop RateX app — it'll auto-upload here."
              : "Select a run above to see intelligence."}
          </div>
        )}

        {/* Overview */}
        {!drillRange && results.length > 0 && (
          <>
            <div className="intel-range-grid">
              {ranges.map((range) => (
                <RangeCard
                  key={range}
                  range={range}
                  slots={byRange.get(range)!}
                  terms={terms}
                  onClick={() => openRange(range)}
                />
              ))}
            </div>
            <div className="overview-split">
              <BehindList
                slots={slots}
                onOpen={(range, vehicleKey) => {
                  openRange(range);
                  setDeepVehicle(vehicleKey);
                }}
              />
              <CompetitorList slots={slots} />
            </div>
          </>
        )}

        {/* Drilldown */}
        {drillRange && !deepVehicle && (
          <DrilldownView
            range={drillRange}
            segment={segment}
            slots={byRange.get(drillRange) ?? []}
            terms={terms}
            termFilter={drillTermFilter}
            mileageFilter={drillMileageFilter}
            onTermChange={setDrillTermFilter}
            onMileageChange={setDrillMileageFilter}
            onBack={() => setDrillRange(null)}
            onDeepDive={(v) => setDeepVehicle(v)}
          />
        )}

        {/* Deep dive */}
        {drillRange && deepVehicle && (
          <DeepDiveView
            key={`${segment}||${financeFilter}||${drillRange}||${deepVehicle}`}
            range={drillRange}
            slots={(byRange.get(drillRange) ?? []).filter(
              (s) => s.vehicleKey === deepVehicle
            )}
            onBack={() => setDeepVehicle(null)}
          />
        )}
      </div>
    </>
  );
}

function SumCard({
  value,
  label,
  sub,
  color,
}: {
  value: string;
  label: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="intel-sum-card">
      <div className="intel-sum-val" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="intel-sum-lbl">{label}</div>
      {sub && <div className="intel-sum-sub">{sub}</div>}
    </div>
  );
}

function VehicleLabel({ slot, range }: { slot: Pick<Slot, "model" | "derivative">; range: string }) {
  const m = modelShort(slot.model, range);
  return (
    <>
      {m && <span className="veh-model">{m}</span>}
      {slot.derivative}
    </>
  );
}

function RangeCard({
  range,
  slots,
  terms,
  onClick,
}: {
  range: string;
  slots: Slot[];
  terms: string[];
  onClick: () => void;
}) {
  const s = useMemo(() => summarise(slots), [slots]);
  const byTerm = useMemo(() => groupBy(slots, (x) => x.term), [slots]);
  const sc = gapClass(s.gap);
  const badgeClassName =
    sc === "leading"
      ? "badge-leading"
      : sc === "close"
        ? "badge-close"
        : sc === "behind"
          ? "badge-behind"
          : "badge-none";

  return (
    <div className={`range-card ${sc}`} onClick={onClick}>
      <div className="range-card-header">
        <div className="range-name">{range}</div>
        <div className={`range-badge ${badgeClassName}`}>{badgeText(sc)}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        {terms.map((t) => (
          <TermRow key={t} label={`${t} mo`} t={summarise(byTerm.get(t) ?? [])} />
        ))}
      </div>
      <div className="range-footer">
        <div className="range-stat">
          Overall avg gap:{" "}
          <span style={{ color: gapColor(s.gap), fontWeight: 600 }}>
            {gapStr(s.gap)}/mo
          </span>{" "}
          · cheapest on {s.cheapest}/{s.compared}
        </div>
        <div className="range-drill-hint">Click to drill down →</div>
      </div>
    </div>
  );
}

function TermRow({ label, t }: { label: string; t: GapSummary }) {
  if (t.gap === null) {
    return (
      <div className="rc-term-row">
        <span>{label}</span>
        <span style={{ color: "var(--text3)" }}>—</span>
      </div>
    );
  }
  return (
    <div className="rc-term-row">
      <span>{label}</span>
      <span style={{ color: "var(--text3)", fontSize: 10 }}>
        TF £{t.tfAvg!.toFixed(0)} · Mkt £{t.mktAvg!.toFixed(0)}
      </span>
      <span style={{ color: gapColor(t.gap), fontWeight: 600 }}>
        {gapStr(t.gap)}
      </span>
    </div>
  );
}

// The vehicles we are furthest behind on, across every range in view. The
// range cards say WHERE overall; this says WHICH vehicle, so the first thing
// to reprice is one click away instead of three.
function BehindList({
  slots,
  onOpen,
}: {
  slots: Slot[];
  onOpen: (range: string, vehicleKey: string) => void;
}) {
  const rows = useMemo(
    () =>
      vehicleTable(slots)
        .filter((v) => v.summary.gap !== null && v.summary.gap > 0)
        .sort((a, b) => b.summary.gap! - a.summary.gap!),
    [slots]
  );
  const shown = rows.slice(0, 12);

  return (
    <div className="ov-block">
      <div className="ov-title">
        Furthest behind
        <span className="ov-count">{rows.length} vehicle{rows.length === 1 ? "" : "s"} dearer than the cheapest rival on average</span>
      </div>
      {shown.length === 0 ? (
        <div className="ov-empty">Not behind on any vehicle in view.</div>
      ) : (
        <table className="intel-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Avg gap</th>
              <th>Cheapest on</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={`${v.range}||${v.vehicleKey}`} onClick={() => onOpen(v.range, v.vehicleKey)}>
                <td className="td-wrap">
                  <span className="veh-range">{v.range}</span>
                  <VehicleLabel slot={v} range={v.range} />
                </td>
                <td className={gapCellClass(v.summary.gap)}>{gapStr(v.summary.gap)}</td>
                <td>
                  {v.summary.cheapest}/{v.summary.compared}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CompetitorList({ slots }: { slots: Slot[] }) {
  const rows = useMemo(() => competitorTable(slots), [slots]);
  return (
    <div className="ov-block">
      <div className="ov-title">
        Who undercuts us
        <span className="ov-count">on combos where we both list</span>
      </div>
      {rows.length === 0 ? (
        <div className="ov-empty">No head-to-head combos in view.</div>
      ) : (
        <table className="intel-table">
          <thead>
            <tr>
              <th>Broker / Dealer</th>
              <th>Cheaper than us</th>
              <th>By (avg)</th>
            </tr>
          </thead>
          <tbody className="no-click">
            {rows.map((r) => (
              <tr key={r.broker}>
                <td className="td-wrap">
                  {r.broker}
                  {r.category && <span className="veh-model">{r.category}</span>}
                </td>
                <td>
                  <div className="undercut-cell">
                    <span>
                      {r.undercuts.toLocaleString()} of {r.headToHead.toLocaleString()}
                    </span>
                    <span className="undercut-bar">
                      <span style={{ width: pct(r.undercuts, r.headToHead) }} />
                    </span>
                  </div>
                </td>
                <td className={r.avgUndercut !== null ? "td-gap-pos" : ""}>
                  {r.avgUndercut !== null ? `£${r.avgUndercut.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DrilldownView({
  range,
  segment,
  slots,
  terms,
  termFilter,
  mileageFilter,
  onTermChange,
  onMileageChange,
  onBack,
  onDeepDive,
}: {
  range: string;
  segment: Segment;
  slots: Slot[];
  terms: string[];
  termFilter: string;
  mileageFilter: string;
  onTermChange: (v: string) => void;
  onMileageChange: (v: string) => void;
  onBack: () => void;
  onDeepDive: (vehicleKey: string) => void;
}) {
  const [sortBy, setSortBy] = useState<"vehicle" | "gap">("vehicle");

  const mileages = useMemo(() => distinctNumeric(slots, (s) => s.mileage), [slots]);

  const filtered = useMemo(
    () =>
      slots.filter(
        (s) =>
          (!termFilter || s.term === termFilter) &&
          (!mileageFilter || s.mileage === mileageFilter)
      ),
    [slots, termFilter, mileageFilter]
  );

  const vehicles = useMemo(() => {
    const byVehicle = groupBy(filtered, (s) => s.vehicleKey);
    const rows = vehicleTable(filtered).map((v) => ({
      ...v,
      byTerm: groupBy(byVehicle.get(v.vehicleKey) ?? [], (s) => s.term),
    }));
    return rows.sort((a, b) =>
      sortBy === "gap"
        ? (b.summary.gap ?? -Infinity) - (a.summary.gap ?? -Infinity)
        : a.model.localeCompare(b.model) || a.derivative.localeCompare(b.derivative)
    );
  }, [filtered, sortBy]);

  const missing = vehicles.filter((v) => !v.tfListed);
  const byTerm = useMemo(() => groupBy(filtered, (s) => s.term), [filtered]);
  const byMileage = useMemo(() => groupBy(filtered, (s) => s.mileage), [filtered]);
  // Vans come in several wheelbases/weights per range; a header per model
  // keeps an L1 and an L2 of the same derivative from reading as a repeat.
  const showModelHeaders =
    sortBy === "vehicle" && new Set(vehicles.map((v) => v.model)).size > 1;

  return (
    <>
      <div className="intel-drill-header" style={{ padding: 0, marginBottom: 16 }}>
        <button className="intel-back" onClick={onBack}>
          ← All ranges
        </button>
        <div className="intel-drill-title">
          Ford {range}
          <span className="drill-seg">{segment === "van" ? "Vans" : "Cars"}</span>
        </div>
        <div className="drill-filters">
          <select value={termFilter} onChange={(e) => onTermChange(e.target.value)}>
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t} value={t}>{t} months</option>
            ))}
          </select>
          <select
            value={mileageFilter}
            onChange={(e) => onMileageChange(e.target.value)}
          >
            <option value="">All mileages</option>
            {mileages.map((m) => (
              <option key={m} value={m}>
                {milesLabel(m)}/yr
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "vehicle" | "gap")}
          >
            <option value="vehicle">Sort by vehicle</option>
            <option value="gap">Furthest behind first</option>
          </select>
        </div>
      </div>

      {missing.length > 0 && (
        // Collapsed when long: a van range can have dozens, and an open list
        // pushes the comparison itself below the fold.
        <details className="missing-banner" style={{ margin: "0 0 16px" }} open={missing.length <= 8}>
          <summary className="missing-banner-title">
            ⚠ Not advertising on {missing.length} vehicle
            {missing.length > 1 ? "s" : ""}
          </summary>
          <div className="missing-chips">
            {missing.map((v) => (
              <span key={v.vehicleKey} className="missing-chip">
                <VehicleLabel slot={v} range={range} />
              </span>
            ))}
          </div>
        </details>
      )}

      <div className="drill-heatmaps" style={{ margin: "0 0 20px" }}>
        <div className="heatmap-block">
          <div className="heatmap-title">By Contract Length</div>
          <div className="heatmap-row">
            {terms.map((term) => {
              const s = summarise(byTerm.get(term) ?? []);
              return (
                <div key={term} className={`heatmap-cell ${hmClass(s.gap)}`}>
                  <div className="heatmap-cell-label">{term}mo</div>
                  <div className="heatmap-cell-score">{gapStr(s.gap)}</div>
                  <div className="heatmap-cell-slots">{s.compared} combos</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="heatmap-block">
          <div className="heatmap-title">By Annual Mileage</div>
          <div className="heatmap-row">
            {mileages.map((mil) => {
              const s = summarise(byMileage.get(mil) ?? []);
              return (
                <div key={mil} className={`heatmap-cell ${hmClass(s.gap)}`}>
                  <div className="heatmap-cell-label">{milesLabel(mil)}/yr</div>
                  <div className="heatmap-cell-score">{gapStr(s.gap)}</div>
                  <div className="heatmap-cell-slots">{s.compared} combos</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="intel-drill-wrap" style={{ margin: 0 }}>
        <table className="intel-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              {terms.map((t) => (
                <th key={t}>{t} months</th>
              ))}
              <th>Overall Gap</th>
              <th>Cheapest on</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v, i) => {
              const header =
                showModelHeaders && (i === 0 || vehicles[i - 1].model !== v.model);
              return (
                <Fragment key={v.vehicleKey}>
                  {header && (
                    <tr className="model-group-row">
                      <td colSpan={terms.length + 3}>
                        {modelShort(v.model, range) || v.model}
                      </td>
                    </tr>
                  )}
                  <tr onClick={() => onDeepDive(v.vehicleKey)}>
                    <td className={v.tfListed ? "" : "td-missing"}>
                      {showModelHeaders ? v.derivative : <VehicleLabel slot={v} range={range} />}
                    </td>
                    {terms.map((t) => {
                      const s = summarise(v.byTerm.get(t) ?? []);
                      return (
                        <td key={t}>
                          {s.gap === null ? (
                            <span style={{ color: "var(--text3)" }}>—</span>
                          ) : (
                            <span className={gapCellClass(s.gap)}>{gapStr(s.gap)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={gapCellClass(v.summary.gap)}>{gapStr(v.summary.gap)}</td>
                    <td>
                      {v.summary.compared > 0
                        ? `${v.summary.cheapest}/${v.summary.compared}`
                        : "—"}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DeepDiveView({
  range,
  slots,
  onBack,
}: {
  range: string;
  slots: Slot[];
  onBack: () => void;
}) {
  // A grid cell is term × mileage, so it has to sit inside one finance type
  // and one upfront — otherwise a cell would hold two slots again.
  const profiles = useMemo(
    () =>
      [...new Set(slots.map((s) => `${s.finance}||${s.upfront}`))].sort(),
    [slots]
  );
  const [profile, setProfile] = useState<string>(profiles[0] ?? "");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const inProfile = useMemo(
    () => slots.filter((s) => `${s.finance}||${s.upfront}` === profile),
    [slots, profile]
  );
  const terms = useMemo(() => distinctNumeric(inProfile, (s) => s.term), [inProfile]);
  const mileages = useMemo(() => distinctNumeric(inProfile, (s) => s.mileage), [inProfile]);
  const cell = useMemo(
    () => new Map(inProfile.map((s) => [`${s.term}||${s.mileage}`, s])),
    [inProfile]
  );
  const selected = inProfile.find((s) => s.key === selectedKey) ?? null;
  const first = slots[0];
  const profileLabel = (p: string) => {
    const [finance, upfront] = p.split("||");
    return [finance, upfront ? `${upfront} months upfront` : ""].filter(Boolean).join(" · ");
  };

  if (!first) {
    return (
      <div className="empty-state">
        Nothing to show for this vehicle.{" "}
        <button className="intel-back" onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <>
      <div className="intel-drill-header" style={{ padding: 0, marginBottom: 16 }}>
        <button className="intel-back" onClick={onBack}>
          ← Back to vehicles
        </button>
        <div>
          <div className="veh-range">
            Ford {range}
            {modelShort(first.model, range) ? ` · ${modelShort(first.model, range)}` : ""}
          </div>
          <div className="intel-drill-title">{first.derivative}</div>
          <div className="intel-subtitle">{profileLabel(profile)}</div>
        </div>
        {profiles.length > 1 && (
          <div className="drill-filters">
            <select
              value={profile}
              onChange={(e) => {
                setProfile(e.target.value);
                setSelectedKey(null);
              }}
            >
              {profiles.map((p) => (
                <option key={p} value={p}>{profileLabel(p)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="intel-table dd-grid" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Term \ Mileage</th>
              {mileages.map((m) => (
                <th key={m} style={{ textAlign: "center" }}>
                  {milesLabel(m)}/yr
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t}>
                <td className="td-our-price">{t}mo</td>
                {mileages.map((m) => {
                  const s = cell.get(`${t}||${m}`);
                  const bg =
                    !s || s.gap === null
                      ? "transparent"
                      : s.gap <= 0
                        ? "rgba(22,163,74,0.08)"
                        : s.gap <= 20
                          ? "rgba(217,119,6,0.08)"
                          : "rgba(220,38,38,0.07)";
                  const isSel = s && s.key === selectedKey;
                  return (
                    <td
                      key={`${t}-${m}`}
                      className={isSel ? "dd-cell-selected" : undefined}
                      style={{
                        textAlign: "center",
                        background: bg,
                        cursor: s ? "pointer" : "default",
                      }}
                      onClick={() => s && setSelectedKey(s.key)}
                    >
                      {!s ? (
                        <span style={{ color: "var(--text3)" }}>—</span>
                      ) : !s.tf ? (
                        <>
                          <div style={{ color: "var(--text3)" }}>Not listed</div>
                          {s.best && (
                            <div style={{ fontSize: 10, color: "var(--text3)" }}>
                              Mkt £{s.best.monthly.toFixed(0)}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600, color: "var(--text)" }}>
                            £{s.tf.monthly.toFixed(0)}
                          </div>
                          <div style={{ fontSize: 10, color: gapColor(s.gap), fontWeight: 600 }}>
                            {s.gap !== null ? gapStr(s.gap) : "no rivals"}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text3)" }}>
                            #{s.rank} of {s.sellers}
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <BrokerPanel slot={selected} onClose={() => setSelectedKey(null)} />
      ) : (
        <div className="dd-hint">Click a cell to see every broker on that exact profile.</div>
      )}
    </>
  );
}

function BrokerPanel({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const cheapest = slot.offers[0]?.monthly ?? null;
  const n = slot.offers.length;

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div className="deepdive-section-label" style={{ margin: 0 }}>
          {slot.term}mo · {milesLabel(slot.mileage)}/yr
          {slot.upfront ? ` · ${slot.upfront} months upfront` : ""}
          {slot.finance ? ` · ${slot.finance}` : ""} · {n} broker{n === 1 ? "" : "s"}
        </div>
        <button className="intel-back" onClick={onClose}>
          ✕ Close
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="deepdive-slot-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Broker / Dealer</th>
              <th>Type</th>
              <th>Monthly</th>
              <th>vs Cheapest</th>
              <th>Initial Rental</th>
              <th>Total Cost</th>
              <th>In Stock</th>
            </tr>
          </thead>
          <tbody>
            {slot.offers.map((o, i) => {
              const diff = cheapest !== null ? o.monthly - cheapest : null;
              return (
                <tr
                  key={o.broker}
                  style={{ background: o.isTF ? "rgba(37,99,235,0.05)" : undefined }}
                >
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: o.isTF ? 600 : 400, color: o.isTF ? "var(--accent)" : undefined }}>
                    {o.broker}
                    {o.isTF ? " ★" : ""}
                    {o.listings > 1 && (
                      <span
                        className="other-listings"
                        title="This broker lists this exact vehicle and profile more than once. The cheapest is shown."
                      >
                        cheapest of {o.listings}
                      </span>
                    )}
                  </td>
                  <td>{o.category || "—"}</td>
                  <td style={{ fontWeight: 600 }}>£{o.monthly.toFixed(2)}</td>
                  <td className={diff ? "td-gap-pos" : ""}>
                    {!diff ? "—" : "+£" + diff.toFixed(2)}
                  </td>
                  <td>{o.initial !== null ? "£" + o.initial.toFixed(2) : "—"}</td>
                  <td>{o.total !== null ? "£" + o.total.toFixed(0) : "—"}</td>
                  <td>{o.inStock || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
