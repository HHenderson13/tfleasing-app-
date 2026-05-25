"use client";
import { useState, useEffect, useMemo } from "react";
import {
  ScrapedResult,
  isTrustFord,
  lflAvg,
  lflByTerm,
  gapClass,
  badgeText,
  hmClass,
  gapStr,
  gapColor,
  termOf,
  mileageOf,
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

export function IntelligencePanel({ activeRunId, onSelectRun }: IntelligencePanelProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);
  const [loadedRunId, setLoadedRunId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<string>("");
  const [financeFilter, setFinanceFilter] = useState<string>("");
  const [drillRange, setDrillRange] = useState<string | null>(null);
  const [deepDeriv, setDeepDeriv] = useState<string | null>(null);
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
        results: ScrapedResult[];
        total: number;
        pages: number;
      };
      const all: ScrapedResult[] = [...first.results];
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
              r.ok ? (r.json() as Promise<{ results: ScrapedResult[] }>) : { results: [] }
            )
          )
        );
        for (const r of remaining) all.push(...(r.results || []));
      }

      setResults(all);
      setLoadedRunId(activeRunId);
      setDrillRange(null);
      setDeepDeriv(null);
      setLoading(false);
      setLoadProgress("");
    })();
  }, [activeRunId, loadedRunId]);

  const filteredRows = useMemo(
    () =>
      financeFilter
        ? results.filter((r) => r.financeType === financeFilter)
        : results,
    [results, financeFilter]
  );

  const tfRows = useMemo(
    () => filteredRows.filter((r) => isTrustFord(r.brokerDealerName)),
    [filteredRows]
  );
  const mktRows = useMemo(
    () => filteredRows.filter((r) => !isTrustFord(r.brokerDealerName)),
    [filteredRows]
  );

  const ranges = useMemo(
    () =>
      Array.from(new Set(filteredRows.map((r) => r.range).filter(Boolean))).sort() as string[],
    [filteredRows]
  );

  const overall = useMemo(() => lflAvg(tfRows, mktRows), [tfRows, mktRows]);
  const totalDerivTerms = useMemo(
    () =>
      new Set(filteredRows.map((r) => `${r.derivative}||${termOf(r)}`)).size,
    [filteredRows]
  );
  const wellPricedCount = useMemo(
    () =>
      ranges.filter((range) => {
        const s = lflAvg(
          tfRows.filter((r) => r.range === range),
          mktRows.filter((r) => r.range === range)
        );
        return s.gap !== null && s.gap <= 0;
      }).length,
    [ranges, tfRows, mktRows]
  );

  const selectedRun = runs.find((r) => r.id === activeRunId);
  const subtitle = selectedRun
    ? `${selectedRun.label || "Unlabelled"} · ${selectedRun.startedAt.slice(0, 19).replace("T", " ")} · ${results.length.toLocaleString()} listings`
    : "Load a run to see analysis";

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
          <select
            value={financeFilter}
            onChange={(e) => setFinanceFilter(e.target.value)}
          >
            <option value="">All Finance Types</option>
            <option value="Personal">Personal</option>
            <option value="Business">Business</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {results.length > 0 && !drillRange && (
        <div className="intel-summary">
          <SumCard
            value={overall.gap !== null ? gapStr(overall.gap) + "/mo" : "—"}
            label="Avg Gap vs Market"
            color={gapColor(overall.gap)}
          />
          <SumCard value={`${overall.count} / ${totalDerivTerms}`} label="Deriv/Term Combos" />
          <SumCard value={String(wellPricedCount)} label="Ranges We Lead" />
          <SumCard
            value={overall.tfAvg !== null ? "£" + overall.tfAvg.toFixed(0) : "—"}
            label="Our Avg Monthly"
          />
          <SumCard
            value={overall.mktAvg !== null ? "£" + overall.mktAvg.toFixed(0) : "—"}
            label="Mkt Avg Monthly"
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

        {/* Range cards */}
        {!drillRange && results.length > 0 && (
          <div className="intel-range-grid">
            {ranges.map((range) => (
              <RangeCard
                key={range}
                range={range}
                tfRows={tfRows.filter((r) => r.range === range)}
                mktRows={mktRows.filter((r) => r.range === range)}
                onClick={() => {
                  setDrillRange(range);
                  setDeepDeriv(null);
                  setDrillTermFilter("");
                  setDrillMileageFilter("");
                }}
              />
            ))}
          </div>
        )}

        {/* Drilldown */}
        {drillRange && !deepDeriv && (
          <DrilldownView
            range={drillRange}
            rows={filteredRows.filter((r) => r.range === drillRange)}
            termFilter={drillTermFilter}
            mileageFilter={drillMileageFilter}
            onTermChange={setDrillTermFilter}
            onMileageChange={setDrillMileageFilter}
            onBack={() => setDrillRange(null)}
            onDeepDive={(deriv) => setDeepDeriv(deriv)}
          />
        )}

        {/* Deep dive */}
        {drillRange && deepDeriv && (
          <DeepDiveView
            range={drillRange}
            deriv={deepDeriv}
            rows={filteredRows.filter(
              (r) => r.range === drillRange && r.derivative === deepDeriv
            )}
            onBack={() => setDeepDeriv(null)}
          />
        )}
      </div>
    </>
  );
}

