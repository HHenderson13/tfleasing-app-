import { ALLOCATION_TARGET_MINS, CONTACT_TARGET_MINS, isEnquiryReportable, reportableAfter } from "./business-hours";

export interface ReportingRow {
  enquiryAt: number;
  transferredAt: number | null;
  contactedAt: number | null;
  sameDayExpected: boolean;
  enquiryDay: string;
}

/**
 * Split enquiries into the ones the report may judge and the ones still
 * being worked.
 *
 * The rule is deliberately blunt: an enquiry is only reportable once a
 * full working day has closed since its clock started (see
 * reportableAfter). Everything else is held back until the next upload.
 *
 * This is stricter than grading each field on its own target, and it is
 * the right trade. The export is a daily snapshot, so a lead raised this
 * morning has a blank contact field simply because nobody has finished
 * working it yet — not because it was missed. Judging on partial data
 * makes every morning look like a failure and the numbers drift all day
 * as the team catches up. Holding the whole enquiry back until it has had
 * a fair day means every figure on the page is final.
 *
 * The practical effect: a Saturday or Sunday enquiry viewed on Monday is
 * held, because its clock only starts Monday 09:00 and Monday has not
 * closed. It appears in the report on Tuesday. The same one-working-day
 * lag applies right through the week.
 */
export function partitionByReportability<T extends ReportingRow>(
  rows: readonly T[],
  reportHorizonWallMs: number | null,
): { reportable: T[]; held: T[] } {
  const reportable: T[] = [];
  const held: T[] = [];
  for (const r of rows) {
    if (isEnquiryReportable(r.enquiryAt, reportHorizonWallMs)) reportable.push(r);
    else held.push(r);
  }
  return { reportable, held };
}

/** The enquiry has no transfer recorded and has had a full working day. */
export function isTransferMissing(row: ReportingRow): boolean {
  return row.transferredAt == null;
}

/** The enquiry has no contact recorded and has had a full working day. */
export function isContactMissing(row: ReportingRow): boolean {
  return row.contactedAt == null;
}

/**
 * Same-day contact is judged for any reportable enquiry that was in scope
 * (weekday, before 17:30). Reportability already guarantees the day has
 * closed, so no extra horizon check is needed here.
 */
export function isSameDayReportable(row: ReportingRow): boolean {
  return row.sameDayExpected;
}

/** When a held-back enquiry will become reportable — for the UI note. */
export function heldUntil(row: ReportingRow): number {
  return reportableAfter(row.enquiryAt);
}

// ─── Summary ───────────────────────────────────────────────────────────

export interface ResponseRow extends ReportingRow {
  allocMins: number | null;
  contactMins: number | null;
  sameDayMet: boolean;
}

export interface ResponseSummary {
  total: number;
  allocMeasured: number;
  allocHit: number;
  allocMissed: number;
  allocAvg: number | null;
  contactMeasured: number;
  contactHit: number;
  contactMissed: number;
  contactAvg: number | null;
  neverContacted: number;
  noTransfer: number;
  sameDayExpected: number;
  sameDayMet: number;
  sameDayMissed: number;
}

/**
 * Response-time figures for a set of REPORTABLE enquiries (see
 * partitionByReportability): every row has had a full working day, so a
 * blank transfer or contact is a genuine miss rather than data in flight.
 * Allocation is sales support's clock (raised → transferred); contact is
 * the exec's (transferred → first contact). Both in business minutes.
 */
export function summariseResponse(rows: readonly ResponseRow[]): ResponseSummary {
  const alloc = rows.map((r) => r.allocMins).filter((n): n is number => n != null);
  const contact = rows.map((r) => r.contactMins).filter((n): n is number => n != null);
  const sde = rows.filter((r) => isSameDayReportable(r));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    total: rows.length,
    allocMeasured: alloc.length,
    allocHit: alloc.filter((n) => n <= ALLOCATION_TARGET_MINS).length,
    allocMissed: alloc.filter((n) => n > ALLOCATION_TARGET_MINS).length,
    allocAvg: avg(alloc),
    contactMeasured: contact.length,
    contactHit: contact.filter((n) => n <= CONTACT_TARGET_MINS).length,
    contactMissed: contact.filter((n) => n > CONTACT_TARGET_MINS).length,
    contactAvg: avg(contact),
    neverContacted: rows.filter((r) => isContactMissing(r)).length,
    noTransfer: rows.filter((r) => isTransferMissing(r)).length,
    sameDayExpected: sde.length,
    sameDayMet: sde.filter((r) => r.sameDayMet).length,
    sameDayMissed: sde.filter((r) => !r.sameDayMet).length,
  };
}
