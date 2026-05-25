import type { Rate, Funder, Snapshot } from "./client";

// A "slot" = a specific (capCode, term, mileage) combination — one real-world quote.
// Each slot has 0-many funder rates; the cheapest funder wins that slot.

export function slotKey(r: { capCode: string; termMonths: number; annualMileage: number }): string {
  return `${r.capCode}|${r.termMonths}|${r.annualMileage}`;
}

export function cheapestPerSlot(rates: Rate[]): Map<string, Rate> {
  const best = new Map<string, Rate>();
  for (const r of rates) {
    const k = slotKey(r);
    const cur = best.get(k);
    if (!cur || r.totalMonthly < cur.totalMonthly) best.set(k, r);
  }
  return best;
}

export interface FunderModelStats {
  funderId: string;
  slotsCovered: number;
  totalSlotsInModel: number;
  wins: number;
  avgRental: number | null;
  avgGap: number | null;   // mean of (mine − cheapest) across covered slots
  worstGap: number | null;
}

export interface ModelSummary {
  model: string;
  derivativeCount: number;
  slotCount: number; // # of unique (capCode, term, mileage) slots in this model
  funderStats: Record<string, FunderModelStats>;
  bestFunderId: string | null; // most wins
}

export function summariseByModel(snapshot: Snapshot): ModelSummary[] {
  const byModel: Record<string, Rate[]> = {};
  for (const r of snapshot.rates) {
    (byModel[r.model] ||= []).push(r);
  }

  const out: ModelSummary[] = [];
  for (const [model, modelRates] of Object.entries(byModel)) {
    const cheapest = cheapestPerSlot(modelRates);
    const slotKeys = Array.from(cheapest.keys());
    const derivCount = new Set(modelRates.map((r) => r.capCode)).size;

    const funderStats: Record<string, FunderModelStats> = {};
    for (const f of snapshot.funders) {
      const mine = modelRates.filter((r) => r.funderId === f.id);
      if (mine.length === 0) continue;
      let wins = 0,
        sumRental = 0,
        gapSum = 0,
        gapN = 0,
        worst = -Infinity;
      for (const r of mine) {
        sumRental += r.totalMonthly;
        const best = cheapest.get(slotKey(r));
        if (best) {
          if (best.funderId === f.id) wins++;
          const gap = r.totalMonthly - best.totalMonthly;
          gapSum += gap;
          gapN++;
          if (gap > worst) worst = gap;
        }
      }
      funderStats[f.id] = {
        funderId: f.id,
        slotsCovered: mine.length,
        totalSlotsInModel: slotKeys.length,
        wins,
        avgRental: mine.length > 0 ? sumRental / mine.length : null,
        avgGap: gapN > 0 ? gapSum / gapN : null,
        worstGap: worst === -Infinity ? null : worst,
      };
    }

    let bestFunderId: string | null = null;
    let bestWins = -1;
    for (const s of Object.values(funderStats)) {
      if (s.wins > bestWins) {
        bestWins = s.wins;
        bestFunderId = s.funderId;
      }
    }

    out.push({
      model,
      derivativeCount: derivCount,
      slotCount: slotKeys.length,
      funderStats,
      bestFunderId,
    });
  }

  return out.sort((a, b) => a.model.localeCompare(b.model));
}

export interface FunderOverallStats {
  funderId: string;
  funderName: string;
  slotsCovered: number;
  totalSlots: number;
  wins: number;
  avgRental: number;
  avgGap: number;
  worstGap: number;
}

export function summariseByFunder(snapshot: Snapshot): FunderOverallStats[] {
  const cheapest = cheapestPerSlot(snapshot.rates);
  const totalSlots = cheapest.size;

  const out: FunderOverallStats[] = [];
  for (const f of snapshot.funders) {
    const mine = snapshot.rates.filter((r) => r.funderId === f.id);
    if (mine.length === 0) continue;
    let wins = 0,
      sumRental = 0,
      gapSum = 0,
      gapN = 0,
      worst = -Infinity;
    for (const r of mine) {
      sumRental += r.totalMonthly;
      const best = cheapest.get(slotKey(r));
      if (best) {
        if (best.funderId === f.id) wins++;
        const gap = r.totalMonthly - best.totalMonthly;
        gapSum += gap;
        gapN++;
        if (gap > worst) worst = gap;
      }
    }
    out.push({
      funderId: f.id,
      funderName: f.name,
      slotsCovered: mine.length,
      totalSlots,
      wins,
      avgRental: mine.length > 0 ? sumRental / mine.length : 0,
      avgGap: gapN > 0 ? gapSum / gapN : 0,
      worstGap: worst === -Infinity ? 0 : worst,
    });
  }
  return out.sort((a, b) => b.wins - a.wins);
}

