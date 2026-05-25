"use client";
import { useMemo } from "react";
import type { Snapshot } from "../client";
import {
  summariseByModel,
  summariseByFunder,
  cheapestPerSlot,
  fmtMoney,
  fmtGap,
  funderName,
} from "../lib";

export function Overview({
  snapshot,
  onPickModel,
  onPickFunder,
}: {
  snapshot: Snapshot;
  onPickModel: (model: string) => void;
  onPickFunder: (funderId: string) => void;
}) {
  const modelSummaries = useMemo(() => summariseByModel(snapshot), [snapshot]);
  const funderSummaries = useMemo(() => summariseByFunder(snapshot), [snapshot]);

  const totalSlots = useMemo(
    () => cheapestPerSlot(snapshot.rates).size,
    [snapshot]
  );
  const totalDerivs = useMemo(
    () => new Set(snapshot.rates.map((r) => r.capCode)).size,
    [snapshot]
  );
  const totalModels = modelSummaries.length;

  const orderedFunders = funderSummaries.map((s) => ({
    id: s.funderId,
    name: s.funderName,
  }));

  return (
    <>
      <div className="summary-cards">
        <div className="sum-card">
          <div className="sum-val">{totalModels}</div>
          <div className="sum-lbl">Models</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{totalDerivs.toLocaleString()}</div>
          <div className="sum-lbl">Derivatives</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{totalSlots.toLocaleString()}</div>
          <div className="sum-lbl">Quote slots</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{funderSummaries.length}</div>
          <div className="sum-lbl">Funders</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">
            {funderSummaries[0]?.funderName ?? "—"}
          </div>
          <div className="sum-lbl">Most #1s</div>
        </div>
      </div>

      <div className="table-card" style={{ marginBottom: 24 }}>
        <div className="table-card-header">
          <div>
            <div className="table-card-title">Funder leaderboard</div>
            <div className="table-card-sub">
              Each funder's performance across every (vehicle × term × mileage) quote slot. Click a row for full drill-down.
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Funder</th>
                <th style={{ textAlign: "right" }}>#1 finishes</th>
                <th style={{ textAlign: "right" }}>Slots covered</th>
                <th style={{ textAlign: "right" }}>Avg rental</th>
                <th style={{ textAlign: "right" }}>Avg gap vs best</th>
                <th style={{ textAlign: "right" }}>Worst gap</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {funderSummaries.map((f) => {
                const winPct = totalSlots > 0 ? (f.wins / totalSlots) * 100 : 0;
                const covPct = totalSlots > 0 ? (f.slotsCovered / totalSlots) * 100 : 0;
                return (
                  <tr
                    key={f.funderId}
                    className="clickable"
                    onClick={() => onPickFunder(f.funderId)}
                  >
                    <td className="fname">{f.funderName}</td>
                    <td className="num">
                      <strong>{f.wins.toLocaleString()}</strong>{" "}
                      <span style={{ color: "var(--fc-text3)" }}>
                        ({winPct.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="num">
                      {f.slotsCovered.toLocaleString()} / {f.totalSlots.toLocaleString()}{" "}
                      <span style={{ color: "var(--fc-text3)" }}>({covPct.toFixed(0)}%)</span>
                    </td>
                    <td className="num">{fmtMoney(f.avgRental, 0)}</td>
                    <td className={`num ${f.avgGap <= 5 ? "good" : f.avgGap <= 20 ? "mid" : "bad"}`}>
                      {fmtGap(f.avgGap)}/mo
                    </td>
                    <td className="num bad">{fmtGap(f.worstGap)}/mo</td>
                    <td style={{ color: "var(--fc-text3)", fontSize: 11 }}>
                      Compare →
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
            <div className="table-card-title">Model × funder grid</div>
            <div className="table-card-sub">
              Wins / slots covered per funder per model — across all terms and mileages. Click a model row to see derivatives.
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th style={{ textAlign: "right" }}>Slots</th>
                <th>Best funder</th>
                {orderedFunders.map((f) => (
                  <th key={f.id} style={{ textAlign: "center" }}>
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelSummaries.map((m) => (
                <tr
                  key={m.model}
                  className="clickable"
                  onClick={() => onPickModel(m.model)}
                >
                  <td className="mname">{m.model}</td>
                  <td className="num">{m.slotCount.toLocaleString()}</td>
                  <td>
                    {m.bestFunderId ? (
                      <span className="pill pill-best">
                        {funderName(snapshot.funders, m.bestFunderId)}
                      </span>
                    ) : (
                      <span className="pill pill-none">—</span>
                    )}
                  </td>
                  {orderedFunders.map((f) => {
                    const s = m.funderStats[f.id];
                    if (!s) {
                      return (
                        <td key={f.id} className="num none" style={{ textAlign: "center" }}>
                          —
                        </td>
                      );
                    }
                    const winRatio = s.slotsCovered > 0 ? s.wins / s.slotsCovered : 0;
                    let cls = "num";
                    if (s.wins > 0 && winRatio >= 0.5) cls = "num best";
                    else if (s.wins > 0) cls = "num good";
                    else if (s.avgGap !== null && s.avgGap <= 20) cls = "num mid";
                    else cls = "num bad";
                    return (
                      <td
                        key={f.id}
                        className={cls}
                        style={{ textAlign: "center" }}
                        title={`${s.wins} wins / ${s.slotsCovered} covered · avg gap ${fmtGap(s.avgGap)}/mo`}
                      >
                        <div style={{ fontWeight: 600 }}>{s.wins}</div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                          /{s.slotsCovered}
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
