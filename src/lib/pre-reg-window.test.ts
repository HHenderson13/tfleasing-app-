import { describe, it, expect } from "vitest";
import { PRE_REG_WINDOW_MONTHS, preRegWindow, sellByDate } from "./pre-reg-window";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("sellByDate", () => {
  it("is three months after registration", () => {
    expect(sellByDate(d("2026-01-15"))).toEqual(new Date(2026, 3, 15));
    expect(sellByDate(d("2026-06-01"))).toEqual(new Date(2026, 8, 1));
  });

  it("clamps to the end of a shorter month rather than spilling into the next", () => {
    // 30 Nov + 3 months is 28 Feb. Spilling to 2 March would put the deadline
    // in a month nobody would name, and adding 90 days would drift further.
    expect(sellByDate(d("2025-11-30"))).toEqual(new Date(2026, 1, 28));
    expect(sellByDate(d("2026-11-30"))).toEqual(new Date(2027, 1, 28));
  });

  it("handles a leap year", () => {
    expect(sellByDate(d("2027-11-30"))).toEqual(new Date(2028, 1, 29));
  });

  it("crosses the year end", () => {
    expect(sellByDate(d("2026-12-10"))).toEqual(new Date(2027, 2, 10));
  });

  it("uses three months", () => {
    expect(PRE_REG_WINDOW_MONTHS).toBe(3);
  });
});

describe("preRegWindow", () => {
  it("counts nothing on the day of registration", () => {
    const w = preRegWindow(d("2026-03-01"), d("2026-03-01"));
    expect(w.daysSince).toBe(0);
    expect(w.expired).toBe(false);
  });

  it("counts days since registration", () => {
    expect(preRegWindow(d("2026-03-01"), d("2026-03-31")).daysSince).toBe(30);
  });

  it("counts days left to sell", () => {
    // Registered 1 March, deadline 1 June. On 1 May that is 31 days.
    expect(preRegWindow(d("2026-03-01"), d("2026-05-01")).daysRemaining).toBe(31);
  });

  it("is not expired on the deadline itself", () => {
    const w = preRegWindow(d("2026-03-01"), d("2026-06-01"));
    expect(w.daysRemaining).toBe(0);
    expect(w.expired).toBe(false);
  });

  it("is expired the day after", () => {
    const w = preRegWindow(d("2026-03-01"), d("2026-06-02"));
    expect(w.daysRemaining).toBe(-1);
    expect(w.expired).toBe(true);
  });

  it("keeps counting how far past the window it is", () => {
    expect(preRegWindow(d("2026-03-01"), d("2026-07-01")).daysRemaining).toBe(-30);
  });

  it("counts calendar days, so the clocks changing does not shift a day", () => {
    // The UK clocks go back on 25 October 2026. A day either side must still
    // be one day, not 0 or 2.
    expect(preRegWindow(d("2026-10-24"), d("2026-10-25")).daysSince).toBe(1);
    expect(preRegWindow(d("2026-10-25"), d("2026-10-26")).daysSince).toBe(1);
  });
});
