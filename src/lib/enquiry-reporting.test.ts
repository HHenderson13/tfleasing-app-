import { describe, expect, it } from "vitest";
import {
  isAllocationPending,
  isContactMissing,
  isContactPending,
  isReportDataPending,
  isSameDayReportable,
  isTransferMissing,
  type ReportingRow,
} from "./enquiry-reporting";

const at = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  Date.UTC(y, m - 1, d, hh, mm, 0, 0);

function row(overrides: Partial<ReportingRow> = {}): ReportingRow {
  return {
    enquiryAt: at(2026, 8, 8, 12), // Saturday
    transferredAt: null,
    contactedAt: null,
    sameDayExpected: false,
    enquiryDay: "2026-08-08",
    ...overrides,
  };
}

describe("enquiry reporting lag", () => {
  it("keeps weekend blanks pending on Monday", () => {
    const monday = at(2026, 8, 10);
    const weekendLead = row();

    expect(isAllocationPending(weekendLead, monday)).toBe(true);
    expect(isContactPending(weekendLead, monday)).toBe(true);
    expect(isReportDataPending(weekendLead, monday)).toBe(true);
    expect(isTransferMissing(weekendLead, monday)).toBe(false);
    expect(isContactMissing(weekendLead, monday)).toBe(false);
  });

  it("treats unchanged weekend blanks as missing after Tuesday's upload", () => {
    const tuesday = at(2026, 8, 11);
    const weekendLead = row();

    expect(isReportDataPending(weekendLead, tuesday)).toBe(false);
    expect(isTransferMissing(weekendLead, tuesday)).toBe(true);
    expect(isContactMissing(weekendLead, tuesday)).toBe(true);
  });

  it("uses transfer time for the contact grace window", () => {
    const horizon = at(2026, 8, 10);
    expect(isContactPending(row({
      enquiryAt: at(2026, 8, 7, 16),
      transferredAt: at(2026, 8, 7, 17, 20),
      enquiryDay: "2026-08-07",
    }), horizon)).toBe(true); // 10 completed business minutes, target 15
    expect(isContactMissing(row({
      enquiryAt: at(2026, 8, 7, 16),
      transferredAt: at(2026, 8, 7, 17, 14),
      enquiryDay: "2026-08-07",
    }), horizon)).toBe(true); // 16 completed business minutes
  });

  it("only judges same-day contact after the enquiry day is complete in the feed", () => {
    const monday = at(2026, 8, 10);
    expect(isSameDayReportable(row({
      enquiryAt: at(2026, 8, 10, 10),
      enquiryDay: "2026-08-10",
      sameDayExpected: true,
    }), monday)).toBe(false);
    expect(isSameDayReportable(row({
      enquiryAt: at(2026, 8, 7, 10),
      enquiryDay: "2026-08-07",
      sameDayExpected: true,
    }), monday)).toBe(true);
  });
});
