import { describe, it, expect } from "vitest";
import {
  availableByRule, branchCodeOf, inStockScope, isExcludedBranch, ruleMatches,
  type AvailabilityRule, type StockScopeRow,
} from "./stock-availability";

// The user's rule, 2026-10-16: blank H, CO, or CH with 66170 in column E.
const CO: AvailabilityRule = { hCode: "CO", eValue: null, enabled: true };
const CH_66170: AvailabilityRule = { hCode: "CH", eValue: "66170", enabled: true };
const RULES = [CO, CH_66170];

const row = (o: Partial<StockScopeRow>): StockScopeRow => ({
  rawColH: null, rawColE: null, customerAssigned: false, sourceSheet: "Transit Custom", dealerRaw: "97702 (Fleet Bristol)", ...o,
});

describe("ruleMatches", () => {
  it("matches a column H code, and the column E value when the rule names one", () => {
    expect(ruleMatches(CO, { rawColH: "CO" })).toBe(true);
    expect(ruleMatches(CO, { rawColH: "CO", rawColE: "12345" })).toBe(true); // no E value: any
    expect(ruleMatches(CH_66170, { rawColH: "CH", rawColE: "66170" })).toBe(true);
    // CH alone is not available, nor 66170 alone.
    expect(ruleMatches(CH_66170, { rawColH: "CH", rawColE: "12345" })).toBe(false);
    expect(ruleMatches(CH_66170, { rawColH: "CH" })).toBe(false);
    expect(ruleMatches(CH_66170, { rawColH: "FM", rawColE: "66170" })).toBe(false);
    expect(ruleMatches(CH_66170, { rawColE: "66170" })).toBe(false);
  });

  it("tolerates how spreadsheet cells actually arrive", () => {
    // Padded, lower-cased, or numeric — none of these should stop a match.
    expect(ruleMatches(CO, { rawColH: " CO " })).toBe(true);
    expect(ruleMatches(CO, { rawColH: "co" })).toBe(true);
    expect(ruleMatches(CH_66170, { rawColH: "ch", rawColE: " 66170" })).toBe(true);
  });

  it("does not match a partial value", () => {
    // "CO" must not catch "CORP" — these are codes, not prefixes.
    for (const v of ["CORP", "COMPANY", "XCO"]) expect(ruleMatches(CO, { rawColH: v }), v).toBe(false);
    expect(ruleMatches(CH_66170, { rawColH: "CH", rawColE: "661701" })).toBe(false);
  });

  it("is off when disabled, and never matches on a blank code", () => {
    expect(ruleMatches({ ...CO, enabled: false }, { rawColH: "CO" })).toBe(false);
    const blank: AvailabilityRule = { hCode: "  ", eValue: null, enabled: true };
    expect(ruleMatches(blank, { rawColH: null })).toBe(false);
    expect(ruleMatches(blank, { rawColH: "" })).toBe(false);
  });

  it("takes any enabled rule", () => {
    expect(availableByRule(RULES, { rawColH: "CO" })).toBe(true);
    expect(availableByRule(RULES, { rawColH: "CH", rawColE: "66170" })).toBe(true);
    expect(availableByRule(RULES, { rawColH: "FM" })).toBe(false);
    expect(availableByRule(RULES.map((r) => ({ ...r, enabled: false })), { rawColH: "CO" })).toBe(false);
  });
});

describe("inStockScope", () => {
  it("shows a blank column H, CO, and CH with 66170 — and nothing else", () => {
    expect(inStockScope(row({}), RULES)).toBe(true);
    expect(inStockScope(row({ rawColH: "  " }), RULES)).toBe(true);
    expect(inStockScope(row({ rawColH: "CO" }), RULES)).toBe(true);
    expect(inStockScope(row({ rawColH: "CH", rawColE: "66170" }), RULES)).toBe(true);
    // The codes the Trust Report showed as available on 16 Oct 2026 while
    // they weren't: a code in H with no customer surname or fleet ID.
    for (const h of ["1B", "FM", "BP", "1W", "1N", "RU", "1F", "1M", "RR", "FL", "BQ", "4C", "DV"]) {
      expect(inStockScope(row({ rawColH: h }), RULES), h).toBe(false);
    }
    expect(inStockScope(row({ rawColH: "CH" }), RULES)).toBe(false);
    expect(inStockScope(row({ rawColH: "CH", rawColE: "12345" }), RULES)).toBe(false);
  });

  it("keeps a blank column H hidden when the report names a customer or fleet", () => {
    expect(inStockScope(row({ customerAssigned: true }), RULES)).toBe(false);
    // A rule's code stands even so — the CO and CH rows carry fleet details.
    expect(inStockScope(row({ rawColH: "CO", customerAssigned: true }), RULES)).toBe(true);
  });

  it("never overrides the other stock rules: models we sell, excluded branches", () => {
    expect(inStockScope(row({ sourceSheet: null }), RULES)).toBe(false);
    expect(inStockScope(row({ rawColH: "CO", sourceSheet: null }), RULES)).toBe(false);
    expect(inStockScope(row({ rawColH: "CO", dealerRaw: "93662" }), RULES)).toBe(false);
    expect(inStockScope(row({ rawColH: "CH", rawColE: "66170", dealerRaw: "86492 (Spellbound)" }), RULES)).toBe(false);
  });
});

describe("branches", () => {
  it("reads the code at the start of the DEALER cell, name or not", () => {
    expect(branchCodeOf("97702 (Fleet Bristol)")).toBe("97702");
    expect(branchCodeOf("93662")).toBe("93662");
    expect(branchCodeOf(93662)).toBe("93662");
    expect(branchCodeOf("")).toBeNull();
    expect(isExcludedBranch("86492 (Spellbound)")).toBe(true);
    expect(isExcludedBranch("93662")).toBe(true);
    expect(isExcludedBranch("97702 (Fleet Bristol)")).toBe(false);
    expect(isExcludedBranch("934")).toBe(false);
    expect(isExcludedBranch(null)).toBe(false);
  });
});
