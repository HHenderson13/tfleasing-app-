// Department tags for dealbook uploads.
//
// Two sources: the Lease dealbook (which mixes cars + commercial in a
// single file — the Car/Van split happens by matching each line's model
// to a vehicle in the Admin → Vehicles list) and the Salary Sacrifice
// dealbook (also classified per-line, but tracked as its own source so
// it can be reported separately in the future).

export const DEPARTMENTS = [
  "lease",
  "salary_sacrifice",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  lease: "Lease",
  salary_sacrifice: "Salary Sacrifice",
};

export const DEPARTMENT_DESCRIPTIONS: Record<Department, string> = {
  lease: "Lease New Cars + Lease New Commercial — split by vehicle.",
  salary_sacrifice: "Salary Sacrifice dealbook.",
};

// Older code referred to these as "sources" — keep aliases.
export const DEALBOOK_SOURCES = DEPARTMENTS;
export type DealbookSource = Department;
export const DEALBOOK_SOURCE_LABELS = DEPARTMENT_LABELS;
