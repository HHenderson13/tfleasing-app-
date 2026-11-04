"use client";
import Link from "next/link";
import { useState } from "react";
import dynamic from "next/dynamic";

// Each panel is a sibling tab — only one is rendered at any time. Lazy-load
// them so the initial JS download only ships what's needed for the default
// tab. IntelligencePanel alone is ~800 lines; deferring Results + History
// trims roughly 60% off the scraper page's initial bundle.
const IntelligencePanel = dynamic(() => import("./panels/IntelligencePanel").then((m) => ({ default: m.IntelligencePanel })));
const TrendsPanel       = dynamic(() => import("./panels/TrendsPanel").then((m) => ({ default: m.TrendsPanel })));
const ResultsPanel      = dynamic(() => import("./panels/ResultsPanel").then((m) => ({ default: m.ResultsPanel })));
const HistoryPanel      = dynamic(() => import("./panels/HistoryPanel").then((m) => ({ default: m.HistoryPanel })));

type TabName = "intelligence" | "trends" | "results" | "history";

const TABS: Array<{ id: TabName; label: string }> = [
  { id: "intelligence", label: "Intelligence" },
  { id: "trends", label: "Trends" },
  { id: "results", label: "Results" },
  { id: "history", label: "History" },
];

export function ScraperClient() {
  const [activeTab, setActiveTab] = useState<TabName>("intelligence");
  const [activeRunId, setActiveRunId] = useState<string | undefined>();

  return (
    <div className="rx">
      <div className="shell">
        <header>
          <Link href="/" className="back-btn">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
            Home
          </Link>
          <div className="seg-nav" role="tablist" aria-label="Market Analysis">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={`nav-tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>
        <div className="page-head">
          <h1>Market Analysis</h1>
          <p>Our leasing.com prices against every other broker, from the runs the RateX app uploads.</p>
        </div>

        <main>
          <div className="content">
            <div className={`panel ${activeTab === "intelligence" ? "active" : ""}`}>
              {activeTab === "intelligence" && (
                <IntelligencePanel
                  activeRunId={activeRunId}
                  onSelectRun={setActiveRunId}
                />
              )}
            </div>
            <div className={`panel ${activeTab === "trends" ? "active" : ""}`}>
              {activeTab === "trends" && <TrendsPanel />}
            </div>
            <div className={`panel ${activeTab === "results" ? "active" : ""}`}>
              {activeTab === "results" && (
                <ResultsPanel
                  activeRunId={activeRunId}
                  onSelectRun={setActiveRunId}
                />
              )}
            </div>
            <div className={`panel ${activeTab === "history" ? "active" : ""}`}>
              {activeTab === "history" && (
                <HistoryPanel
                  onOpenRun={(runId, tab) => {
                    setActiveRunId(runId);
                    setActiveTab(tab);
                  }}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
