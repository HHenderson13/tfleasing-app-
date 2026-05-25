"use client";
import { useState, useEffect } from "react";

interface Run {
  id: string;
  label?: string | null;
  startedAt: string;
  totalResults: number;
}

interface Result {
  id: number;
  manufacturer?: string | null;
  range?: string | null;
  model?: string | null;
  derivative?: string | null;
  monthlyPriceGbp?: number | null;
  initialRentalGbp?: number | null;
  contractLengthMonths?: number | null;
  annualMileage?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  brokerDealerName?: string | null;
  advertiserCategory?: string | null;
  inStock?: string | null;
}

const PER_PAGE = 50;

export function ResultsPanel({
  activeRunId,
  onSelectRun,
}: {
  activeRunId?: string;
  onSelectRun: (id: string | undefined) => void;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/scraper/runs")
      .then((r) => r.json())
      .then((d: Run[]) => {
        const filtered = d.filter((r) => r.totalResults > 0);
        setRuns(filtered);
        if (!activeRunId && filtered.length > 0) onSelectRun(filtered[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    setLoading(true);
    fetch(`/api/scraper/results?runId=${activeRunId}&page=${page}&per_page=${PER_PAGE}`)
      .then((r) => r.json())
      .then((d) => {
        setResults(d.results);
        setPages(d.pages || 1);
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  }, [activeRunId, page]);

  return (
    <>
      <div className="results-toolbar">
        <div className="results-count">
          Showing <span>{results.length > 0 ? (page - 1) * PER_PAGE + 1 : 0}</span>–
          <span>{Math.min(page * PER_PAGE, total)}</span> of <span>{total.toLocaleString()}</span> listings
        </div>
        <select
          value={activeRunId || ""}
          onChange={(e) => {
            setPage(1);
            onSelectRun(e.target.value || undefined);
          }}
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border2)",
            color: "var(--text2)",
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 8,
            fontFamily: "var(--sans)",
          }}
        >
          <option value="">— Select run —</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {(r.label || "Unlabelled")} — {r.startedAt.slice(0, 10)} (
              {r.totalResults.toLocaleString()})
            </option>
          ))}
        </select>
        {activeRunId && (
          <a
            href={`/api/scraper/results?runId=${activeRunId}&format=csv`}
            className="btn-download"
          >
            ↓ Download CSV
          </a>
        )}
      </div>
      <div className="table-wrap">
        <table className="results">
          <thead>
            <tr>
              <th>Make</th>
              <th>Model</th>
              <th>Derivative</th>
              <th>Monthly (£)</th>
              <th>Initial (£)</th>
              <th>Contract</th>
              <th>Mileage/yr</th>
              <th>Fuel</th>
              <th>Trans.</th>
              <th>Broker/Dealer</th>
              <th>Category</th>
              <th>In Stock</th>
            </tr>
          </thead>
          <tbody>
            {!activeRunId ? (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>
                  Select a run above to see results.
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>
                  Loading…
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>
                  No results in this run.
                </td>
              </tr>
            ) : (
              results.map((r) => (
                <tr key={r.id}>
                  <td className="make">{r.manufacturer}</td>
                  <td>{r.range}</td>
                  <td>{r.derivative}</td>
                  <td className="price">
                    {r.monthlyPriceGbp != null
                      ? "£" + Number(r.monthlyPriceGbp).toFixed(2)
                      : "—"}
                  </td>
                  <td>
                    {r.initialRentalGbp != null
                      ? "£" + Number(r.initialRentalGbp).toFixed(2)
                      : "—"}
                  </td>
                  <td>{r.contractLengthMonths ? r.contractLengthMonths + " mo" : "—"}</td>
                  <td>
                    {r.annualMileage ? r.annualMileage.toLocaleString() + "/yr" : "—"}
                  </td>
                  <td>{r.fuelType || "—"}</td>
                  <td>{r.transmission || "—"}</td>
                  <td>{r.brokerDealerName || "—"}</td>
                  <td>{r.advertiserCategory || "—"}</td>
                  <td>{r.inStock || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button
          className="page-btn"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          ← Prev
        </button>
        <span className="page-info">
          Page {page} of {pages}
        </span>
        <button
          className="page-btn"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </>
  );
}
