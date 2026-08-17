import { describe, expect, it } from "vitest";
import {
  businessMinutesBetween,
  dayKey,
  formatMins,
  isSameDayContactExpected,
  isWorkingDay,
  parseExportTimestamp,
  wasContactedSameDay,
  WORKING_DAY_MINS,
} from "./business-hours";

// Helper: build a wall-clock epoch the same way the parser does.
const at = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  Date.UTC(y, m - 1, d, hh, mm, 0, 0);

// August 2026 reference points:
//   Mon 3rd, Tue 4th, Wed 5th, Thu 6th, Fri 7th, Sat 8th, Sun 9th, Mon 10th
describe("isWorkingDay", () => {
  it("accepts Mon–Fri and rejects the weekend", () => {
    expect(isWorkingDay(at(2026, 8, 3))).toBe(true);  // Mon
    expect(isWorkingDay(at(2026, 8, 7))).toBe(true);  // Fri
    expect(isWorkingDay(at(2026, 8, 8))).toBe(false); // Sat
    expect(isWorkingDay(at(2026, 8, 9))).toBe(false); // Sun
  });
});

describe("businessMinutesBetween — the worked examples", () => {
  it("enquiry 03:00 transferred+contacted before 09:00 → all zero", () => {
    // Nothing counts: the office had not opened.
    expect(businessMinutesBetween(at(2026, 8, 3, 3, 0), at(2026, 8, 3, 5, 0))).toBe(0);
    expect(businessMinutesBetween(at(2026, 8, 3, 5, 0), at(2026, 8, 3, 8, 59))).toBe(0);
  });

  it("enquiry 09:00, transfer 09:10, contact 09:30 → 10 and 20 mins", () => {
    const enquiry = at(2026, 8, 3, 9, 0);
    const transfer = at(2026, 8, 3, 9, 10);
    const contact = at(2026, 8, 3, 9, 30);
    expect(businessMinutesBetween(enquiry, transfer)).toBe(10);
    expect(businessMinutesBetween(transfer, contact)).toBe(20);
  });

  it("enquiry 17:00 Mon, transferred 10:00 Tue → 90 mins", () => {
    // 30 mins left on Monday (17:00→17:30) + 60 on Tuesday (09:00→10:00).
    expect(
      businessMinutesBetween(at(2026, 8, 3, 17, 0), at(2026, 8, 4, 10, 0)),
    ).toBe(90);
  });

  it("same rule across the weekend: Fri 17:00 → Mon 10:00 is also 90 mins", () => {
    expect(
      businessMinutesBetween(at(2026, 8, 7, 17, 0), at(2026, 8, 10, 10, 0)),
    ).toBe(90);
  });
});

describe("businessMinutesBetween — edges", () => {
  it("returns 0 when end is at or before start", () => {
    expect(businessMinutesBetween(at(2026, 8, 3, 10, 0), at(2026, 8, 3, 10, 0))).toBe(0);
    expect(businessMinutesBetween(at(2026, 8, 3, 11, 0), at(2026, 8, 3, 10, 0))).toBe(0);
  });

  it("clamps a start before opening to 09:00", () => {
    // 06:00 → 09:30 counts only the 30 mins after open.
    expect(businessMinutesBetween(at(2026, 8, 3, 6, 0), at(2026, 8, 3, 9, 30))).toBe(30);
  });

  it("clamps an end after close to 17:30", () => {
    // 17:00 → 23:00 counts only the 30 mins before close.
    expect(businessMinutesBetween(at(2026, 8, 3, 17, 0), at(2026, 8, 3, 23, 0))).toBe(30);
  });

  it("a full working day is 510 minutes", () => {
    expect(businessMinutesBetween(at(2026, 8, 3, 9, 0), at(2026, 8, 3, 17, 30)))
      .toBe(WORKING_DAY_MINS);
    expect(WORKING_DAY_MINS).toBe(510);
  });

  it("skips the weekend entirely", () => {
    // Sat 09:00 → Sun 17:00 spans no working time at all.
    expect(businessMinutesBetween(at(2026, 8, 8, 9, 0), at(2026, 8, 9, 17, 0))).toBe(0);
  });

  it("sums whole days across a week", () => {
    // Mon 09:00 → Fri 17:30 = five full working days.
    expect(businessMinutesBetween(at(2026, 8, 3, 9, 0), at(2026, 8, 7, 17, 30)))
      .toBe(5 * WORKING_DAY_MINS);
  });

  it("is unaffected by the BST→GMT change (wall-clock maths)", () => {
    // UK clocks go back on Sun 25 Oct 2026. Mon 26th is a normal day.
    expect(businessMinutesBetween(at(2026, 10, 26, 9, 0), at(2026, 10, 26, 10, 0)))
      .toBe(60);
    // Fri 23 Oct 17:00 → Mon 26 Oct 10:00, straddling the change: still 90.
    expect(businessMinutesBetween(at(2026, 10, 23, 17, 0), at(2026, 10, 26, 10, 0)))
      .toBe(90);
  });
});

