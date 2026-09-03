import { describe, it, expect } from "vitest";
import {
  dealerCode, formatDealerCodes, matchModelDealerRule, parseDealerCodes,
  type ModelDealerRule,
} from "./stock-model-rules";

const VAN: ModelDealerRule = {
  id: "explorer-van",
  modelRaw: "EXPLORER",
  dealerCodes: ["97706", "97709", "97714", "97726"],
  displayName: "Explorer Van",
  tfNote: "Check with Fleet before offering",
  brokerNote: "Check with Dealer before offering",
  enabled: true,
};

describe("dealerCode", () => {
  it("reads the code off the front of the dealer string", () => {
    expect(dealerCode("97706 (Fleet Barnsley)")).toBe("97706");
    expect(dealerCode("62133 (Manchester)")).toBe("62133");
    expect(dealerCode("93662")).toBe("93662");
  });

  it("returns null rather than guessing", () => {
    for (const v of [null, undefined, "", "   ", "Fleet Barnsley"]) {
      expect(dealerCode(v)).toBeNull();
    }
  });
});

describe("parseDealerCodes", () => {
  it("accepts however someone types a list", () => {
    const want = ["97706", "97709", "97714", "97726"];
    expect(parseDealerCodes("97706, 97709, 97714, 97726")).toEqual(want);
    expect(parseDealerCodes("97706\n97709\n97714\n97726")).toEqual(want);
    expect(parseDealerCodes(" 97706 ; 97709,97714   97726 ")).toEqual(want);
  });

  it("drops anything that is not a code, and de-duplicates", () => {
    expect(parseDealerCodes("97706, Fleet Barnsley, 97706, , 97709")).toEqual(["97706", "97709"]);
  });

  it("round-trips through the display format", () => {
    expect(parseDealerCodes(formatDealerCodes(VAN.dealerCodes))).toEqual(VAN.dealerCodes);
  });
});

describe("matchModelDealerRule", () => {
  it("matches an Explorer on a van dealer", () => {
    expect(matchModelDealerRule([VAN], "EXPLORER", "97706 (Fleet Barnsley)")?.displayName).toBe("Explorer Van");
  });

  it("leaves an Explorer on any other dealer alone", () => {
    // 97708 and 97715 hold hundreds of ordinary Explorers — a near-miss on
    // the code must not rename them.
    for (const d of ["97708 (Fleet Manchester)", "97715 (Fleet Barnsley)", "62133 (Manchester)"]) {
      expect(matchModelDealerRule([VAN], "EXPLORER", d), d).toBeNull();
    }
  });

  it("does not match a different model on a van dealer", () => {
    expect(matchModelDealerRule([VAN], "PUMA", "97706 (Fleet Barnsley)")).toBeNull();
  });

  it("ignores case and padding on the model", () => {
    expect(matchModelDealerRule([VAN], " explorer ", "97706 (Fleet Barnsley)")).not.toBeNull();
  });

  it("matches the code exactly, never as a prefix", () => {
    // "977061" must not match "97706", or a renumbered site would silently
    // inherit the rule.
    expect(matchModelDealerRule([VAN], "EXPLORER", "977061 (Somewhere)")).toBeNull();
    expect(matchModelDealerRule([VAN], "EXPLORER", "9770 (Somewhere)")).toBeNull();
  });

  it("respects the switch", () => {
    expect(matchModelDealerRule([{ ...VAN, enabled: false }], "EXPLORER", "97706 (X)")).toBeNull();
  });

  it("matches nothing when the model or dealer is missing", () => {
    expect(matchModelDealerRule([VAN], null, "97706 (X)")).toBeNull();
    expect(matchModelDealerRule([VAN], "EXPLORER", null)).toBeNull();
  });
});
