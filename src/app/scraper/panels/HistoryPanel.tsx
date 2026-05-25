"use client";
import { useState, useEffect } from "react";

interface Run {
  id: string;
  label?: string | null;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  totalResults: number;
  totalUrls: number;
}

export function HistoryPanel({
  onOpenRun,
}: {
  onOpenRun: (runId: string, tab: "intelligence" | "results") => void;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await fetch("/api/scraper/runs");
      if (res.ok) {
        const data = (await res.json()) as Run[];
        setRuns(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRun(runId: string) {
    if (!confirm("Delete this run and all its results?")) return;
    try {
      await fetch(`/api/scraper/runs/${runId}`, { method: "DELETE" });
      setRuns(runs.filter((r) => r.id !== runId));
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>;
  if (runs.length === 0)
    return (
      <div className="empty-state">
        No runs yet. Run a scrape from the desktop RateX app — it'll auto-upload here.
      </div>
    );

  return (
    <div className="history-list">
      {runs.map((run) => (
        <div key={run.id} className="history-item">
          <div className="history-info" onClick={() => onOpenRun(run.id, "intelligence")} style={{ cursor: "pointer" }}>
            <div className="history-label">{run.label || "Unlabelled run"}</div>
            <div className="history-meta">
              {run.startedAt.slice(0, 19).replace("T", " ")} ·{" "}
              <span>{run.totalResults.toLocaleString()}</span> listings ·{" "}
              <span>{run.totalUrls}</span> URL{run.totalUrls === 1 ? "" : "s"} ·{" "}
              <span style={{ color: run.status === "done" ? "#16a34a" : "var(--text2)" }}>
                {run.status}
              </span>
            </div>
          </div>
          <div className="history-actions">
            <button
              className="btn-hist-dl"
              onClick={() => onOpenRun(run.id, "intelligence")}
              style={{ background: "transparent", color: "var(--accent)", border: "1px solid rgba(37,99,235,0.3)" }}
            >
              🧠 Intelligence
            </button>
            <button
              className="btn-hist-dl"
              onClick={() => onOpenRun(run.id, "results")}
              style={{ background: "transparent", color: "var(--accent)", border: "1px solid rgba(37,99,235,0.3)" }}
            >
              📊 Results
            </button>
            <a
              className="btn-hist-dl"
              href={`/api/scraper/results?runId=${run.id}&format=csv`}
            >
              ↓ CSV
            </a>
            <button className="btn-hist-del" onClick={() => deleteRun(run.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
