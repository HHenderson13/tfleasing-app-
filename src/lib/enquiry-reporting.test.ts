import { describe, expect, it } from "vitest";
import {
  isEnquiryReportable,
  reportableAfter,
  reportingHorizonFromInstant,
} from "./business-hours";
import { neverContactedOwner, partitionByReportability, sameDayMissOwner, summariseResponse } from "./enquiry-reporting";

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

describe("summariseResponse", () => {
  const row = (over: Partial<Parameters<typeof summariseResponse>[0][number]>) => ({
    enquiryAt: 0, transferredAt: 1, contactedAt: 2, sameDayExpected: true, enquiryDay: "2026-10-01",
    allocMins: 3, contactMins: 10, sameDayMet: true, ...over,
  });

  it("scores allocation and contact against target, and counts the misses", () => {
    const s = summariseResponse([
      row({}),
      row({ allocMins: 9, contactMins: 40, sameDayMet: false }),
      row({ contactedAt: null, contactMins: null, sameDayMet: false }),
      row({ transferredAt: null, allocMins: null, sameDayExpected: false }),
    ]);
    expect(s).toMatchObject({
      total: 4,
      allocMeasured: 3, allocHit: 2, allocMissed: 1, allocAvg: 5,
      contactMeasured: 3, contactHit: 2, contactMissed: 1, contactAvg: 20,
      neverContacted: 1, noTransfer: 1,
      sameDayExpected: 3, sameDayMet: 1, sameDayMissed: 2,
    });
  });
});

describe("who a miss belongs to", () => {
  // Thu 1 Oct 2026, enquiry at 10:00.
  const at = (hh: number, mm = 0, d = 1) => Date.UTC(2026, 9, d, hh, mm);
  const miss = (transferredAt: number | null) => ({
    enquiryAt: at(10), transferredAt, contactedAt: null, sameDayExpected: true, sameDayMet: false,
    enquiryDay: "2026-10-01", allocMins: null, contactMins: null,
  });

  it("is the exec's when it reached them with time to make the call", () => {
    expect(sameDayMissOwner(miss(at(10, 5)))).toBe("exec");
    expect(sameDayMissOwner(miss(at(17, 15)))).toBe("exec"); // exactly 15 minutes left
  });

  it("is Sales Support's when it reached the exec too late, on a later day, or never", () => {
    expect(sameDayMissOwner(miss(at(17, 16)))).toBe("salesSupport");
    expect(sameDayMissOwner(miss(at(18, 0)))).toBe("salesSupport");
    expect(sameDayMissOwner(miss(at(9, 30, 2)))).toBe("salesSupport");
    expect(sameDayMissOwner(miss(null))).toBe("salesSupport");
  });

  it("isn't a miss at all when contacted that day, or out of scope", () => {
    expect(sameDayMissOwner({ ...miss(at(10, 5)), sameDayMet: true })).toBeNull();
    expect(sameDayMissOwner({ ...miss(at(10, 5)), sameDayExpected: false })).toBeNull();
  });

  it("puts never-contacted on Sales Support only when it was never passed over", () => {
    expect(neverContactedOwner(miss(at(10, 5)))).toBe("exec");
    expect(neverContactedOwner(miss(null))).toBe("salesSupport");
  });

  it("splits the same-day misses in the summary", () => {
    const s = summariseResponse([miss(at(10, 5)), miss(at(18)), miss(null)]);
    // The 18:00 transfer is Sales Support's same-day miss, but never calling
    // at all — the next day was there — is the exec's.
    expect(s).toMatchObject({ sameDayMissed: 3, sameDayMissedExec: 1, sameDayMissedSupport: 2, neverContacted: 3, neverContactedExec: 2, noTransfer: 1 });
  });
});