function SumCard({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div className="intel-sum-card">
      <div className="intel-sum-val" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="intel-sum-lbl">{label}</div>
    </div>
  );
}

function RangeCard({
  range,
  tfRows,
  mktRows,
  onClick,
}: {
  range: string;
  tfRows: ScrapedResult[];
  mktRows: ScrapedResult[];
  onClick: () => void;
}) {
  const s = useMemo(() => lflAvg(tfRows, mktRows), [tfRows, mktRows]);
  const t24 = useMemo(() => lflByTerm(tfRows, mktRows, "24"), [tfRows, mktRows]);
  const t36 = useMemo(() => lflByTerm(tfRows, mktRows, "36"), [tfRows, mktRows]);
  const t48 = useMemo(() => lflByTerm(tfRows, mktRows, "48"), [tfRows, mktRows]);
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
        <TermRow label="24 mo" t={t24} />
        <TermRow label="36 mo" t={t36} />
        <TermRow label="48 mo" t={t48} />
      </div>
      <div className="range-footer">
        <div className="range-stat">
          Overall avg gap:{" "}
          <span style={{ color: gapColor(s.gap), fontWeight: 600 }}>
            {gapStr(s.gap)}/mo
          </span>{" "}
          · {s.count} combos
        </div>
        <div className="range-drill-hint">Click to drill down →</div>
      </div>
    </div>
  );
}

