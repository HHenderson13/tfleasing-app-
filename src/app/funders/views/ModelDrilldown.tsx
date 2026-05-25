"use client";
import { useMemo, useState } from "react";
import type { Snapshot } from "../client";
import { fmtMoney, fmtGap, fmtMileage, gapTier, cheapestPerSlot, slotKey } from "../lib";

export function ModelDrilldown({
  snapshot,
  initialModel,
  onBack,
}: {
  snapshot: Snapshot;
  initialModel: string;
  onBack: () => void;
}) {
  const models = useMemo(
    () => Array.from(new Set(snapshot.rates.map((r) => r.model))).sort(),
    [snapshot]
  );
  const [model, setModel] = useState<string>(initialModel || models[0] || "");

  const modelRates = useMemo(
    () => snapshot.rates.filter((r) => r.model === model),
    [snapshot, model]
  );

  const terms = useMemo(
    () => Array.from(new Set(modelRates.map((r) => r.termMonths))).sort((a, b) => a - b),
    [modelRates]
  );
  const mileages = useMemo(
    () => Array.from(new Set(modelRates.map((r) => r.annualMileage))).sort((a, b) => a - b),
    [modelRates]
  );

  const [term, setTerm] = useState<number>(0); // 0 = all
  const [mileage, setMileage] = useState<number>(0); // 0 = all

  // If filters not set yet, default to first term + first mileage
  const effectiveTerm = term || terms[0] || 48;
  const effectiveMileage = mileage || mileages[0] || 10000;

  const filteredRates = useMemo(
    () =>
      modelRates.filter(
        (r) =>
          r.termMonths === effectiveTerm && r.annualMileage === effectiveMileage
      ),
    [modelRates, effectiveTerm, effectiveMileage]
  );

  const cheapest = useMemo(() => cheapestPerSlot(filteredRates), [filteredRates]);

  // Derivatives present in this filter
  const derivatives = useMemo(() => {
    const seen = new Map<string, { capCode: string; derivative: string }>();
    for (const r of filteredRates) {
      if (!seen.has(r.capCode)) {
        seen.set(r.capCode, { capCode: r.capCode, derivative: r.derivative });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.derivative.localeCompare(b.derivative)
    );
  }, [filteredRates]);

  // Order funders by wins for this filter
  const funderOrder = useMemo(() => {
    const wins: Record<string, number> = {};
    for (const d of derivatives) {
      const best = cheapest.get(
        slotKey({ capCode: d.capCode, termMonths: effectiveTerm, annualMileage: effectiveMileage })
      );
      if (best) wins[best.funderId] = (wins[best.funderId] || 0) + 1;
    }
    return snapshot.funders
      .filter((f) => filteredRates.some((r) => r.funderId === f.id))
      .sort((a, b) => (wins[b.id] || 0) - (wins[a.id] || 0));
  }, [snapshot.funders, filteredRates, derivatives, cheapest, effectiveTerm, effectiveMileage]);

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to overview</button>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="filter-group">
          <label className="filter-label">Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Term</label>
          <select value={effectiveTerm} onChange={(e) => setTerm(parseInt(e.target.value, 10))}>
            {terms.map((t) => (
              <option key={t} value={t}>{t} months</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Mileage / yr</label>
          <select value={effectiveMileage} onChange={(e) => setMileage(parseInt(e.target.value, 10))}>
            {mileages.map((m) => (
              <option key={m} value={m}>{m.toLocaleString()}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <div>
            <div className="table-card-title">{model} · {effectiveTerm}mo · {fmtMileage(effectiveMileage)}/yr</div>
            <div className="table-card-sub">
              {derivatives.length} derivative{derivatives.length === 1 ? "" : "s"} · {funderOrder.length} funder{funderOrder.length === 1 ? "" : "s"} covering · cheapest per row highlighted green
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 280 }}>Derivative</th>
                {funderOrder.map((f) => (
                  <th key={f.id} style={{ textAlign: "right" }}>{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {derivatives.map((d) => {
                const best = cheapest.get(
                  slotKey({ capCode: d.capCode, termMonths: effectiveTerm, annualMileage: effectiveMileage })
                );
                return (
                  <tr key={d.capCode}>
                    <td className="mname">{d.derivative}</td>
                    {funderOrder.map((f) => {
                      const r = filteredRates.find(
                        (x) => x.capCode === d.capCode && x.funderId === f.id
                      );
                      if (!r) {
                        return (
                          <td key={f.id} className="num none" style={{ textAlign: "right" }}>—</td>
                        );
                      }
                      const gap = best ? r.totalMonthly - best.totalMonthly : null;
                      const tier = gapTier(gap);
                      return (
                        <td
                          key={f.id}
                          className={`num ${tier}`}
                          style={{ textAlign: "right" }}
                        >
                          <div style={{ fontWeight: 600 }}>{fmtMoney(r.totalMonthly, 0)}</div>
                          {gap !== null && gap > 0 && (
                            <div style={{ fontSize: 10, opacity: 0.75 }}>
                              {fmtGap(gap)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
