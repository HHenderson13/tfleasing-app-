"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Overview } from "./views/Overview";

// Overview ships up-front since it's the default view. The other three
// views together are ~1800 lines of client JS — dynamic() defers them
// until the user actually picks the matching tab, trimming the initial
// /funders bundle by roughly 70%.
const ModelDrilldown = dynamic(() => import("./views/ModelDrilldown").then((m) => ({ default: m.ModelDrilldown })));
const FunderCompare  = dynamic(() => import("./views/FunderCompare").then((m)  => ({ default: m.FunderCompare })));
const Coverage       = dynamic(() => import("./views/Coverage").then((m)       => ({ default: m.Coverage })));

export interface Funder {
  id: string;
  name: string;
}

export interface Rate {
  funderId: string;
  capCode: string;
  termMonths: number;
  annualMileage: number;
  model: string;
  derivative: string;
  isVan: boolean;
  fuelType: string | null;
  listPriceNet: number | null;
  monthlyRental: number;
  monthlyMaintenance: number;
  totalMonthly: number;
}

export interface Snapshot {
  funders: Funder[];
  rates: Rate[];
  filterOptions: {
    irms: number[];
  };
  filters: {
    contract: "PCH" | "BCH";
    maintenance: "customer" | "maintained";
    irm: number;
  };
}

type View =
  | { kind: "overview" }
  | { kind: "model"; model: string }
  | { kind: "funder"; funderId: string }
  | { kind: "coverage" };

export function FundersClient() {
  const [contract, setContract] = useState<"PCH" | "BCH">("BCH");
  const [maintenance, setMaintenance] = useState<"customer" | "maintained">("customer");
  const [irm, setIrm] = useState<number>(6);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: "overview" });

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      contract,
      maintenance,
      irm: String(irm),
    });
    fetch(`/api/funders/snapshot?${qs}`)
      .then((r) => r.json())
      .then((data: Snapshot) => setSnapshot(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contract, maintenance, irm]);

  const subnavTabs: Array<{ id: View["kind"]; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "model", label: "By Model" },
    { id: "funder", label: "Funder Compare" },
    { id: "coverage", label: "Coverage" },
  ];

  return (
    <div className="fc">
      <div className="shell">
        <header>
          <Link href="/" className="back-btn">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
            Home
          </Link>
        </header>
        <div className="page-head">
          <h1>Funder Comparison</h1>
          <p>Every funder&apos;s rates side by side, across our ratebooks.</p>
        </div>

        <nav className="subnav">
          <div className="subnav-inner" role="tablist" aria-label="Funder Comparison">
          {subnavTabs.map((t) => (
            <button
              key={t.id}
              className={`subnav-tab ${view.kind === t.id ? "active" : ""}`}
              onClick={() => {
                if (t.id === "overview") setView({ kind: "overview" });
                else if (t.id === "model") setView({ kind: "model", model: "" });
                else if (t.id === "funder") setView({ kind: "funder", funderId: "" });
                else if (t.id === "coverage") setView({ kind: "coverage" });
              }}
            >
              {t.label}
            </button>
          ))}
          </div>
        </nav>

        <div className="filter-bar">
          <div className="filter-group">
            <label className="filter-label">Contract</label>
            <select value={contract} onChange={(e) => setContract(e.target.value as "PCH" | "BCH")}>
              <option value="BCH">BCH (Business)</option>
              <option value="PCH">PCH (Personal)</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Maintenance</label>
            <select value={maintenance} onChange={(e) => setMaintenance(e.target.value as "customer" | "maintained")}>
              <option value="customer">Customer maintained</option>
              <option value="maintained">Funder maintained</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Initial Rental</label>
            <select value={irm} onChange={(e) => setIrm(parseInt(e.target.value, 10))}>
              {(snapshot?.filterOptions.irms ?? [3, 6, 9, 12]).map((i) => (
                <option key={i} value={i}>{i}× monthly</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          {snapshot && (
            <div style={{ fontSize: 11, color: "var(--fc-text3)", textAlign: "right" }}>
              {snapshot.rates.length.toLocaleString()} rates across all terms × mileages
            </div>
          )}
        </div>

        <div className="content">
          {loading && !snapshot && <div className="loading">Loading rates…</div>}
          {!loading && snapshot && snapshot.rates.length === 0 && (
            <div className="empty">
              No rates for this combination. Try a different initial-rental option.
            </div>
          )}
          {snapshot && snapshot.rates.length > 0 && (
            <>
              {view.kind === "overview" && (
                <Overview
                  snapshot={snapshot}
                  onPickModel={(model) => setView({ kind: "model", model })}
                  onPickFunder={(funderId) => setView({ kind: "funder", funderId })}
                />
              )}
              {view.kind === "model" && (
                <ModelDrilldown
                  snapshot={snapshot}
                  initialModel={view.model}
                  onBack={() => setView({ kind: "overview" })}
                />
              )}
              {view.kind === "funder" && (
                <FunderCompare
                  snapshot={snapshot}
                  initialFunderId={view.funderId}
                  onBack={() => setView({ kind: "overview" })}
                />
              )}
              {view.kind === "coverage" && <Coverage snapshot={snapshot} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
