"use client";
import { useMemo, useState } from "react";
import type { Snapshot } from "../client";
import {
  summariseByFunder,
  summariseFunderByModel,
  funderModelDerivatives,
  funderModelSlots,
  fmtMoney,
  fmtGap,
  fmtMileage,
  gapTier,
  funderName,
} from "../lib";

type SortMode = "gap-desc" | "gap-asc" | "model" | "rental-asc";
type DerivSort = "gap-desc" | "gap-asc" | "deriv" | "rental-asc";
type SlotSort = "gap-desc" | "gap-asc" | "term-mileage";

export function FunderCompare({
  snapshot,
  initialFunderId,
  onBack,
}: {
  snapshot: Snapshot;
  initialFunderId: string;
  onBack: () => void;
}) {
  const overall = useMemo(() => summariseByFunder(snapshot), [snapshot]);
  const availableFunders = overall.map((s) => ({ id: s.funderId, name: s.funderName }));

  const [funderId, setFunderId] = useState<string>(
    initialFunderId || availableFunders[0]?.id || ""
  );
  const [drillModel, setDrillModel] = useState<string | null>(null);
  const [drillDerivative, setDrillDerivative] = useState<{ capCode: string; derivative: string } | null>(null);

  const funder = snapshot.funders.find((f) => f.id === funderId);
  const overallStats = overall.find((s) => s.funderId === funderId);

  if (!funder || !overallStats) {
    return (
      <>
        <button className="back-link" onClick={onBack}>← Back to overview</button>
        <div className="empty">Pick a funder above.</div>
      </>
    );
  }

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to overview</button>

      <div style={{ marginBottom: 18 }}>
        <div className="filter-label" style={{ marginBottom: 6 }}>Compare funder</div>
        <div className="chips">
          {availableFunders.map((f) => (
            <button
              key={f.id}
              className={`chip ${f.id === funderId ? "active" : ""}`}
              onClick={() => {
                setFunderId(f.id);
                setDrillModel(null);
                setDrillDerivative(null);
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      {!drillModel && (
        <ModelSummary
          snapshot={snapshot}
          funderId={funderId}
          funderName={funder.name}
          overall={overallStats}
          onPickModel={(m) => setDrillModel(m)}
        />
      )}

      {drillModel && !drillDerivative && (
        <DerivativeSummary
          snapshot={snapshot}
          funderId={funderId}
          funderName={funder.name}
          model={drillModel}
          onBack={() => setDrillModel(null)}
          onPickDerivative={(d) => setDrillDerivative(d)}
        />
      )}

      {drillModel && drillDerivative && (
        <DerivativeDetail
          snapshot={snapshot}
          funderId={funderId}
          funderName={funder.name}
          model={drillModel}
          derivative={drillDerivative}
          onBack={() => setDrillDerivative(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 1 — model summary
// ═══════════════════════════════════════════════════════════════════════════
function ModelSummary({
  snapshot,
  funderId,
  funderName: fname,
  overall,
  onPickModel,
}: {
  snapshot: Snapshot;
  funderId: string;
  funderName: string;
  overall: ReturnType<typeof summariseByFunder>[number];
  onPickModel: (model: string) => void;
}) {
  const [sort, setSort] = useState<SortMode>("gap-desc");

  const byModel = useMemo(
    () => summariseFunderByModel(snapshot, funderId),
    [snapshot, funderId]
  );

  const sorted = useMemo(() => {
    const copy = [...byModel];
    if (sort === "gap-desc") copy.sort((a, b) => b.avgGap - a.avgGap);
    else if (sort === "gap-asc") copy.sort((a, b) => a.avgGap - b.avgGap);
    else if (sort === "model") copy.sort((a, b) => a.model.localeCompare(b.model));
    else if (sort === "rental-asc") copy.sort((a, b) => a.avgRental - b.avgRental);
    return copy;
  }, [byModel, sort]);

  const totals = {
    wins: overall.wins,
    slots: overall.slotsCovered,
    total: overall.totalSlots,
    avgGap: overall.avgGap,
    worstGap: overall.worstGap,
    avgRental: overall.avgRental,
    winPct: overall.totalSlots > 0 ? (overall.wins / overall.totalSlots) * 100 : 0,
  };

  return (
    <>
      <div className="summary-cards">
        <div className="sum-card">
          <div className="sum-val">{totals.wins.toLocaleString()}</div>
          <div className="sum-lbl">{fname} is #1 ({totals.winPct.toFixed(0)}%)</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">
            {totals.slots.toLocaleString()} <span style={{ color: "var(--fc-text3)", fontSize: 14, fontWeight: 500 }}>/ {totals.total.toLocaleString()}</span>
          </div>
          <div className="sum-lbl">Slots covered</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{fmtMoney(totals.avgRental, 0)}</div>
          <div className="sum-lbl">Avg monthly rental</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: totals.avgGap <= 5 ? "var(--fc-green)" : totals.avgGap <= 20 ? "var(--fc-amber)" : "var(--fc-red)" }}>
            {fmtGap(totals.avgGap)}/mo
          </div>
          <div className="sum-lbl">Avg gap vs cheapest</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: "var(--fc-red)" }}>
            {fmtGap(totals.worstGap)}/mo
          </div>
          <div className="sum-lbl">Worst single gap</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <div>
            <div className="table-card-title">{fname} — by model</div>
            <div className="table-card-sub">
              Aggregated across all derivatives, terms & mileages. Click a model to see derivatives.
            </div>
          </div>
          <div>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="gap-desc">Worst gap first</option>
              <option value="gap-asc">Best (most wins) first</option>
              <option value="model">Model A–Z</option>
              <option value="rental-asc">Cheapest avg rental first</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th style={{ textAlign: "right" }}>#1 wins</th>
                <th style={{ textAlign: "right" }}>Slots covered</th>
                <th style={{ textAlign: "right" }}>Avg rental</th>
                <th style={{ textAlign: "right" }}>Avg gap vs best</th>
                <th style={{ textAlign: "right" }}>Worst gap</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const tier =
                  m.avgGap <= 0 ? "best" :
                  m.avgGap <= 10 ? "good" :
                  m.avgGap <= 30 ? "mid" : "bad";
                const winPct = m.slotsCovered > 0 ? (m.wins / m.slotsCovered) * 100 : 0;
                return (
                  <tr key={m.model} className="clickable" onClick={() => onPickModel(m.model)}>
                    <td className="mname">{m.model}</td>
                    <td className="num">
                      <strong>{m.wins}</strong>{" "}
                      <span style={{ color: "var(--fc-text3)" }}>({winPct.toFixed(0)}%)</span>
                    </td>
                    <td className="num">
                      {m.slotsCovered} / {m.totalSlotsInModel}
                    </td>
                    <td className="num">{fmtMoney(m.avgRental, 0)}</td>
                    <td className={`num ${tier}`}>{fmtGap(m.avgGap)}/mo</td>
                    <td className="num bad">{fmtGap(m.worstGap)}/mo</td>
                    <td style={{ color: "var(--fc-text3)", fontSize: 11 }}>Drill in →</td>
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

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 2 — derivative summary (averages across term × mileage)
// ═══════════════════════════════════════════════════════════════════════════
function DerivativeSummary({
  snapshot,
  funderId,
  funderName: fname,
  model,
  onBack,
  onPickDerivative,
}: {
  snapshot: Snapshot;
  funderId: string;
  funderName: string;
  model: string;
  onBack: () => void;
  onPickDerivative: (d: { capCode: string; derivative: string }) => void;
}) {
  const [sort, setSort] = useState<DerivSort>("gap-desc");
  const derivs = useMemo(
    () => funderModelDerivatives(snapshot, funderId, model),
    [snapshot, funderId, model]
  );

  const sorted = useMemo(() => {
    const copy = [...derivs];
    if (sort === "gap-desc") copy.sort((a, b) => b.avgGap - a.avgGap);
    else if (sort === "gap-asc") copy.sort((a, b) => a.avgGap - b.avgGap);
    else if (sort === "deriv") copy.sort((a, b) => a.derivative.localeCompare(b.derivative));
    else if (sort === "rental-asc") copy.sort((a, b) => a.avgRental - b.avgRental);
    return copy;
  }, [derivs, sort]);

  const summary = useMemo(() => {
    const wins = derivs.reduce((s, d) => s + d.wins, 0);
    const slots = derivs.reduce((s, d) => s + d.slotsCovered, 0);
    const totalSlots = derivs.reduce((s, d) => s + d.totalSlots, 0);
    const avgGap = derivs.length ? derivs.reduce((s, d) => s + d.avgGap, 0) / derivs.length : 0;
    const worstGap = derivs.length ? Math.max(...derivs.map((d) => d.worstGap)) : 0;
    const avgRental = derivs.length ? derivs.reduce((s, d) => s + d.avgRental, 0) / derivs.length : 0;
    return { wins, slots, totalSlots, avgGap, worstGap, avgRental, count: derivs.length };
  }, [derivs]);

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to {fname} models</button>

      <div className="summary-cards">
        <div className="sum-card">
          <div className="sum-val">{summary.count}</div>
          <div className="sum-lbl">{model} derivatives</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{summary.wins} / {summary.slots}</div>
          <div className="sum-lbl">{fname} is #1</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{fmtMoney(summary.avgRental, 0)}</div>
          <div className="sum-lbl">Avg rental</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: summary.avgGap <= 5 ? "var(--fc-green)" : summary.avgGap <= 20 ? "var(--fc-amber)" : "var(--fc-red)" }}>
            {fmtGap(summary.avgGap)}/mo
          </div>
          <div className="sum-lbl">Avg gap vs cheapest</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: "var(--fc-red)" }}>
            {fmtGap(summary.worstGap)}/mo
          </div>
          <div className="sum-lbl">Worst single gap</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <div>
            <div className="table-card-title">{fname} — {model} derivatives</div>
            <div className="table-card-sub">
              Averaged across all term × mileage combos. Click a derivative to see the term × mileage breakdown.
            </div>
          </div>
          <div>
            <select value={sort} onChange={(e) => setSort(e.target.value as DerivSort)}>
              <option value="gap-desc">Worst gap first</option>
              <option value="gap-asc">Best (wins) first</option>
              <option value="deriv">Derivative A–Z</option>
              <option value="rental-asc">Cheapest avg rental first</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 320 }}>Derivative</th>
                <th style={{ textAlign: "right" }}>#1 wins</th>
                <th style={{ textAlign: "right" }}>Slots covered</th>
                <th style={{ textAlign: "right" }}>Avg rental</th>
                <th style={{ textAlign: "right" }}>Avg gap vs best</th>
                <th style={{ textAlign: "right" }}>Worst gap</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const tier =
                  d.avgGap <= 0 ? "best" :
                  d.avgGap <= 10 ? "good" :
                  d.avgGap <= 30 ? "mid" : "bad";
                const winPct = d.slotsCovered > 0 ? (d.wins / d.slotsCovered) * 100 : 0;
                return (
                  <tr
                    key={d.capCode}
                    className="clickable"
                    onClick={() => onPickDerivative({ capCode: d.capCode, derivative: d.derivative })}
                  >
                    <td className="mname">{d.derivative}</td>
                    <td className="num">
                      <strong>{d.wins}</strong>{" "}
                      <span style={{ color: "var(--fc-text3)" }}>({winPct.toFixed(0)}%)</span>
                    </td>
                    <td className="num">
                      {d.slotsCovered} / {d.totalSlots}
                    </td>
                    <td className="num">{fmtMoney(d.avgRental, 0)}</td>
                    <td className={`num ${tier}`}>{fmtGap(d.avgGap)}/mo</td>
                    <td className="num bad">{fmtGap(d.worstGap)}/mo</td>
                    <td style={{ color: "var(--fc-text3)", fontSize: 11 }}>Term × mileage →</td>
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

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 3 — single derivative, term × mileage breakdown
// ═══════════════════════════════════════════════════════════════════════════
function DerivativeDetail({
  snapshot,
  funderId,
  funderName: fname,
  model,
  derivative,
  onBack,
}: {
  snapshot: Snapshot;
  funderId: string;
  funderName: string;
  model: string;
  derivative: { capCode: string; derivative: string };
  onBack: () => void;
}) {
  const allSlots = useMemo(
    () => funderModelSlots(snapshot, funderId, model),
    [snapshot, funderId, model]
  );
  const slots = useMemo(
    () => allSlots.filter((s) => s.capCode === derivative.capCode),
    [allSlots, derivative.capCode]
  );

  const [sort, setSort] = useState<SlotSort>("term-mileage");
  const [selectedSlot, setSelectedSlot] = useState<{ termMonths: number; annualMileage: number } | null>(null);

  const terms = useMemo(
    () => Array.from(new Set(slots.map((s) => s.termMonths))).sort((a, b) => a - b),
    [slots]
  );
  const mileages = useMemo(
    () => Array.from(new Set(slots.map((s) => s.annualMileage))).sort((a, b) => a - b),
    [slots]
  );

  // All funder rates for the currently-selected slot (capCode + term + mileage)
  const slotComparison = useMemo(() => {
    if (!selectedSlot) return null;
    const matches = snapshot.rates.filter(
      (r) =>
        r.capCode === derivative.capCode &&
        r.termMonths === selectedSlot.termMonths &&
        r.annualMileage === selectedSlot.annualMileage
    );
    const sorted = [...matches].sort((a, b) => a.totalMonthly - b.totalMonthly);
    const cheapest = sorted[0]?.totalMonthly ?? 0;
    return sorted.map((r, i) => ({
      rank: i + 1,
      funderId: r.funderId,
      funderName: funderName(snapshot.funders, r.funderId),
      monthlyRental: r.monthlyRental,
      monthlyMaintenance: r.monthlyMaintenance,
      totalMonthly: r.totalMonthly,
      gapVsBest: r.totalMonthly - cheapest,
      isSelected: r.funderId === funderId,
      isCheapest: i === 0,
    }));
  }, [selectedSlot, snapshot, derivative.capCode, funderId]);

  const sorted = useMemo(() => {
    const copy = [...slots];
    if (sort === "gap-desc") copy.sort((a, b) => b.gap - a.gap);
    else if (sort === "gap-asc") copy.sort((a, b) => a.gap - b.gap);
    else if (sort === "term-mileage")
      copy.sort((a, b) => a.termMonths - b.termMonths || a.annualMileage - b.annualMileage);
    return copy;
  }, [slots, sort]);

  const summary = useMemo(() => {
    const wins = slots.filter((s) => s.isWinner).length;
    const avgGap = slots.length ? slots.reduce((s, r) => s + r.gap, 0) / slots.length : 0;
    const worstGap = slots.length ? Math.max(...slots.map((r) => r.gap)) : 0;
    const avgRental = slots.length ? slots.reduce((s, r) => s + r.myRental, 0) / slots.length : 0;
    return { wins, total: slots.length, avgGap, worstGap, avgRental };
  }, [slots]);

  return (
    <>
      <button className="back-link" onClick={onBack}>← Back to {model} derivatives</button>

      <div className="summary-cards">
        <div className="sum-card">
          <div className="sum-val">{summary.wins} / {summary.total}</div>
          <div className="sum-lbl">{fname} is #1</div>
        </div>
        <div className="sum-card">
          <div className="sum-val">{fmtMoney(summary.avgRental, 0)}</div>
          <div className="sum-lbl">Avg rental</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: summary.avgGap <= 5 ? "var(--fc-green)" : summary.avgGap <= 20 ? "var(--fc-amber)" : "var(--fc-red)" }}>
            {fmtGap(summary.avgGap)}/mo
          </div>
          <div className="sum-lbl">Avg gap vs cheapest</div>
        </div>
        <div className="sum-card">
          <div className="sum-val" style={{ color: "var(--fc-red)" }}>
            {fmtGap(summary.worstGap)}/mo
          </div>
          <div className="sum-lbl">Worst gap</div>
        </div>
      </div>

      <div className="table-card" style={{ marginBottom: 20 }}>
        <div className="table-card-header">
          <div>
            <div className="table-card-title">{fname} vs cheapest — term × mileage grid</div>
            <div className="table-card-sub">
              {model} · {derivative.derivative} · click any cell to compare all funders for that slot
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Term \ Mileage</th>
                {mileages.map((m) => (
                  <th key={m} style={{ textAlign: "center" }}>{fmtMileage(m)}/yr</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t}>
                  <td className="mname">{t}mo</td>
                  {mileages.map((m) => {
                    const s = slots.find(
                      (x) => x.termMonths === t && x.annualMileage === m
                    );
                    if (!s) {
                      return (
                        <td key={m} className="num none" style={{ textAlign: "center" }}>—</td>
                      );
                    }
                    const tier = gapTier(s.gap);
                    const isSel =
                      selectedSlot?.termMonths === t && selectedSlot?.annualMileage === m;
                    return (
                      <td
                        key={m}
                        className={`num ${tier}`}
                        style={{
                          textAlign: "center",
                          cursor: "pointer",
                          outline: isSel ? "2px solid var(--fc-accent)" : undefined,
                          outlineOffset: isSel ? "-2px" : undefined,
                        }}
                        onClick={() =>
                          setSelectedSlot(
                            isSel ? null : { termMonths: t, annualMileage: m }
                          )
                        }
                        title={s.isWinner ? "Cheapest" : `+${s.gap.toFixed(0)}/mo vs ${funderName(snapshot.funders, s.bestFunderId)}`}
                      >
                        <div style={{ fontWeight: 600 }}>{fmtMoney(s.myRental, 0)}</div>
                        {!s.isWinner && (
                          <div style={{ fontSize: 10, opacity: 0.75 }}>{fmtGap(s.gap)}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSlot && slotComparison && (
        <div className="table-card" style={{ marginBottom: 20, borderColor: "var(--fc-accent)" }}>
          <div className="table-card-header">
            <div>
              <div className="table-card-title">
                Funder ranking — {selectedSlot.termMonths}mo · {fmtMileage(selectedSlot.annualMileage)}/yr
              </div>
              <div className="table-card-sub">
                Every funder's rate for this exact slot, sorted by cheapest. {fname} highlighted.
              </div>
            </div>
            <button className="logout-btn" onClick={() => setSelectedSlot(null)}>✕ Close</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "center", width: 50 }}>#</th>
                  <th>Funder</th>
                  <th style={{ textAlign: "right" }}>Rental</th>
                  <th style={{ textAlign: "right" }}>Maintenance</th>
                  <th style={{ textAlign: "right" }}>Total /mo</th>
                  <th style={{ textAlign: "right" }}>vs Cheapest</th>
                </tr>
              </thead>
              <tbody>
                {slotComparison.map((r) => {
                  const tier = gapTier(r.gapVsBest);
                  return (
                    <tr
                      key={r.funderId}
                      style={{
                        background: r.isSelected ? "var(--fc-accent-glow)" : undefined,
                      }}
                    >
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{r.rank}</td>
                      <td className="fname">
                        {r.funderName}
                        {r.isSelected && (
                          <span className="pill pill-best" style={{ marginLeft: 8 }}>You</span>
                        )}
                        {r.isCheapest && !r.isSelected && (
                          <span className="pill pill-best" style={{ marginLeft: 8 }}>★ Cheapest</span>
                        )}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {fmtMoney(r.monthlyRental, 2)}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.monthlyMaintenance > 0 ? fmtMoney(r.monthlyMaintenance, 2) : "—"}
                      </td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                        {fmtMoney(r.totalMonthly, 2)}
                      </td>
                      <td className={`num ${tier}`} style={{ textAlign: "right", fontWeight: 600 }}>
                        {r.isCheapest ? "—" : fmtGap(r.gapVsBest) + "/mo"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="table-card-header">
          <div>
            <div className="table-card-title">All slots — list view</div>
            <div className="table-card-sub">Same data as the grid above, as a sortable list</div>
          </div>
          <div>
            <select value={sort} onChange={(e) => setSort(e.target.value as SlotSort)}>
              <option value="term-mileage">Term &amp; mileage</option>
              <option value="gap-desc">Worst gap first</option>
              <option value="gap-asc">Best (wins) first</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>Term</th>
                <th style={{ textAlign: "center" }}>Mileage</th>
                <th style={{ textAlign: "right" }}>{fname}</th>
                <th style={{ textAlign: "right" }}>Cheapest</th>
                <th>Cheapest funder</th>
                <th style={{ textAlign: "right" }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const tier = gapTier(s.gap);
                const isSel =
                  selectedSlot?.termMonths === s.termMonths &&
                  selectedSlot?.annualMileage === s.annualMileage;
                return (
                  <tr
                    key={`${s.termMonths}-${s.annualMileage}-${i}`}
                    className="clickable"
                    style={{ background: isSel ? "var(--fc-accent-glow)" : undefined }}
                    onClick={() =>
                      setSelectedSlot(
                        isSel ? null : { termMonths: s.termMonths, annualMileage: s.annualMileage }
                      )
                    }
                  >
                    <td style={{ textAlign: "center" }}>{s.termMonths}mo</td>
                    <td style={{ textAlign: "center" }}>{fmtMileage(s.annualMileage)}/yr</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                      {fmtMoney(s.myRental, 0)}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {fmtMoney(s.bestRental, 0)}
                    </td>
                    <td>
                      <span className={s.isWinner ? "pill pill-best" : "pill pill-mid"}>
                        {s.isWinner ? `${fname} ★` : funderName(snapshot.funders, s.bestFunderId)}
                      </span>
                    </td>
                    <td className={`num ${tier}`} style={{ textAlign: "right", fontWeight: 600 }}>
                      {s.isWinner ? "—" : fmtGap(s.gap)}/mo
                    </td>
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
