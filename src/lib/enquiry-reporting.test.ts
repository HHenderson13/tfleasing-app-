import { describe, expect, it } from "vitest";
import {
  isEnquiryReportable,
  reportableAfter,
  reportingHorizonFromInstant,
} from "./business-hours";
import { partitionByReportability } from "./enquiry-reporting";

const at = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  Date.UTC(y, m - 1, d, hh, mm, 0, 0);

// Aug 2026: Thu 13th, Fri 14th, Sat 15th, Sun 16th, Mon 17th, Tue 18th
describe("reportableAfter — when an enquiry has had its working day", () => {
  it("a weekday enquiry inside hours is due at that day's 17:30", () => {
    expect(reportableAfter(at(2026, 8, 14, 10, 0))).toBe(at(2026, 8, 14, 17, 30));
  });

  it("before opening still counts as that day", () => {
    expect(reportableAfter(at(2026, 8, 14, 7, 0))).toBe(at(2026, 8, 14, 17, 30));
  });

  it("after close rolls to the next working day", () => {
    // Fri 19:00 → clock starts Mon 09:00 → due Mon 17:30
    expect(reportableAfter(at(2026, 8, 14, 19, 0))).toBe(at(2026, 8, 17, 17, 30));
  });

  it("weekend enquiries roll to Monday's close", () => {
    expect(reportableAfter(at(2026, 8, 15, 14, 0))).toBe(at(2026, 8, 17, 17, 30));
    expect(reportableAfter(at(2026, 8, 16, 9, 0))).toBe(at(2026, 8, 17, 17, 30));
  });
});

describe("the Monday-morning case the report exists to handle", () => {
  // Data uploaded Monday 17th → horizon is Monday 00:00 (exclusive).
  const horizon = reportingHorizonFromInstant(new Date("2026-08-17T09:06:00Z"));

  it("holds back Saturday and Sunday enquiries", () => {
    expect(isEnquiryReportable(at(2026, 8, 15, 14, 0), horizon)).toBe(false);
    expect(isEnquiryReportable(at(2026, 8, 16, 11, 0), horizon)).toBe(false);
  });

  it("holds back Monday's own enquiries", () => {
    expect(isEnquiryReportable(at(2026, 8, 17, 9, 30), horizon)).toBe(false);
  });

  it("reports Friday and earlier — they have had a full working day", () => {
    expect(isEnquiryReportable(at(2026, 8, 14, 10, 0), horizon)).toBe(true);
    expect(isEnquiryReportable(at(2026, 8, 13, 16, 0), horizon)).toBe(true);
  });

  it("still holds a Friday-evening enquiry, whose day is Monday", () => {
    expect(isEnquiryReportable(at(2026, 8, 14, 19, 0), horizon)).toBe(false);
  });
});

describe("the same one-day lag mid-week", () => {
  // Uploaded Tuesday 18th → horizon Tue 00:00.
  const horizon = reportingHorizonFromInstant(new Date("2026-08-18T09:00:00Z"));

  it("Monday is now reportable, including the weekend that rolled into it", () => {
    expect(isEnquiryReportable(at(2026, 8, 17, 10, 0), horizon)).toBe(true);
    expect(isEnquiryReportable(at(2026, 8, 15, 14, 0), horizon)).toBe(true);
    expect(isEnquiryReportable(at(2026, 8, 16, 11, 0), horizon)).toBe(true);
  });

  it("Tuesday's own enquiries are held", () => {
    expect(isEnquiryReportable(at(2026, 8, 18, 9, 30), horizon)).toBe(false);
  });
});

describe("partitionByReportability", () => {
  const horizon = reportingHorizonFromInstant(new Date("2026-08-17T09:06:00Z"));
  const row = (d: number, hh: number) => ({
    enquiryAt: at(2026, 8, d, hh, 0),
    transferredAt: null, contactedAt: null,
    sameDayExpected: false, enquiryDay: `2026-08-${String(d).padStart(2, "0")}`,
  });

  it("splits held from reportable", () => {
    const { reportable, held } = partitionByReportability(
      [row(13, 10), row(14, 10), row(15, 14), row(16, 11), row(17, 9)],
      horizon,
    );
    expect(reportable.map((r) => r.enquiryDay)).toEqual(["2026-08-13", "2026-08-14"]);
    expect(held.map((r) => r.enquiryDay)).toEqual(["2026-08-15", "2026-08-16", "2026-08-17"]);
  });

  it("reports everything when there is no horizon", () => {
    const { reportable, held } = partitionByReportability([row(17, 9)], null);
    expect(reportable).toHaveLength(1);
    expect(held).toHaveLength(0);
  });
});
