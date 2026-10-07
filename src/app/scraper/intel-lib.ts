// Display helpers for the Intelligence tab. The comparison itself — slots,
// dedupe, gap and rank — lives in lib/market-slots.ts, where it is tested.
//
// Gap sign convention: gap = TF price − cheapest competitor, so a positive
// gap means we are dearer. It is DISPLAYED from our side: "-£9.01" reads as
// "£9.01 worse off", "+£20.00" as "£20 better".

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

export function gapCellClass(gap: number | null): string {
  if (gap === null) return "";
  return gap <= 0 ? "td-gap-neg" : gap <= 20 ? "td-gap-zero" : "td-gap-pos";
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

export function milesLabel(m: string): string {
  const n = parseInt(m, 10);
  return n >= 1000 ? `${Math.round(n / 1000)}k` : m;
}

export function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

// "Transit Custom 320 L1 Fwd" under range "Transit Custom" → "320 L1 Fwd".
// The range is already in the heading; repeating it on every row buries the
// part that differs.
export function modelShort(model: string, range: string): string {
  return model.toLowerCase().startsWith(range.toLowerCase())
    ? model.slice(range.length).trim()
    : model;
}