function TermRow({
  label,
  t,
}: {
  label: string;
  t: ReturnType<typeof lflAvg>;
}) {
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

function DrilldownView({
  range,
  rows,
  termFilter,
  mileageFilter,
  onTermChange,
  onMileageChange,
  onBack,
  onDeepDive,
}: {
  range: string;
  rows: ScrapedResult[];
  termFilter: string;
  mileageFilter: string;
  onTermChange: (v: string) => void;
  onMileageChange: (v: string) => void;
  onBack: () => void;
  onDeepDive: (deriv: string) => void;
}) {
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!termFilter || termOf(r) === termFilter) &&
          (!mileageFilter || mileageOf(r) === mileageFilter)
      ),
    [rows, termFilter, mileageFilter]
  );

  const tfRows = filtered.filter((r) => isTrustFord(r.brokerDealerName));
  const mktRows = filtered.filter((r) => !isTrustFord(r.brokerDealerName));

  const allDerivs = useMemo(
    () =>
      Array.from(new Set(filtered.map((r) => r.derivative).filter(Boolean))).sort() as string[],
    [filtered]
  );
  const tfDerivs = new Set(tfRows.map((r) => r.derivative).filter(Boolean) as string[]);
  const missingDerivs = allDerivs.filter((d) => !tfDerivs.has(d));

  const mileages = useMemo(
    () =>
      Array.from(new Set(rows.map(mileageOf).filter(Boolean))).sort(
        (a, b) => +a - +b
      ),
    [rows]
  );

  return (
    <>
      <div className="intel-drill-header" style={{ padding: 0, marginBottom: 16 }}>
        <button className="intel-back" onClick={onBack}>
          ← All ranges
        </button>
        <div className="intel-drill-title">Ford {range}</div>
        <div className="drill-filters">
          <select value={termFilter} onChange={(e) => onTermChange(e.target.value)}>
            <option value="">All terms</option>
            <option value="24">24 months</option>
            <option value="36">36 months</option>
            <option value="48">48 months</option>
          </select>
          <select
            value={mileageFilter}
            onChange={(e) => onMileageChange(e.target.value)}
          >
            <option value="">All mileages</option>
            {mileages.map((m) => (
              <option key={m} value={m}>
                {parseInt(m) >= 1000 ? Math.round(parseInt(m) / 1000) + "k/yr" : m + "/yr"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {missingDerivs.length > 0 && (
        <div className="missing-banner" style={{ margin: "0 0 16px" }}>
          <div className="missing-banner-title">
            ⚠ Not advertising on {missingDerivs.length} derivative
            {missingDerivs.length > 1 ? "s" : ""}
          </div>
          <div className="missing-chips">
            {missingDerivs.map((d) => (
              <span key={d} className="missing-chip">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="drill-heatmaps" style={{ margin: "0 0 20px" }}>
        <div className="heatmap-block">
          <div className="heatmap-title">By Contract Length</div>
          <div className="heatmap-row">
            {["24", "36", "48"].map((term) => {
              const s = lflByTerm(tfRows, mktRows, term);
              return (
                <div key={term} className={`heatmap-cell ${hmClass(s.gap)}`}>
                  <div className="heatmap-cell-label">{term}mo</div>
                  <div className="heatmap-cell-score">
                    {s.gap !== null ? gapStr(s.gap) : "—"}
                  </div>
                  <div className="heatmap-cell-slots">{s.count} combos</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="heatmap-block">
          <div className="heatmap-title">By Annual Mileage</div>
          <div className="heatmap-row">
            {mileages.map((mil) => {
              const tfM = tfRows.filter((r) => mileageOf(r) === mil);
              const mktM = mktRows.filter((r) => mileageOf(r) === mil);
              const s = lflAvg(tfM, mktM);
              const label =
                parseInt(mil) >= 1000
                  ? Math.round(parseInt(mil) / 1000) + "k"
                  : mil;
              return (
                <div key={mil} className={`heatmap-cell ${hmClass(s.gap)}`}>
                  <div className="heatmap-cell-label">{label}/yr</div>
                  <div className="heatmap-cell-score">
                    {s.gap !== null ? gapStr(s.gap) : "—"}
                  </div>
                  <div className="heatmap-cell-slots">{s.count} combos</div>
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
              <th>Derivative</th>
              <th>24 months</th>
              <th>36 months</th>
              <th>48 months</th>
              <th>Overall Gap</th>
              <th>Combos</th>
            </tr>
          </thead>
          <tbody>
            {allDerivs.map((deriv) => {
              const tfD = tfRows.filter((r) => r.derivative === deriv);
              const mktD = mktRows.filter((r) => r.derivative === deriv);
              const s = lflAvg(tfD, mktD);
              const isMissing = !tfDerivs.has(deriv);
              return (
                <tr key={deriv} onClick={() => onDeepDive(deriv)}>
                  <td
                    style={{
                      color: isMissing ? "rgba(220,38,38,0.55)" : undefined,
                      fontStyle: isMissing ? "italic" : undefined,
                    }}
                  >
                    {deriv}
                  </td>
                  <td>{cellForTerm(tfD, mktD, "24")}</td>
                  <td>{cellForTerm(tfD, mktD, "36")}</td>
                  <td>{cellForTerm(tfD, mktD, "48")}</td>
                  <td
                    className={
                      s.gap === null
                        ? ""
                        : s.gap <= 0
                          ? "td-gap-neg"
                          : s.gap <= 20
                            ? "td-gap-zero"
                            : "td-gap-pos"
                    }
                  >
                    {gapStr(s.gap)}
                  </td>
                  <td>{s.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function cellForTerm(
  tfRows: ScrapedResult[],
  mktRows: ScrapedResult[],
  term: string
) {
  const s = lflByTerm(tfRows, mktRows, term);
  if (s.gap === null) return <span style={{ color: "var(--text3)" }}>—</span>;
  const cls =
    s.gap <= 0 ? "td-gap-neg" : s.gap <= 20 ? "td-gap-zero" : "td-gap-pos";
  return <span className={cls}>{gapStr(s.gap)}</span>;
}

function DeepDiveView({
  range,
  deriv,
  rows,
  onBack,
}: {
  range: string;
  deriv: string;
  rows: ScrapedResult[];
  onBack: () => void;
}) {
  const terms = ["24", "36", "48"];
  const mileages = useMemo(
    () =>
      Array.from(new Set(rows.map(mileageOf).filter(Boolean))).sort(
        (a, b) => +a - +b
      ),
    [rows]
  );

  const [selectedSlot, setSelectedSlot] = useState<{
    term: string;
    mil: string;
  } | null>(null);

  const tfRows = rows.filter((r) => isTrustFord(r.brokerDealerName));
  const mktRows = rows.filter((r) => !isTrustFord(r.brokerDealerName));

  return (
    <>
      <div className="intel-drill-header" style={{ padding: 0, marginBottom: 16 }}>
        <button className="intel-back" onClick={onBack}>
          ← Back to derivatives
        </button>
        <div className="intel-drill-title">
          Ford {range} · {deriv}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="intel-table" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Term \ Mileage</th>
              {mileages.map((m) => (
                <th key={m} style={{ textAlign: "center" }}>
                  {parseInt(m) >= 1000
                    ? Math.round(parseInt(m) / 1000) + "k/yr"
                    : m + "/yr"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t}>
                <td className="td-our-price">{t}mo</td>
                {mileages.map((m) => {
                  const tfMt = tfRows.filter(
                    (r) => termOf(r) === t && mileageOf(r) === m
                  );
                  const mktMt = mktRows.filter(
                    (r) => termOf(r) === t && mileageOf(r) === m
                  );
                  const tfPrice =
                    tfMt.length > 0
                      ? tfMt.reduce(
                          (s, r) => s + (Number(r.monthlyPriceGbp) || 0),
                          0
                        ) / tfMt.length
                      : null;
                  const mktBest =
                    mktMt.length > 0
                      ? Math.min(
                          ...mktMt.map((r) => Number(r.monthlyPriceGbp) || Infinity)
                        )
                      : null;
                  const gap =
                    tfPrice !== null && mktBest !== null
                      ? tfPrice - mktBest
                      : null;
                  const rank =
                    mktMt.length > 0 && tfPrice !== null
                      ? mktMt.filter(
                          (r) =>
                            (Number(r.monthlyPriceGbp) || Infinity) <= tfPrice
                        ).length + 1
                      : 0;
                  const bg =
                    gap === null
                      ? "transparent"
                      : gap <= 0
                        ? "rgba(22,163,74,0.08)"
                        : gap <= 20
                          ? "rgba(217,119,6,0.08)"
                          : "rgba(220,38,38,0.07)";
                  return (
                    <td
                      key={`${t}-${m}`}
                      style={{
                        textAlign: "center",
                        background: bg,
                        cursor: mktMt.length > 0 ? "pointer" : "default",
                      }}
                      onClick={() =>
                        mktMt.length > 0 && setSelectedSlot({ term: t, mil: m })
                      }
                    >
                      {tfPrice === null ? (
                        <span style={{ color: "var(--text3)" }}>—</span>
                      ) : (
                        <>
                          <div
                            style={{ fontWeight: 600, color: "var(--text)" }}
                          >
                            £{tfPrice.toFixed(0)}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: gapColor(gap),
                              fontWeight: 600,
                            }}
                          >
                            {gap !== null ? gapStr(gap) : ""}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text3)" }}>
                            #{rank}/{mktMt.length + 1}
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

      {selectedSlot && (
        <BrokerPanel
          rows={rows.filter(
            (r) =>
              termOf(r) === selectedSlot.term &&
              mileageOf(r) === selectedSlot.mil
          )}
          term={selectedSlot.term}
          mileage={selectedSlot.mil}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </>
  );
}

function BrokerPanel({
  rows,
  term,
  mileage,
  onClose,
}: {
  rows: ScrapedResult[];
  term: string;
  mileage: string;
  onClose: () => void;
}) {
  const sorted = [...rows].sort(
    (a, b) =>
      (Number(a.monthlyPriceGbp) || Infinity) -
      (Number(b.monthlyPriceGbp) || Infinity)
  );
  const cheapest = sorted[0]?.monthlyPriceGbp ?? null;

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
          Brokers @ {term}mo · {parseInt(mileage) >= 1000
            ? Math.round(parseInt(mileage) / 1000) + "k/yr"
            : mileage + "/yr"} · {sorted.length} listing{sorted.length === 1 ? "" : "s"}
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
              <th>Deposit</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const tf = isTrustFord(r.brokerDealerName);
              const diff =
                cheapest !== null && r.monthlyPriceGbp !== null && r.monthlyPriceGbp !== undefined
                  ? Number(r.monthlyPriceGbp) - Number(cheapest)
                  : null;
              return (
                <tr
                  key={r.id}
                  style={{
                    background: tf ? "rgba(37,99,235,0.05)" : undefined,
                  }}
                >
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: tf ? 600 : 400, color: tf ? "var(--accent)" : undefined }}>
                    {r.brokerDealerName}
                    {tf ? " ★" : ""}
                  </td>
                  <td>{r.advertiserCategory || "—"}</td>
                  <td style={{ fontWeight: 600 }}>
                    £{Number(r.monthlyPriceGbp).toFixed(2)}
                  </td>
                  <td className={diff && diff > 0 ? "td-gap-pos" : "td-gap-neg"}>
                    {diff === null
                      ? "—"
                      : diff === 0
                        ? "—"
                        : "+£" + diff.toFixed(2)}
                  </td>
                  <td>
                    {r.initialRentalGbp != null
                      ? "£" + Number(r.initialRentalGbp).toFixed(2)
                      : "—"}
                  </td>
                  <td>
                    {r.totalLeaseCostGbp != null
                      ? "£" + Number(r.totalLeaseCostGbp).toFixed(0)
                      : "—"}
                  </td>
                  <td>{r.inStock || "—"}</td>
                  <td>{r.depositMonths != null ? `${r.depositMonths}mo dep` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
