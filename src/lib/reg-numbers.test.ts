import { describe, it, expect } from "vitest";
import { normaliseReg, parseRegNumbers, tidyReg } from "./reg-numbers";

describe("tidyReg / normaliseReg", () => {
  it("tidies to a readable plate", () => {
    expect(tidyReg("  ab12   cde ")).toBe("AB12 CDE");
  });

  it("compares without spaces, since the same car gets typed both ways", () => {
    expect(normaliseReg("AB12 CDE")).toBe(normaliseReg("ab12cde"));
  });
});

describe("parseRegNumbers", () => {
  it("takes one per line, which is how a spreadsheet column pastes", () => {
    expect(parseRegNumbers("AB12 CDE\nEF13 GHI\nJK14 LMN").regs)
      .toEqual(["AB12 CDE", "EF13 GHI", "JK14 LMN"]);
  });

  it("takes commas, semicolons and tabs too", () => {
    expect(parseRegNumbers("AB12 CDE, EF13 GHI; JK14 LMN\tOP15 QRS").regs)
      .toEqual(["AB12 CDE", "EF13 GHI", "JK14 LMN", "OP15 QRS"]);
  });

  it("does NOT split on the space inside a plate", () => {
    // The whole point: "AB12 CDE" is one registration, not two.
    expect(parseRegNumbers("AB12 CDE").regs).toEqual(["AB12 CDE"]);
  });

  it("ignores blank lines and trailing separators", () => {
    expect(parseRegNumbers("\n\nAB12 CDE\n\n  \nEF13 GHI,\n").regs)
      .toEqual(["AB12 CDE", "EF13 GHI"]);
  });

  it("reports a plate listed twice rather than creating it twice", () => {
    // Pasting an overlapping range is the obvious way to get twenty vehicles
    // and twenty-two rows.
    const r = parseRegNumbers("AB12 CDE\nEF13 GHI\nab12cde");
    expect(r.regs).toEqual(["AB12 CDE", "EF13 GHI"]);
    expect(r.duplicates).toEqual(["AB12 CDE"]);
  });

  it("handles a single plate, so bulk and single are the same path", () => {
    expect(parseRegNumbers("AB12 CDE")).toEqual({ regs: ["AB12 CDE"], duplicates: [] });
  });

  it("returns nothing for an empty box", () => {
    expect(parseRegNumbers("   \n\n ").regs).toEqual([]);
  });

  it("copes with twenty at once", () => {
    const input = Array.from({ length: 20 }, (_, i) => `AB12 C${String(i).padStart(2, "0")}`).join("\n");
    expect(parseRegNumbers(input).regs).toHaveLength(20);
  });
});
