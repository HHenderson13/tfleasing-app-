// Period helpers shared by server + client. Kept out of pickers.tsx
// because that file is "use client" and a server component (the
// quarterly page) needs to call monthsOfPeriod at request time —
// importing a non-React function from a client module turns it into a
// non-callable stub on the server.

export type ForecastPeriod = "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "H2" | "FY";

// 1-indexed months in the active period. FY = 1..12; H1 = 1..6;
// H2 = 7..12; Q1-Q4 = three months each starting from the quarter's
// first month.
export function monthsOfPeriod(period: ForecastPeriod): number[] {
  if (period === "FY") return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (period === "H1") return [1, 2, 3, 4, 5, 6];
  if (period === "H2") return [7, 8, 9, 10, 11, 12];
  const q = parseInt(period.slice(1), 10);
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}
