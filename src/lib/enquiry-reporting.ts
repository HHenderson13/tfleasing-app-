import {
  ALLOCATION_TARGET_MINS,
  CONTACT_TARGET_MINS,
  dayKey,
  isOutcomeDueByHorizon,
} from "./business-hours";

export interface ReportingRow {
  enquiryAt: number;
  transferredAt: number | null;
  contactedAt: number | null;
  sameDayExpected: boolean;
  enquiryDay: string;
}

/** A missing transfer that is still inside the latest report's grace window. */
export function isAllocationPending(
  row: ReportingRow,
  reportHorizonWallMs: number | null,
): boolean {
  return row.transferredAt == null && !isOutcomeDueByHorizon(
    row.enquiryAt,
    reportHorizonWallMs,
    ALLOCATION_TARGET_MINS,
  );
}

/** A missing transfer old enough to be present in the latest daily export. */
export function isTransferMissing(
  row: ReportingRow,
  reportHorizonWallMs: number | null,
): boolean {
  return row.transferredAt == null && !isAllocationPending(row, reportHorizonWallMs);
}

/**
 * A missing contact that is still inside the latest report's grace window.
 * Once transferred, the 15-minute contact clock applies. If transfer is also
 * blank, allow the combined 5 + 15 minute operational targets before calling
 * the customer genuinely uncontacted.
 */
export function isContactPending(
  row: ReportingRow,
  reportHorizonWallMs: number | null,
): boolean {
  if (row.contactedAt != null) return false;
  const hasTransfer = row.transferredAt != null;
  return !isOutcomeDueByHorizon(
    row.transferredAt ?? row.enquiryAt,
    reportHorizonWallMs,
    hasTransfer ? CONTACT_TARGET_MINS : ALLOCATION_TARGET_MINS + CONTACT_TARGET_MINS,
  );
}

/** A blank contact old enough to be present in the latest daily export. */
export function isContactMissing(
  row: ReportingRow,
  reportHorizonWallMs: number | null,
): boolean {
  return row.contactedAt == null && !isContactPending(row, reportHorizonWallMs);
}

/** Any blank outcome still expected to arrive in a later daily export. */
export function isReportDataPending(
  row: ReportingRow,
  reportHorizonWallMs: number | null,
): boolean {
  return isAllocationPending(row, reportHorizonWallMs) ||
    isContactPending(row, reportHorizonWallMs);
}

/**
 * Same-day contact can only be judged once that enquiry day sits before the
 * exclusive report horizon. This stops today's incomplete data becoming an
 * immediate red miss.
 */
export function isSameDayReportable(
  row: ReportingRow,
  reportHorizonWallMs: number | null,
): boolean {
  if (!row.sameDayExpected) return false;
  if (reportHorizonWallMs == null || !Number.isFinite(reportHorizonWallMs)) return true;
  return row.enquiryDay < dayKey(reportHorizonWallMs);
}
