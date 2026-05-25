"use client";

// Mirrors the Flask app's scoring algorithm verbatim — see static/index.html.
// Field names are camelCase here because the cloud API serves results in camelCase.

export interface ScrapedResult {
  id: number;
  runId: string;
  manufacturer?: string | null;
  range?: string | null;
  model?: string | null;
  derivative?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  bodyStyle?: string | null;
  trim?: string | null;
  monthlyPriceGbp?: number | null;
  initialRentalGbp?: number | null;
  totalLeaseCostGbp?: number | null;
  additionalFeesGbp?: number | null;
  contractLengthMonths?: number | null;
  annualMileage?: number | null;
  depositMonths?: number | null;
  brokerDealerName?: string | null;
  advertiserCategory?: string | null;
  inStock?: string | null;
  financeType?: string | null;
  dealIdentifier?: string | null;
  leasingUrl?: string | null;
}

const TF_NAMES = ["trustford", "trustford transit centre"];

export function isTrustFord(name?: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return TF_NAMES.some((n) => lower.includes(n));
}

export function normKey(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function termOf(r: ScrapedResult): string {
  return normKey(r.contractLengthMonths);
}

export function mileageOf(r: ScrapedResult): string {
  return normKey(r.annualMileage);
}

export interface SlotDetail {
  deriv: string;
  term: string;
  mil: string;
  tfAvg: number;
  mktBest: number;
  gap: number;
}

export interface AvgResult {
  tfAvg: number | null;
  mktAvg: number | null;
  gap: number | null;
  count: number;
  details: SlotDetail[];
}

export function lflAvg(tfRows: ScrapedResult[], mktRows: ScrapedResult[]): AvgResult {
  const tfSlot: Record<string, number> = {};
  const tfCount: Record<string, number> = {};
  for (const r of tfRows) {
    const key = `${r.derivative}||${termOf(r)}||${mileageOf(r)}`;
    const p = Number(r.monthlyPriceGbp);
    if (isNaN(p) || p <= 0) continue;
    tfSlot[key] = (tfSlot[key] || 0) + p;
    tfCount[key] = (tfCount[key] || 0) + 1;
  }

  const mktBest: Record<string, number> = {};
  for (const r of mktRows) {
    const key = `${r.derivative}||${termOf(r)}||${mileageOf(r)}`;
    const p = Number(r.monthlyPriceGbp);
    if (isNaN(p) || p <= 0) continue;
    if (mktBest[key] === undefined || p < mktBest[key]) mktBest[key] = p;
  }

  const sharedKeys = Object.keys(tfSlot).filter((k) => mktBest[k] !== undefined);
  if (sharedKeys.length === 0) {
    return { tfAvg: null, mktAvg: null, gap: null, count: 0, details: [] };
  }

  let tfSum = 0,
    mktSum = 0;
  const details: SlotDetail[] = [];
  for (const key of sharedKeys) {
    const tf = tfSlot[key] / tfCount[key];
    const mkt = mktBest[key];
    tfSum += tf;
    mktSum += mkt;
    const [deriv, term, mil] = key.split("||");
    details.push({ deriv, term, mil, tfAvg: tf, mktBest: mkt, gap: tf - mkt });
  }

  const count = sharedKeys.length;
  return {
    tfAvg: tfSum / count,
    mktAvg: mktSum / count,
    gap: (tfSum - mktSum) / count,
    count,
    details,
  };
}

export function lflByTerm(
  tfRows: ScrapedResult[],
  mktRows: ScrapedResult[],
  term: string | number
): AvgResult {
  const target = normKey(term);
  return lflAvg(
    tfRows.filter((r) => termOf(r) === target),
    mktRows.filter((r) => termOf(r) === target)
  );
}

export type GapClass = "leading" | "close" | "behind" | "not-competing";

export function gapClass(gap: number | null): GapClass {
  if (gap === null) return "not-competing";
  if (gap <= -20) return "leading";
  if (gap <= 0) return "close";
  return "behind";
}

export function badgeText(sc: GapClass): string {
  return ({
    leading: "Well Priced",
    close: "Competitive",
    behind: "Behind",
    "not-competing": "No Deals",
  } as const)[sc];
}

export function hmClass(gap: number | null): string {
  if (gap === null) return "hm-none";
  if (gap <= 0) return "hm-good";
  if (gap <= 20) return "hm-ok";
  return "hm-behind";
}

export function gapStr(gap: number | null): string {
  if (gap === null) return "—";
  return (gap > 0 ? "-£" : "+£") + Math.abs(gap).toFixed(2);
}

export function gapColor(gap: number | null): string {
  if (gap === null) return "var(--text3)";
  if (gap <= 0) return "#16a34a";
  if (gap <= 20) return "#d97706";
  return "#dc2626";
}
