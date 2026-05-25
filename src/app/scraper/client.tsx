"use client";
import Link from "next/link";
import { useState } from "react";
import { IntelligencePanel } from "./panels/IntelligencePanel";
import { ResultsPanel } from "./panels/ResultsPanel";
import { HistoryPanel } from "./panels/HistoryPanel";
import { signOutAction } from "../login/actions";

type TabName = "intelligence" | "results" | "history";

const TABS: Array<{ id: TabName; label: string }> = [
  { id: "intelligence", label: "Intelligence" },
  { id: "results", label: "Results" },
  { id: "history", label: "History" },
];

export function ScraperClient({ userName }: { userName: string }) {
  const [activeTab, setActiveTab] = useState<TabName>("intelligence");
  const [activeRunId, setActiveRunId] = useState<string | undefined>();

  return (
    <div className="rx">
      <div className="shell">
        <header>
          <div className="logo">
            <Link href="/" className="back-btn">
              ← Back to portal
            </Link>
            <span className="header-title">Market Analysis</span>
          </div>
          <div className="header-right">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`nav-tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
            <div className="user-chip">
              <span className="user-name">{userName}</span>
              <form action={signOutAction}>
                <button className="logout-btn" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

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
