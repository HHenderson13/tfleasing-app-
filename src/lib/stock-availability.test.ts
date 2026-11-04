import { describe, it, expect } from "vitest";
import {
  availableByFRule, availableByRule, branchCodeOf, fNorm, fRuleMatches, inStockScope, isExcludedBranch, ruleMatches,
  type AvailabilityRule, type ColumnFRule, type StockScopeRow,
} from "./stock-availability";

// The user's rule, 2026-10-16: blank H, CO, or CH with 66170 in column E.
const CO: AvailabilityRule = { hCode: "CO", eValue: null, enabled: true };
const CH_66170: AvailabilityRule = { hCode: "CH", eValue: "66170", enabled: true };
const RULES = [CO, CH_66170];
// The user's column F rule, 2026-11-04: "TrustFord - TFL", only on dealer 62133.
const TFL: ColumnFRule = { fValue: "TrustFord - TFL", dealerCode: "62133", enabled: true };

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

describe("column F rules", () => {
  it("matches the value on that dealer only, with the dealer code exact", () => {
    expect(fRuleMatches(TFL, { rawColF: "TrustFord - TFL", dealerRaw: "62133" })).toBe(true);
    expect(fRuleMatches(TFL, { rawColF: "TrustFord - TFL", dealerRaw: "62133 (Name)" })).toBe(true);
    expect(fRuleMatches(TFL, { rawColF: "TrustFord - TFL", dealerRaw: "97702 (Fleet Bristol)" })).toBe(false);
    expect(fRuleMatches(TFL, { rawColF: "TrustFord - TFL", dealerRaw: "621330" })).toBe(false);
    expect(fRuleMatches(TFL, { rawColF: "TrustFord - TFL", dealerRaw: null })).toBe(false);
    expect(fRuleMatches(TFL, { rawColF: null, dealerRaw: "62133" })).toBe(false);
  });

  it("doesn't care about capitals, spaces or the style of dash", () => {
    for (const f of ["TRUSTFORD - TFL", "trustford-tfl", " TrustFord  -  TFL ", "TrustFord \u2013 TFL", "TrustFord\u2014TFL", "TRUST FORD - TFL"]) {
      expect(fRuleMatches(TFL, { rawColF: f, dealerRaw: "62133" }), f).toBe(true);
    }
    expect(fNorm("TrustFord \u2013 TFL")).toBe("TRUSTFORD-TFL");
  });

  it("never matches a partial or a different value", () => {
    for (const f of ["TrustFord - TFL2", "TrustFord", "TFL", "TFL Custom Batch Q3 26", "NOVUNA - FORD LEASE (BQ)", "TRUSTFORD"]) {
      expect(fRuleMatches(TFL, { rawColF: f, dealerRaw: "62133" }), f).toBe(false);
    }
  });

  it("is off when disabled, never matches a blank value, and a blank dealer means any dealer", () => {
    expect(fRuleMatches({ ...TFL, enabled: false }, { rawColF: "TrustFord - TFL", dealerRaw: "62133" })).toBe(false);
    expect(fRuleMatches({ ...TFL, fValue: "  " }, { rawColF: "", dealerRaw: "62133" })).toBe(false);
    expect(fRuleMatches({ ...TFL, dealerCode: null }, { rawColF: "TrustFord - TFL", dealerRaw: "97702 (Fleet Bristol)" })).toBe(true);
    expect(availableByFRule([TFL], { rawColF: "TrustFord - TFL", dealerRaw: "62133" })).toBe(true);
    expect(availableByFRule([], { rawColF: "TrustFord - TFL", dealerRaw: "62133" })).toBe(false);
  });

  it("brings the vehicle in whatever column H says and whoever is named", () => {
    const tfl = (o: Partial<StockScopeRow>) => row({ rawColF: "TrustFord - TFL", dealerRaw: "62133", ...o });
    for (const h of [null, "CH", "BQ", "BP", "1W", "1B"]) {
      expect(inStockScope(tfl({ rawColH: h, customerAssigned: true }), RULES, [TFL]), String(h)).toBe(true);
    }
    // Without the rule the same vehicles stay off, as before.
    expect(inStockScope(tfl({ rawColH: "BQ", customerAssigned: true }), RULES)).toBe(false);
    expect(inStockScope(tfl({ rawColH: "BQ", customerAssigned: true }), RULES, [{ ...TFL, enabled: false }])).toBe(false);
  });

  it("is added to the column H rules, never in place of them", () => {
    // Everything the column H rules let in still comes in with the column F rule on.
    expect(inStockScope(row({}), RULES, [TFL])).toBe(true);
    expect(inStockScope(row({ rawColH: "CO" }), RULES, [TFL])).toBe(true);
    expect(inStockScope(row({ rawColH: "CH", rawColE: "66170" }), RULES, [TFL])).toBe(true);
    // And everything they keep out stays out unless column F says otherwise.
    expect(inStockScope(row({ rawColH: "BQ" }), RULES, [TFL])).toBe(false);
    expect(inStockScope(row({ customerAssigned: true }), RULES, [TFL])).toBe(false);
  });

  it("never overrides the other stock rules: models we sell, excluded branches", () => {
    expect(inStockScope(row({ rawColF: "TrustFord - TFL", dealerRaw: "62133", sourceSheet: null }), RULES, [TFL])).toBe(false);
    const anyDealer = { ...TFL, dealerCode: null };
    expect(inStockScope(row({ rawColF: "TrustFord - TFL", dealerRaw: "86492 (Spellbound)" }), RULES, [anyDealer])).toBe(false);
  });
});