// Per-funder, per-model summary used by the Funder Compare model table.
export function summariseFunderByModel(
  snapshot: Snapshot,
  funderId: string
): Array<{
  model: string;
  slotsCovered: number;
  totalSlotsInModel: number;
  derivativeCount: number;
  wins: number;
  avgRental: number;
  avgGap: number;
  worstGap: number;
}> {
  const models = summariseByModel(snapshot);
  return models
    .map((m) => {
      const s = m.funderStats[funderId];
      if (!s) return null;
      return {
        model: m.model,
        slotsCovered: s.slotsCovered,
        totalSlotsInModel: m.slotCount,
        derivativeCount: m.derivativeCount,
        wins: s.wins,
        avgRental: s.avgRental ?? 0,
        avgGap: s.avgGap ?? 0,
        worstGap: s.worstGap ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// Per-funder, per-model, per-derivative summary — aggregates across all term × mileage slots.
export interface DerivativeRow {
  capCode: string;
  derivative: string;
  slotsCovered: number;
  totalSlots: number;
  wins: number;
  avgRental: number;
  avgGap: number;
  worstGap: number;
}

export function funderModelDerivatives(
  snapshot: Snapshot,
  funderId: string,
  model: string
): DerivativeRow[] {
  const modelRates = snapshot.rates.filter((r) => r.model === model);
  const cheapest = cheapestPerSlot(modelRates);

  // Group rates by capCode
  const byCap: Record<string, Rate[]> = {};
  for (const r of modelRates) {
    (byCap[r.capCode] ||= []).push(r);
  }

  const out: DerivativeRow[] = [];
  for (const [capCode, capRates] of Object.entries(byCap)) {
    const mine = capRates.filter((r) => r.funderId === funderId);
    if (mine.length === 0) continue;
    const totalSlots = new Set(capRates.map(slotKey)).size;
    let wins = 0,
      sumRental = 0,
      gapSum = 0,
      gapN = 0,
      worst = -Infinity;
    for (const r of mine) {
      sumRental += r.totalMonthly;
      const best = cheapest.get(slotKey(r));
      if (best) {
        if (best.funderId === funderId) wins++;
        const gap = r.totalMonthly - best.totalMonthly;
        gapSum += gap;
        gapN++;
        if (gap > worst) worst = gap;
      }
    }
    out.push({
      capCode,
      derivative: mine[0].derivative,
      slotsCovered: mine.length,
      totalSlots,
      wins,
      avgRental: mine.length > 0 ? sumRental / mine.length : 0,
      avgGap: gapN > 0 ? gapSum / gapN : 0,
      worstGap: worst === -Infinity ? 0 : worst,
    });
  }

  return out.sort((a, b) => a.derivative.localeCompare(b.derivative));
}

// For drill-down: every (derivative, term, mileage) slot for one model,
// comparing the chosen funder against the cheapest in that slot.
export interface SlotRow {
  capCode: string;
  derivative: string;
  termMonths: number;
  annualMileage: number;
  myRental: number;
  bestRental: number;
  bestFunderId: string;
  gap: number;
  isWinner: boolean;
}

export function funderModelSlots(
  snapshot: Snapshot,
  funderId: string,
  model: string
): SlotRow[] {
  const modelRates = snapshot.rates.filter((r) => r.model === model);
  const cheapest = cheapestPerSlot(modelRates);
  const mine = modelRates.filter((r) => r.funderId === funderId);
  return mine
    .map((r) => {
      const best = cheapest.get(slotKey(r));
      if (!best) return null;
      const gap = r.totalMonthly - best.totalMonthly;
      return {
        capCode: r.capCode,
        derivative: r.derivative,
        termMonths: r.termMonths,
        annualMileage: r.annualMileage,
        myRental: r.totalMonthly,
        bestRental: best.totalMonthly,
        bestFunderId: best.funderId,
        gap,
        isWinner: best.funderId === funderId,
      };
    })
    .filter((x): x is SlotRow => x !== null);
}

// ─── Coverage analysis ───────────────────────────────────────────────────
// Which funders cover which derivatives (capCodes). A derivative is "in
// scope" if any funder has rates for it.

export interface DerivativeInfo {
  capCode: string;
  model: string;
  derivative: string;
  coveredBy: string[];   // funderIds that have rates for this capCode
  missingFrom: string[]; // funderIds that don't have rates for this capCode
}

export function buildCoverage(snapshot: Snapshot): DerivativeInfo[] {
  const byCap = new Map<string, { model: string; derivative: string; funderIds: Set<string> }>();
  for (const r of snapshot.rates) {
    const cur = byCap.get(r.capCode);
    if (cur) cur.funderIds.add(r.funderId);
    else byCap.set(r.capCode, { model: r.model, derivative: r.derivative, funderIds: new Set([r.funderId]) });
  }
  const allFunderIds = snapshot.funders.map((f) => f.id);
  const out: DerivativeInfo[] = [];
  for (const [capCode, v] of byCap.entries()) {
    const covered = Array.from(v.funderIds);
    out.push({
      capCode,
      model: v.model,
      derivative: v.derivative,
      coveredBy: covered,
      missingFrom: allFunderIds.filter((id) => !v.funderIds.has(id)),
    });
  }
  return out.sort((a, b) => a.model.localeCompare(b.model) || a.derivative.localeCompare(b.derivative));
}

export interface FunderCoverageRow {
  funderId: string;
  funderName: string;
  covered: number;
  total: number;
  missing: number;
  pct: number;          // covered / total
  modelsFull: number;   // # models where funder covers every derivative
  modelsPartial: number;
  modelsMissing: number; // # models the funder doesn't cover at all
}

export interface ModelCoverageRow {
  model: string;
  totalDerivatives: number;
  perFunder: Record<
    string,
    { covered: number; missing: number; pct: number; status: "full" | "partial" | "none" }
  >;
}

export function summariseCoverage(snapshot: Snapshot): {
  byFunder: FunderCoverageRow[];
  byModel: ModelCoverageRow[];
  totalDerivatives: number;
} {
  const derivs = buildCoverage(snapshot);
  const total = derivs.length;

  // Group derivatives by model for per-model breakdown
  const byModelDerivs = new Map<string, DerivativeInfo[]>();
  for (const d of derivs) {
    if (!byModelDerivs.has(d.model)) byModelDerivs.set(d.model, []);
    byModelDerivs.get(d.model)!.push(d);
  }

  // Per-funder summary
  const byFunder: FunderCoverageRow[] = [];
  for (const f of snapshot.funders) {
    let covered = 0,
      modelsFull = 0,
      modelsPartial = 0,
      modelsMissing = 0;
    for (const [, modelDerivs] of byModelDerivs.entries()) {
      const inModel = modelDerivs.filter((d) => d.coveredBy.includes(f.id)).length;
      covered += inModel;
      if (inModel === modelDerivs.length) modelsFull++;
      else if (inModel === 0) modelsMissing++;
      else modelsPartial++;
    }
    byFunder.push({
      funderId: f.id,
      funderName: f.name,
      covered,
      total,
      missing: total - covered,
      pct: total > 0 ? covered / total : 0,
      modelsFull,
      modelsPartial,
      modelsMissing,
    });
  }
  byFunder.sort((a, b) => b.pct - a.pct);

  // Per-model breakdown
  const byModel: ModelCoverageRow[] = [];
  for (const [model, modelDerivs] of byModelDerivs.entries()) {
    const perFunder: ModelCoverageRow["perFunder"] = {};
    for (const f of snapshot.funders) {
      const covered = modelDerivs.filter((d) => d.coveredBy.includes(f.id)).length;
      const totalM = modelDerivs.length;
      const missing = totalM - covered;
      let status: "full" | "partial" | "none" = "full";
      if (covered === 0) status = "none";
      else if (covered < totalM) status = "partial";
      perFunder[f.id] = {
        covered,
        missing,
        pct: totalM > 0 ? covered / totalM : 0,
        status,
      };
    }
    byModel.push({
      model,
      totalDerivatives: modelDerivs.length,
      perFunder,
    });
  }
  byModel.sort((a, b) => a.model.localeCompare(b.model));

  return { byFunder, byModel, totalDerivatives: total };
}

export function funderName(funders: Funder[], id: string): string {
  return funders.find((f) => f.id === id)?.name || id;
}

export function fmtMoney(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtGap(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  if (Math.abs(n) < 0.5) return "£0";
  return (n > 0 ? "+" : "−") + "£" + Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

export function gapTier(gap: number | null): "best" | "good" | "mid" | "bad" | "none" {
  if (gap === null || !isFinite(gap)) return "none";
  if (gap <= 0) return "best";
  if (gap <= 10) return "good";
  if (gap <= 30) return "mid";
  return "bad";
}

export function fmtMileage(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(0)}k` : String(m);
}
