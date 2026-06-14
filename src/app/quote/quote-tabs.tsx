"use client";
import { useState } from "react";
import { QuoteForm } from "./quote-form";
import { ReverseCommissionCalculator } from "./reverse-commission";

type Tab = "forward" | "reverse";

export function QuoteTabs({ models }: { models: string[] }) {
  const [tab, setTab] = useState<Tab>("forward");
  return (
    <>
      <nav className="mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
        <TabButton active={tab === "forward"} onClick={() => setTab("forward")}>Rank funders</TabButton>
        <TabButton active={tab === "reverse"} onClick={() => setTab("reverse")}>Reverse commission</TabButton>
      </nav>
      {tab === "forward" ? <QuoteForm models={models} /> : <ReverseCommissionCalculator />}
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}
