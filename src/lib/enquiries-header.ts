// The MotorComplete enquiry export — the file behind 10 at 10's Response
// times (formerly the Enquiry Tracker) — identified by its header row.
// Pure, so the upload router can tell it from the Dealerweb exports without
// pulling in the server-only store.

export const MOTORCOMPLETE_REQUIRED_HEADERS: ReadonlyArray<readonly [number, string]> = [
  [1, "created by"],        // B
  [2, "customer"],          // C
  [4, "date raised"],       // E
  [5, "type"],              // F
  [15, "date transferred"], // P
];

const normKey = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function isMotorCompleteExportHeader(header: readonly unknown[]): boolean {
  return MOTORCOMPLETE_REQUIRED_HEADERS.every(([idx, expected]) => normKey(header[idx]) === expected);
}
