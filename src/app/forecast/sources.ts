// Source-tag constants. Kept in their own file so client components can
// import them without dragging in the DB layer from src/lib/forecast.ts.

export const DEALBOOK_SOURCES = ["leasing", "salary_sacrifice"] as const;
export type DealbookSource = (typeof DEALBOOK_SOURCES)[number];

export const DEALBOOK_SOURCE_LABELS: Record<DealbookSource, string> = {
  leasing: "Leasing",
  salary_sacrifice: "Salary Sacrifice",
};
