"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import {
  buildHeadlines,
  buildSlots,
  competitorTable,
  dedupeListings,
  distinctNumeric,
  groupBy,
  summarise,
  summariseHeadlines,
  vehicleTable,
  type GapSummary,
  type Headline,
  type HeadlineSummary,
  type Listing,
  type Segment,
  type Slot,
} from "@/lib/market-slots";
import { loadRun } from "../run-cache";
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
      let all: Listing[];
      try {
        all = await loadRun(activeRunId, (loaded, total) =>
          setLoadProgress(`${loaded.toLocaleString()} / ${total.toLocaleString()}`)
        );
      } catch {
        setLoading(false);
        return;
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
  const headlines = useMemo(() => buildHeadlines(slots), [slots]);
  const headlineOverall = useMemo(() => summariseHeadlines(headlines), [headlines]);
  const headlinesByRange = useMemo(() => groupBy(headlines, (h) => h.range), [headlines]);
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
            value={pct(headlineOverall.lowest, headlineOverall.compared)}
            label="Lowest Headline"
            sub={`beaten on ${headlineOverall.crossTerm.toLocaleString()} where our best price wins its term`}
            color={headlineOverall.crossTerm > 0 ? "#d97706" : undefined}
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
                  headline={summariseHeadlines(headlinesByRange.get(range) ?? [])}
                  terms={terms}
                  onClick={() => openRange(range)}
                />
              ))}
            </div>
            <HeadlineLosses
              headlines={headlines}
              onOpen={(range, vehicleKey) => {
                openRange(range);
                setDeepVehicle(vehicleKey);
              }}
            />
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
            headlines={headlinesByRange.get(drillRange) ?? []}
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
            headlines={(headlinesByRange.get(drillRange) ?? []).filter(
              (h) => h.vehicleKey === deepVehicle
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
  headline,
  terms,
  onClick,
}: {
  range: string;
  slots: Slot[];
  headline: HeadlineSummary;
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
        <HeadlineRow h={headline} />
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

// Our cheapest at any term against the cheapest rival at any term, per
// vehicle and mileage: the price a customer actually compares first. See
// buildHeadlines in lib/market-slots.ts.
function HeadlineRow({ h }: { h: HeadlineSummary }) {
  return (
    <div
      className="rc-term-row rc-headline-row"
      title="Headline: our cheapest monthly at any term vs the cheapest any rival offers at any term, per vehicle and mileage. Off-term: our best price wins its own term but a rival's price on another term is lower."
    >
      <span>Headline</span>
      {h.gap === null ? (
        <span style={{ color: "var(--text3)" }}>—</span>
      ) : (
        <>
          <span style={{ color: "var(--text3)", fontSize: 10 }}>
            lowest {h.lowest}/{h.compared}
            {h.crossTerm > 0 && <span className="hl-warn"> · {h.crossTerm} off-term</span>}
          </span>
          <span style={{ color: gapColor(h.gap), fontWeight: 600 }}>{gapStr(h.gap)}</span>
        </>
      )}
    </div>
  );
}

function ShowMore({ total, shown, open, onToggle }: { total: number; shown: number; open: boolean; onToggle: () => void }) {
  if (total <= shown && !open) return null;
  return (
    <button className="ov-more" onClick={onToggle}>
      {open ? "Show fewer" : `Show all ${total.toLocaleString()}`}
    </button>
  );
}

function mileageList(ms: string[]): string {
  const labels = ms.map((m) => milesLabel(m));
  return labels.length <= 4 ? labels.join(", ") : `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
}

// The insight the term-by-term views can't show: our best price wins its own
// term, and a rival is still cheaper on a different term — very cheap on two
// years, say, below our three- and four-year prices. A customer sees their
// headline first, so winning 36 and 48 like-for-like doesn't win the enquiry.
function HeadlineLosses({
  headlines,
  onOpen,
}: {
  headlines: Headline[];
  onOpen: (range: string, vehicleKey: string) => void;
}) {
  const [mode, setMode] = useState<"cross" | "all">("cross");
  const [showAll, setShowAll] = useState(false);

  const groups = useMemo(() => {
    const pick = headlines.filter((h) => (mode === "cross" ? h.crossTerm : h.gap !== null && h.gap > 0));
    return [...groupBy(pick, (h) => `${h.range}||${h.vehicleKey}`).values()]
      .map((hs) => {
        const worst = hs.reduce((a, b) => (b.gap! > a.gap! ? b : a));
        return { worst, mileages: distinctMileages(hs) };
      })
      .sort((a, b) => b.worst.gap! - a.worst.gap!);
  }, [headlines, mode]);
  const counts = useMemo(
    () => ({
      cross: headlines.filter((h) => h.crossTerm).length,
      all: headlines.filter((h) => h.gap !== null && h.gap > 0).length,
    }),
    [headlines]
  );
  const shown = showAll ? groups : groups.slice(0, 8);

  return (
    <div className="ov-block ov-wide">
      <div className="ov-title ov-title-row">
        <div>
          Losing on headline price
          <span className="ov-count">
            {mode === "cross"
              ? "Our best price wins its own term, but a rival's price on another term is lower — the customer sees theirs first."
              : "A rival's cheapest monthly (any term) is below ours (any term), for the same vehicle and mileage."}
          </span>
        </div>
        <div className="chip-toggle">
          <button className={mode === "cross" ? "active" : ""} onClick={() => setMode("cross")}>
            Undercut on another term · {counts.cross}
          </button>
          <button className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>
            All headline losses · {counts.all}
          </button>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="ov-empty">
          {mode === "cross" ? "No rival undercuts our best price from another term." : "Our headline is lowest everywhere in view."}
        </div>
      ) : (
        <table className="intel-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Mileages</th>
              <th>Rival headline</th>
              <th>Our best</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ worst: h, mileages }) => (
              <tr key={h.key} onClick={() => onOpen(h.range, h.vehicleKey)}>
                <td className="td-wrap">
                  <span className="veh-range">{h.range}</span>
                  <VehicleLabel slot={h} range={h.range} />
                </td>
                <td title={mileages.map((m) => `${milesLabel(m)}/yr`).join(", ")}>{mileageList(mileages)}</td>
                <td className="td-wrap">
                  <strong className="td-our-price">£{h.rival!.monthly.toFixed(2)}</strong> · {h.rival!.term}mo
                  <span className="veh-model">{h.rival!.broker} · at {milesLabel(h.mileage)}/yr</span>
                </td>
                <td className="td-wrap">
                  £{h.tf!.monthly.toFixed(2)} · {h.tf!.term}mo
                  <span className="veh-model">
                    {h.termsWon.length > 0 ? `cheapest like-for-like on ${h.termsWon.join("/")}mo` : "not cheapest on any term"}
                  </span>
                </td>
                <td className={gapCellClass(h.gap)}>{gapStr(h.gap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ShowMore total={groups.length} shown={8} open={showAll} onToggle={() => setShowAll(!showAll)} />
    </div>
  );
}

function distinctMileages(hs: Headline[]): string[] {
  return [...new Set(hs.map((h) => h.mileage))].sort((a, b) => Number(a) - Number(b));
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
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () =>
      vehicleTable(slots)
        .filter((v) => v.summary.gap !== null && v.summary.gap > 0)
        .sort((a, b) => b.summary.gap! - a.summary.gap!),
    [slots]
  );
  const shown = showAll ? rows : rows.slice(0, 12);

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
      <ShowMore total={rows.length} shown={12} open={showAll} onToggle={() => setShowAll(!showAll)} />
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

type DrillSort = "vehicle" | "gap" | "headline";

function DrilldownView({
  range,
  segment,
  slots,
  headlines,
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
  headlines: Headline[];
  terms: string[];
  termFilter: string;
  mileageFilter: string;
  onTermChange: (v: string) => void;
  onMileageChange: (v: string) => void;
  onBack: () => void;
  onDeepDive: (vehicleKey: string) => void;
}) {
  const [sortBy, setSortBy] = useState<DrillSort>("vehicle");
  const [search, setSearch] = useState("");

  const mileages = useMemo(() => distinctNumeric(slots, (s) => s.mileage), [slots]);

  // Search matches model and derivative, every word anywhere: "320 l2 trend"
  // finds the 320 L2 Trend without caring about word order.
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (v: { model: string; derivative: string }) => {
    const text = `${v.model} ${v.derivative}`.toLowerCase();
    return words.every((w) => text.includes(w));
  };

  const filtered = useMemo(
    () =>
      slots.filter(
        (s) =>
          (!termFilter || s.term === termFilter) &&
          (!mileageFilter || s.mileage === mileageFilter)
      ),
    [slots, termFilter, mileageFilter]
  );

  // A headline is across terms by definition, so only the mileage filter
  // applies to it.
  const headlinesByVehicle = useMemo(
    () =>
      groupBy(
        headlines.filter((h) => !mileageFilter || h.mileage === mileageFilter),
        (h) => h.vehicleKey
      ),
    [headlines, mileageFilter]
  );

  const vehicles = useMemo(() => {
    const byVehicle = groupBy(filtered, (s) => s.vehicleKey);
    const rows = vehicleTable(filtered).map((v) => ({
      ...v,
      byTerm: groupBy(byVehicle.get(v.vehicleKey) ?? [], (s) => s.term),
      headline: summariseHeadlines(headlinesByVehicle.get(v.vehicleKey) ?? []),
    }));
    return rows.sort((a, b) =>
      sortBy === "gap"
        ? (b.summary.gap ?? -Infinity) - (a.summary.gap ?? -Infinity)
        : sortBy === "headline"
          ? b.headline.crossTerm - a.headline.crossTerm ||
            (b.headline.gap ?? -Infinity) - (a.headline.gap ?? -Infinity)
          : a.model.localeCompare(b.model) || a.derivative.localeCompare(b.derivative)
    );
  }, [filtered, sortBy, headlinesByVehicle]);
  const visible = words.length ? vehicles.filter(matches) : vehicles;

  const missing = vehicles.filter((v) => !v.tfListed);
  const byTerm = useMemo(() => groupBy(filtered, (s) => s.term), [filtered]);
  const byMileage = useMemo(() => groupBy(filtered, (s) => s.mileage), [filtered]);
  // Vans come in several wheelbases/weights per range; a header per model
  // keeps an L1 and an L2 of the same derivative from reading as a repeat.
  const showModelHeaders =
    sortBy === "vehicle" && new Set(visible.map((v) => v.model)).size > 1;

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
            onChange={(e) => setSortBy(e.target.value as DrillSort)}
          >
            <option value="vehicle">Sort by vehicle</option>
            <option value="gap">Furthest behind first</option>
            <option value="headline">Undercut on another term first</option>
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

      <div className="drill-search">
        <input
          type="search"
          placeholder={`Search ${vehicles.length} vehicles — e.g. "320 L2 trend"`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {words.length > 0 && (
          <span className="drill-search-count">
            {visible.length} of {vehicles.length}
          </span>
        )}
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
              <th title="Our cheapest at any term vs the cheapest rival at any term, per mileage">Headline</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr className="model-group-row">
                <td colSpan={terms.length + 4}>No vehicle matches &ldquo;{search}&rdquo;.</td>
              </tr>
            )}
            {visible.map((v, i) => {
              const header =
                showModelHeaders && (i === 0 || visible[i - 1].model !== v.model);
              return (
                <Fragment key={v.vehicleKey}>
                  {header && (
                    <tr className="model-group-row">
                      <td colSpan={terms.length + 4}>
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
                    <td
                      title={
                        v.headline.compared > 0
                          ? `Lowest headline on ${v.headline.lowest} of ${v.headline.compared} mileages` +
                            (v.headline.crossTerm > 0
                              ? `; on ${v.headline.crossTerm} our best price wins its term but a rival is cheaper on another`
                              : "")
                          : undefined
                      }
                    >
                      {v.headline.compared === 0 ? (
                        <span style={{ color: "var(--text3)" }}>—</span>
                      ) : (
                        <>
                          <span className={v.headline.lowest === v.headline.compared ? "td-gap-neg" : ""}>
                            {v.headline.lowest}/{v.headline.compared}
                          </span>
                          {v.headline.crossTerm > 0 && (
                            <span className="hl-warn"> · ⚠ {v.headline.crossTerm} off-term</span>
                          )}
                        </>
                      )}
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
  headlines,
  onBack,
}: {
  range: string;
  slots: Slot[];
  headlines: Headline[];
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
  const headlineByMileage = useMemo(
    () =>
      new Map(
        headlines
          .filter((h) => `${h.finance}||${h.upfront}` === profile)
          .map((h) => [h.mileage, h])
      ),
    [headlines, profile]
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
            {/* The headline: what the customer compares first. Clicking opens
                the brokers on the term the rival's headline comes from. */}
            <tr className="dd-headline-row">
              <td className="td-our-price">
                Headline
                <span className="veh-model">any term</span>
              </td>
              {mileages.map((m) => {
                const h = headlineByMileage.get(m);
                const rivalSlot = h?.rival ? cell.get(`${h.rival.term}||${m}`) : undefined;
                if (!h || (!h.tf && !h.rival)) return <td key={m} style={{ textAlign: "center" }}>—</td>;
                return (
                  <td
                    key={m}
                    className={[
                      h.crossTerm ? "dd-cross" : "",
                      rivalSlot && rivalSlot.key === selectedKey ? "dd-cell-selected" : "",
                    ].join(" ")}
                    style={{ textAlign: "center", cursor: rivalSlot ? "pointer" : "default" }}
                    onClick={() => rivalSlot && setSelectedKey(rivalSlot.key)}
                    title={
                      h.crossTerm
                        ? `Our best (£${h.tf!.monthly.toFixed(2)} at ${h.tf!.term}mo) wins its term, but ${h.rival!.broker} is £${h.rival!.monthly.toFixed(2)} at ${h.rival!.term}mo.`
                        : undefined
                    }
                  >
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>
                      {h.tf ? `£${h.tf.monthly.toFixed(0)} · ${h.tf.term}mo` : "Not listed"}
                    </div>
                    {h.rival && (
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>
                        Rival £{h.rival.monthly.toFixed(0)} · {h.rival.term}mo
                      </div>
                    )}
                    {h.gap !== null && (
                      <div style={{ fontSize: 10, color: gapColor(h.gap), fontWeight: 600 }}>
                        {h.crossTerm ? "⚠ " : ""}
                        {gapStr(h.gap)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {selected ? (
        <BrokerPanel slot={selected} onClose={() => setSelectedKey(null)} />
      ) : (
        <div className="dd-hint">
          Click a cell to see every broker on that exact profile. Click a headline to see the
          brokers on the term the cheapest rival price comes from.
        </div>
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
