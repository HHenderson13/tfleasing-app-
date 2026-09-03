import { describe, it, expect } from "vitest";
import { availableByRule, ruleMatches, type AvailabilityRule } from "./stock-availability";

const H_CO: AvailabilityRule = { columnLetter: "H", matchValue: "CO", enabled: true };
const E_66170: AvailabilityRule = { columnLetter: "E", matchValue: "66170", enabled: true };

describe("ruleMatches", () => {
  it("matches the column it names, and only that column", () => {
    expect(ruleMatches(H_CO, { rawColH: "CO" })).toBe(true);
    // The same value in the other column must not match.
    expect(ruleMatches(H_CO, { rawColE: "CO" })).toBe(false);
    expect(ruleMatches(E_66170, { rawColE: "66170" })).toBe(true);
    expect(ruleMatches(E_66170, { rawColH: "66170" })).toBe(false);
  });

  it("tolerates how spreadsheet cells actually arrive", () => {
    // Padded, lower-cased, or numeric — none of these should stop a match.
    expect(ruleMatches(H_CO, { rawColH: " CO " })).toBe(true);
    expect(ruleMatches(H_CO, { rawColH: "co" })).toBe(true);
    expect(ruleMatches(E_66170, { rawColE: " 66170" })).toBe(true);
  });

  it("does not match a partial value", () => {
    // "CO" must not catch "CORP" or "COMPANY" — these are codes, not prefixes.
    for (const v of ["CORP", "COMPANY", "CONTRACT", "XCO"]) {
      expect(ruleMatches(H_CO, { rawColH: v }), v).toBe(false);
    }
    expect(ruleMatches(E_66170, { rawColE: "661701" })).toBe(false);
  });

  it("is off when disabled", () => {
    expect(ruleMatches({ ...H_CO, enabled: false }, { rawColH: "CO" })).toBe(false);
  });

  it("never matches on an empty rule value", () => {
    // Otherwise blanking the value in admin would match every empty cell and
    // pull the entire excluded set — 86% of an upload — into the stock list.
    const blank: AvailabilityRule = { columnLetter: "H", matchValue: "   ", enabled: true };
    expect(ruleMatches(blank, { rawColH: null })).toBe(false);
    expect(ruleMatches(blank, { rawColH: "" })).toBe(false);
    expect(ruleMatches(blank, { rawColH: "CO" })).toBe(false);
  });

  it("ignores a column letter it does not know", () => {
    expect(ruleMatches({ columnLetter: "Z", matchValue: "CO", enabled: true }, { rawColH: "CO" })).toBe(false);
  });

  it("does not match a row with nothing in either column", () => {
    expect(ruleMatches(H_CO, {})).toBe(false);
    expect(ruleMatches(H_CO, { rawColH: null })).toBe(false);
  });
});

describe("availableByRule", () => {
  const rules = [H_CO, E_66170];

  it("takes either rule", () => {
    expect(availableByRule(rules, { rawColH: "CO" })).toBe(true);
    expect(availableByRule(rules, { rawColE: "66170" })).toBe(true);
    expect(availableByRule(rules, { rawColH: "FLEET-123" })).toBe(false);
  });

  it("respects each rule's own switch", () => {
    const onlyE = [{ ...H_CO, enabled: false }, E_66170];
    expect(availableByRule(onlyE, { rawColH: "CO" })).toBe(false);
    expect(availableByRule(onlyE, { rawColE: "66170" })).toBe(true);
  });

  it("includes nothing when every rule is off", () => {
    const allOff = rules.map((r) => ({ ...r, enabled: false }));
    expect(availableByRule(allOff, { rawColH: "CO", rawColE: "66170" })).toBe(false);
  });
});
