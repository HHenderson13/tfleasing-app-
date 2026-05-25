"use client";
import { useMemo, useState } from "react";
import type { Snapshot } from "../client";
import {
  summariseCoverage,
  buildCoverage,
  funderName,
} from "../lib";

type Drill =
  | { kind: "funder"; funderId: string; model: string | null }
  | { kind: "model"; model: string };

export function Coverage({ snapshot }: { snapshot: Snapshot }) {
  const [drill, setDrill] = useState<Drill | null>(null);

  if (drill?.kind === "funder") {
    return (
      <FunderDetail
        snapshot={snapshot}
        funderId={drill.funderId}
        modelFilter={drill.model}
        onBack={() => setDrill(null)}
      />
    );
  }
  if (drill?.kind === "model") {
    return (
      <ModelDetail
        snapshot={snapshot}
        model={drill.model}
        onBack={() => setDrill(null)}
      />
    );
  }
  return <CoverageOverview snapshot={snapshot} onDrill={(d) => setDrill(d)} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Overview
// ═══════════════════════════════════════════════════════════════════════════
function CoverageOverview({
  snapshot,
  onDrill,
}: {
  snapshot: Snapshot;
  onDrill: (d: Drill) => void;
}) {
  const { byFunder, byModel, totalDerivatives } = useMemo(
    () => summariseCoverage(snapshot),
    [snapshot]
  );

  const orderedFunders = byFunder.map((f) => ({ id: f.funderId, name: f.funderName }));
  const totalMissingCombos = byFunder.reduce((s, f) => s + f.missing, 0);

  return (
    <>
      <div className="summary-cards">
        <div className="sum-card">
          <div className="sum-val">{snapshot.funders.length}</div>
          <div className="sum-lbl">Funders</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{byModel.length}</div>
          <div className="sum-lbl">Models</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{totalDerivatives.toLocaleString()}</div>
          <div className="sum-lbl">Derivatives</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: "var(--fc-red)" }}>
            {totalMissingCombos.toLocaleString()}
          </div>
          <div className="sum-lbl">Funder × derivative gaps</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">
            {byFunder[0]?.funderName ?? "—"}
          </div>
          <div className="sum-lbl">Best coverage</div>
        </div>
      </div>

      <div className="table-card" style={{ marginBottom: 24 }}>
        <div className="table-card-header">
          <div>
            <div className="table-card-title">Coverage leaderboard</div>
            <div className="table-card-sub">
              How many derivatives each funder has rates for. Click a row to see exactly what's missing.
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Funder</th>
                <th style={{ textAlign: "right" }}>Covered</th>
                <th style={{ textAlign: "right" }}>Missing</th>
                <th style={{ textAlign: "right" }}>Coverage %</th>
                <th style={{ textAlign: "right" }}>Models · full / partial / none</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {byFunder.map((f) => {
                const cls =
                  f.pct >= 0.9 ? "best" : f.pct >= 0.7 ? "good" : f.pct >= 0.4 ? "mid" : "bad";
                return (
                  <tr
                    key={f.funderId}
                    className="clickable"
                    onClick={() => onDrill({ kind: "funder", funderId: f.funderId, model: null })}
                  >
                    <td className="fname">{f.funderName}</td>
                    <td className="num">{f.covered.toLocaleString()} / {f.total.toLocaleString()}</td>
                    <td className={`num ${f.missing > 0 ? "bad" : "best"}`}>
                      {f.missing.toLocaleString()}
                    </td>
                    <td className={`num ${cls}`} style={{ fontWeight: 700 }}>
                      {(f.pct * 100).toFixed(0)}%
                    </td>
                    <td className="num">
                      <span style={{ color: "var(--fc-green)", fontWeight: 600 }}>{f.modelsFull}</span>
                      {" / "}
                      <span style={{ color: "var(--fc-amber)", fontWeight: 600 }}>{f.modelsPartial}</span>
                      {" / "}
                      <span style={{ color: "var(--fc-red)", fontWeight: 600 }}>{f.modelsMissing}</span>
                    </td>
                    <td style={{ color: "var(--fc-text3)", fontSize: 11 }}>
                      See gaps →
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <div>
            <div className="table-card-title">Model × funder coverage grid</div>
            <div className="table-card-sub">
              Green = full coverage, amber = partial, red = missing entirely. Click an amber/red cell to see exactly which derivatives are missing.
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th style={{ textAlign: "right" }}>Derivatives</th>
                {orderedFunders.map((f) => (
                  <th key={f.id} style={{ textAlign: "center" }}>{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byModel.map((m) => (
                <tr key={m.model}>
                  <td
                    className="mname"
                    style={{ cursor: "pointer", color: "var(--fc-accent)" }}
                    onClick={() => onDrill({ kind: "model", model: m.model })}
                    title={`See every derivative in ${m.model} with all funder coverage`}
                  >
                    {m.model}
                  </td>
                  <td className="num">{m.totalDerivatives}</td>
                  {orderedFunders.map((f) => {
                    const s = m.perFunder[f.id];
                    if (!s) {
                      return (
                        <td key={f.id} className="num none" style={{ textAlign: "center" }}>—</td>
                      );
                    }
                    const cls =
                      s.status === "full" ? "best" :
                      s.status === "partial" ? "mid" : "bad";
                    const clickable = s.status !== "full";
                    return (
                      <td
                        key={f.id}
                        className={`num ${cls}`}
                        style={{ textAlign: "center", cursor: clickable ? "pointer" : "default" }}
                        onClick={() => {
                          if (clickable) onDrill({ kind: "funder", funderId: f.id, model: m.model });
                        }}
                        title={`${f.name} on ${m.model}: ${s.covered} / ${m.totalDerivatives} (${(s.pct * 100).toFixed(0)}%)`}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {s.covered}/{m.totalDerivatives}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                          {s.status === "full" ? "full" : s.status === "none" ? "missing" : `${s.missing} gap`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-funder detail — what they're missing
// ═══════════════════════════════════════════════════════════════════════════
function FunderDetail({
  snapshot,
  funderId,
  modelFilter,
  onBack,
}: {
  snapshot: Snapshot;
  funderId: string;
  modelFilter: string | null;
  onBack: () => void;
}) {
  const funder = snapshot.funders.find((f) => f.id === funderId);
  const derivs = useMemo(() => buildCoverage(snapshot), [snapshot]);

  type ModelGroup = {
    model: string;
    total: number;
    covered: number;
    missing: number;
    pct: number;
    missingDerivs: {
      capCode: string;
      derivative: string;
      missingFunderIds: string[]; // ALL funders missing this derivative (includes drilled one)
      coveredFunderIds: string[]; // ALL funders covering this derivative
    }[];
  };

  const groups = useMemo<ModelGroup[]>(() => {
    const byModel = new Map<string, typeof derivs>();
    for (const d of derivs) {
      if (modelFilter && d.model !== modelFilter) continue;
      if (!byModel.has(d.model)) byModel.set(d.model, []);
      byModel.get(d.model)!.push(d);
    }
    const out: ModelGroup[] = [];
    for (const [model, list] of byModel.entries()) {
      const covered = list.filter((d) => d.coveredBy.includes(funderId));
      const missing = list.filter((d) => !d.coveredBy.includes(funderId));
      out.push({
        model,
        total: list.length,
        covered: covered.length,
        missing: missing.length,
        pct: list.length > 0 ? covered.length / list.length : 0,
        missingDerivs: missing.map((d) => ({
          capCode: d.capCode,
          derivative: d.derivative,
          missingFunderIds: d.missingFrom,
          coveredFunderIds: d.coveredBy,
        })),
      });
    }
    return out.sort((a, b) => b.missing - a.missing);
  }, [derivs, funderId, modelFilter]);

  const totalMissing = groups.reduce((s, g) => s + g.missing, 0);
  const totalCovered = groups.reduce((s, g) => s + g.covered, 0);
  const totalDerivs = totalMissing + totalCovered;
  const coverPct = totalDerivs > 0 ? (totalCovered / totalDerivs) * 100 : 0;

  if (!funder) return <div className="empty">Funder not found.</div>;

  const scopeLabel = modelFilter ? `${funder.name} · ${modelFilter}` : funder.name;
  const backLabel = modelFilter ? "← Back to coverage overview" : "← Back to coverage overview";

  return (
    <>
      <button className="back-link" onClick={onBack}>{backLabel}</button>

      {/* Big scope header */}
      <div
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
          borderLeft: "4px solid var(--fc-accent)",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 20,
          boxShadow: "var(--fc-shadow)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fc-text3)", marginBottom: 4 }}>
          Coverage gaps · {modelFilter ? "scoped to one model" : "all models"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--fc-text)", letterSpacing: "-0.02em" }}>
          {scopeLabel}
        </div>
        <div style={{ fontSize: 12, color: "var(--fc-text2)", marginTop: 4 }}>
          {totalCovered.toLocaleString()} covered · {totalMissing.toLocaleString()} missing · {coverPct.toFixed(0)}% coverage
        </div>
      </div>

      {!modelFilter && (
        <div className="summary-cards">
          <div className="sum-card">
            <div className="sum-val">{totalCovered.toLocaleString()}</div>
            <div className="sum-lbl">{funder.name} covers</div>
          </div>
          <div className="sum-card">
            <div className="sum-val" style={{ color: "var(--fc-red)" }}>
              {totalMissing.toLocaleString()}
            </div>
            <div className="sum-lbl">Missing</div>
          </div>
          <div className="sum-card">
            <div className="sum-val">{coverPct.toFixed(0)}%</div>
            <div className="sum-lbl">Coverage</div>
          </div>
          <div className="sum-card">
            <div className="sum-val">{groups.filter((g) => g.missing === 0).length}</div>
            <div className="sum-lbl">Models fully covered</div>
          </div>
          <div className="sum-card">
            <div className="sum-val" style={{ color: "var(--fc-red)" }}>
              {groups.filter((g) => g.covered === 0).length}
            </div>
            <div className="sum-lbl">Models with no coverage</div>
          </div>
        </div>
      )}

      {groups.map((g) => {
        if (g.missing === 0) return null;
        const cls =
          g.pct >= 0.9 ? "best" : g.pct >= 0.7 ? "good" : g.pct >= 0.4 ? "mid" : "bad";
        return (
          <div className="table-card" key={g.model} style={{ marginBottom: 16 }}>
            <div className="table-card-header">
              <div>
                <div className="table-card-title">
                  {g.model} — {g.missing} missing
                </div>
                <div className="table-card-sub">
                  Covered {g.covered} / {g.total} ({(g.pct * 100).toFixed(0)}%)
                </div>
              </div>
              <span className={`pill ${cls === "best" ? "pill-best" : cls === "good" || cls === "mid" ? "pill-mid" : "pill-bad"}`}>
                {g.pct >= 0.9 ? "near full" : g.pct >= 0.4 ? "partial" : g.covered === 0 ? "no coverage" : "low coverage"}
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 320 }}>Missing derivative</th>
                    <th>Missing from</th>
                    <th>Covered by</th>
                  </tr>
                </thead>
                <tbody>
                  {g.missingDerivs.map((d) => (
                    <tr key={d.capCode}>
                      <td>{d.derivative}</td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {d.missingFunderIds.length === 0 ? (
                            <span className="pill pill-none">none</span>
                          ) : (
                            d.missingFunderIds.map((id) => (
                              <span
                                key={id}
                                className="pill pill-bad"
                                style={
                                  id === funderId
                                    ? { background: "var(--fc-accent)", color: "white", borderColor: "var(--fc-accent)" }
                                    : undefined
                                }
                              >
                                {funderName(snapshot.funders, id)}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {d.coveredFunderIds.length === 0 ? (
                            <span className="pill pill-none">none</span>
                          ) : (
                            d.coveredFunderIds.map((id) => (
                              <span key={id} className="pill pill-best">
                                {funderName(snapshot.funders, id)}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {groups.every((g) => g.missing === 0) && (
        <div className="empty">
          {scopeLabel} — no gaps. Every derivative covered. 🎉
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-model detail — every derivative in this model with all funder coverage
// ═══════════════════════════════════════════════════════════════════════════
function ModelDetail({
  snapshot,
  model,
  onBack,
}: {
  snapshot: Snapshot;
  model: string;
  onBack: () => void;
}) {
  const derivs = useMemo(
    () => buildCoverage(snapshot).filter((d) => d.model === model),
    [snapshot, model]
  );

  const totalFunders = snapshot.funders.length;
  const totalDerivs = derivs.length;
  const totalGaps = derivs.reduce((s, d) => s + d.missingFrom.length, 0);
  const totalSlots = totalDerivs * totalFunders;
  const coveredSlots = totalSlots - totalGaps;
  const coveragePct = totalSlots > 0 ? (coveredSlots / totalSlots) * 100 : 0;
  const fullyCoveredDerivs = derivs.filter((d) => d.missingFrom.length === 0).length;
  const orphanDerivs = derivs.filter((d) => d.coveredBy.length === 0).length;

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to coverage overview</button>

      <div
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
          borderLeft: "4px solid var(--fc-accent)",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 20,
          boxShadow: "var(--fc-shadow)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fc-text3)", marginBottom: 4 }}>
          Coverage by model · all funders
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--fc-text)", letterSpacing: "-0.02em" }}>
          {model}
        </div>
        <div style={{ fontSize: 12, color: "var(--fc-text2)", marginTop: 4 }}>
          {totalDerivs.toLocaleString()} derivatives · {coveredSlots.toLocaleString()} of {totalSlots.toLocaleString()} (funder × derivative) slots filled · {coveragePct.toFixed(0)}% coverage
        </div>
      </div>

      <div className="summary-cards">
        <div className="sum-card">
          <div className="sum-val">{totalDerivs}</div>
          <div className="sum-lbl">Derivatives</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{fullyCoveredDerivs}</div>
          <div className="sum-lbl">Covered by all funders</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: "var(--fc-amber)" }}>
            {totalDerivs - fullyCoveredDerivs - orphanDerivs}
          </div>
          <div className="sum-lbl">Partial coverage</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: "var(--fc-red)" }}>
            {orphanDerivs}
          </div>
          <div className="sum-lbl">No funder coverage</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{coveragePct.toFixed(0)}%</div>
          <div className="sum-lbl">Overall coverage</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <div>
            <div className="table-card-title">{model} — every derivative</div>
            <div className="table-card-sub">
              Which funders are missing or covering each derivative in {model}.
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 320 }}>Derivative</th>
                <th>Missing from</th>
                <th>Covered by</th>
              </tr>
            </thead>
            <tbody>
              {derivs.map((d) => (
                <tr key={d.capCode}>
                  <td>{d.derivative}</td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {d.missingFrom.length === 0 ? (
                        <span className="pill pill-best">none — fully covered</span>
                      ) : (
                        d.missingFrom.map((id) => (
                          <span key={id} className="pill pill-bad">
                            {funderName(snapshot.funders, id)}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {d.coveredBy.length === 0 ? (
                        <span className="pill pill-bad">no funders</span>
                      ) : (
                        d.coveredBy.map((id) => (
                          <span key={id} className="pill pill-best">
                            {funderName(snapshot.funders, id)}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
