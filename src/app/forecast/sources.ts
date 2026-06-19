// Department tags for dealbook uploads. Each upload is tagged with one
// of these so the monthly + quarterly views can roll up the right slice.
//
// The DB column is still called `source` (no migration needed), but the
// values are the new department list — there's no legacy data on prod
// because the feature shipped after this constant was introduced.

export const DEPARTMENTS = [
  "lease_new_cars",
  "lease_new_commercial",
  "salary_sacrifice",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  lease_new_cars: "Lease New Cars",
  lease_new_commercial: "Lease New Commercial",
  salary_sacrifice: "Salary Sacrifice",
};

// Older code referred to these as "sources" — keep aliases so server
// callers don't all have to rename at once.
export const DEALBOOK_SOURCES = DEPARTMENTS;
export type DealbookSource = Department;
export const DEALBOOK_SOURCE_LABELS = DEPARTMENT_LABELS;