describe("same-day contact rule", () => {
  it("is expected for a weekday enquiry before 17:30", () => {
    expect(isSameDayContactExpected(at(2026, 8, 3, 3, 0))).toBe(true);
    expect(isSameDayContactExpected(at(2026, 8, 3, 17, 29))).toBe(true);
  });

  it("is not expected at or after 17:30, nor at the weekend", () => {
    expect(isSameDayContactExpected(at(2026, 8, 3, 17, 30))).toBe(false);
    expect(isSameDayContactExpected(at(2026, 8, 3, 20, 0))).toBe(false);
    expect(isSameDayContactExpected(at(2026, 8, 8, 10, 0))).toBe(false); // Sat
  });

  it("counts contact on the same calendar day", () => {
    const enquiry = at(2026, 8, 3, 10, 0);
    expect(wasContactedSameDay(enquiry, at(2026, 8, 3, 16, 0))).toBe(true);
    expect(wasContactedSameDay(enquiry, at(2026, 8, 4, 9, 5))).toBe(false);
    expect(wasContactedSameDay(enquiry, null)).toBe(false);
  });
});

describe("parseExportTimestamp", () => {
  it("parses the export's '1 August 2026 01:17' format", () => {
    expect(parseExportTimestamp("1 August 2026 01:17")).toBe(at(2026, 8, 1, 1, 17));
    expect(parseExportTimestamp("15 August 2026 09:35")).toBe(at(2026, 8, 15, 9, 35));
  });

  it("parses abbreviated months and a missing time", () => {
    expect(parseExportTimestamp("14 Aug 2026")).toBe(at(2026, 8, 14, 0, 0));
    expect(parseExportTimestamp("3 Sept 2026 14:05")).toBe(at(2026, 9, 3, 14, 5));
  });

  it("parses ISO-ish strings", () => {
    expect(parseExportTimestamp("2026-08-01 09:15")).toBe(at(2026, 8, 1, 9, 15));
    expect(parseExportTimestamp("2026-08-01T09:15:00")).toBe(at(2026, 8, 1, 9, 15));
  });

  it("returns null for blanks and junk rather than throwing", () => {
    expect(parseExportTimestamp(null)).toBeNull();
    expect(parseExportTimestamp("")).toBeNull();
    expect(parseExportTimestamp("   ")).toBeNull();
    expect(parseExportTimestamp("n/a")).toBeNull();
    expect(parseExportTimestamp("1 Smarch 2026 01:17")).toBeNull();
  });

  it("round-trips through businessMinutesBetween", () => {
    const e = parseExportTimestamp("3 August 2026 17:00")!;
    const p = parseExportTimestamp("4 August 2026 10:00")!;
    expect(businessMinutesBetween(e, p)).toBe(90);
  });
});

describe("formatting helpers", () => {
  it("dayKey groups by calendar day", () => {
    expect(dayKey(at(2026, 8, 3, 0, 1))).toBe("2026-08-03");
    expect(dayKey(at(2026, 8, 3, 23, 59))).toBe("2026-08-03");
  });

  it("formatMins reads naturally", () => {
    expect(formatMins(0)).toBe("0m");
    expect(formatMins(45)).toBe("45m");
    expect(formatMins(60)).toBe("1h");
    expect(formatMins(95)).toBe("1h 35m");
    expect(formatMins(null)).toBe("—");
  });
});
