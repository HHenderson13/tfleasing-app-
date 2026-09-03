import { describe, it, expect } from "vitest";
import { looksLikeVin, normaliseReg, pairByPosition, parseRegNumbers, parseVinList, tidyReg } from "./reg-numbers";

const VIN_A = "WF0AXXTTRAPY12345";
const VIN_B = "WF0AXXTTRAPY99999";

describe("tidyReg / normaliseReg", () => {
  it("tidies to a readable plate", () => {
    expect(tidyReg("  ab12   cde ")).toBe("AB12 CDE");
  });

  it("compares without spaces, since the same car gets typed both ways", () => {
    expect(normaliseReg("AB12 CDE")).toBe(normaliseReg("ab12cde"));
  });
});

describe("looksLikeVin", () => {
  it("is exactly 17 characters", () => {
    expect(looksLikeVin(VIN_A)).toBe(true);
    expect(looksLikeVin("wf0axxttrapy12345")).toBe(true);
    expect(looksLikeVin("WF0AXXTTRAPY1234")).toBe(false);   // 16
    expect(looksLikeVin("WF0AXXTTRAPY123456")).toBe(false); // 18
  });

  it("does not mistake a registration for one", () => {
    // This is what stops "AB12 CDE, EF13 GHI" inventing a VIN.
    for (const r of ["AB12 CDE", "EF13GHI", "A1", ""]) expect(looksLikeVin(r)).toBe(false);
  });
});

describe("parseRegNumbers — pairing", () => {
  it("pairs a plate with the VIN beside it, which is how two columns paste", () => {
    const r = parseRegNumbers(`AB12 CDE\t${VIN_A}\nEF13 GHI\t${VIN_B}`);
    expect(r.vehicles).toEqual([
      { reg: "AB12 CDE", vin: VIN_A },
      { reg: "EF13 GHI", vin: VIN_B },
    ]);
  });

  it("takes a comma between them too", () => {
    expect(parseRegNumbers(`AB12 CDE, ${VIN_A}`).vehicles).toEqual([{ reg: "AB12 CDE", vin: VIN_A }]);
  });

  it("keeps working for a plain list of plates with no VINs", () => {
    const r = parseRegNumbers("AB12 CDE\nEF13 GHI\nJK14 LMN");
    expect(r.vehicles).toEqual([
      { reg: "AB12 CDE", vin: null },
      { reg: "EF13 GHI", vin: null },
      { reg: "JK14 LMN", vin: null },
    ]);
  });

  it("reads two plates on one line as two vehicles, not a plate and a VIN", () => {
    // The failure this guards against is silent: without the length check the
    // second plate becomes a VIN, inventing one that does not exist.
    const r = parseRegNumbers("AB12 CDE, EF13 GHI");
    expect(r.vehicles).toEqual([
      { reg: "AB12 CDE", vin: null },
      { reg: "EF13 GHI", vin: null },
    ]);
  });

  it("mixes paired and unpaired lines", () => {
    const r = parseRegNumbers(`AB12 CDE\t${VIN_A}\nEF13 GHI`);
    expect(r.vehicles).toEqual([
      { reg: "AB12 CDE", vin: VIN_A },
      { reg: "EF13 GHI", vin: null },
    ]);
  });

  it("does NOT split on the space inside a plate", () => {
    expect(parseRegNumbers("AB12 CDE").vehicles).toEqual([{ reg: "AB12 CDE", vin: null }]);
  });

  it("ignores blank lines and trailing separators", () => {
    expect(parseRegNumbers("\n\nAB12 CDE\n\n  \nEF13 GHI,\n").vehicles.map((v) => v.reg))
      .toEqual(["AB12 CDE", "EF13 GHI"]);
  });

  it("ignores a VIN with no plate in front of it", () => {
    // A pre-reg vehicle is identified by its plate; a lone VIN has nothing
    // to attach to.
    expect(parseRegNumbers(`${VIN_A}\nAB12 CDE`).vehicles).toEqual([{ reg: "AB12 CDE", vin: null }]);
  });
});

describe("parseRegNumbers — duplicates", () => {
  it("adds a repeated plate once and reports it", () => {
    const r = parseRegNumbers("AB12 CDE\nEF13 GHI\nab12cde");
    expect(r.vehicles.map((v) => v.reg)).toEqual(["AB12 CDE", "EF13 GHI"]);
    expect(r.duplicateRegs).toEqual(["AB12 CDE"]);
  });

  it("drops a VIN reused on a second plate rather than putting it on both", () => {
    // A VIN identifies exactly one vehicle. Guessing which plate owns it
    // would be worse than leaving it off and saying so.
    const r = parseRegNumbers(`AB12 CDE\t${VIN_A}\nEF13 GHI\t${VIN_A}`);
    expect(r.vehicles).toEqual([
      { reg: "AB12 CDE", vin: VIN_A },
      { reg: "EF13 GHI", vin: null },
    ]);
    expect(r.duplicateVins).toEqual([VIN_A]);
  });

  it("copes with twenty paired vehicles at once", () => {
    const input = Array.from({ length: 20 }, (_, i) =>
      `AB12 C${String(i).padStart(2, "0")}\tWF0AXXTTRAPY${String(i).padStart(5, "0")}`).join("\n");
    const r = parseRegNumbers(input);
    expect(r.vehicles).toHaveLength(20);
    expect(new Set(r.vehicles.map((v) => v.vin)).size).toBe(20);
    expect(r.duplicateRegs).toEqual([]);
    expect(r.duplicateVins).toEqual([]);
  });

  it("returns nothing for an empty box", () => {
    expect(parseRegNumbers("   \n\n ").vehicles).toEqual([]);
  });
});

describe("parseVinList", () => {
  it("takes a pasted column", () => {
    expect(parseVinList(`${VIN_A}\n${VIN_B}`).vins).toEqual([VIN_A, VIN_B]);
  });

  it("rejects anything that is not a VIN rather than accepting it", () => {
    // A registration pasted into the VIN box is the obvious mistake, and
    // silently storing it as a VIN would be worse than saying so.
    const r = parseVinList(`${VIN_A}\nAB12 CDE`);
    expect(r.vins).toEqual([VIN_A]);
    expect(r.invalid).toEqual(["AB12 CDE"]);
  });

  it("reports a repeated VIN once", () => {
    const r = parseVinList(`${VIN_A}\n${VIN_A}`);
    expect(r.vins).toEqual([VIN_A]);
    expect(r.duplicates).toEqual([VIN_A]);
  });
});

describe("pairByPosition", () => {
  const three = [
    { reg: "AB12 CDE", vin: null },
    { reg: "EF13 GHI", vin: null },
    { reg: "JK14 LMN", vin: null },
  ];

  it("matches the nth VIN to the nth registration", () => {
    const r = pairByPosition(three, ["WF0AXXTTRAPY00001", "WF0AXXTTRAPY00002", "WF0AXXTTRAPY00003"]);
    expect(r).toEqual({
      ok: true,
      vehicles: [
        { reg: "AB12 CDE", vin: "WF0AXXTTRAPY00001" },
        { reg: "EF13 GHI", vin: "WF0AXXTTRAPY00002" },
        { reg: "JK14 LMN", vin: "WF0AXXTTRAPY00003" },
      ],
    });
  });

  it("allows no VINs at all", () => {
    expect(pairByPosition(three, [])).toEqual({ ok: true, vehicles: three });
  });

  it("refuses a mismatch rather than shifting every VIN onto the wrong car", () => {
    // The failure this exists to prevent is silent and near-impossible to
    // spot afterwards: one missing VIN moves every later one up by a car.
    const r = pairByPosition(three, ["WF0AXXTTRAPY00001", "WF0AXXTTRAPY00002"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("3 registrations but 2 VINs");
      expect(r.reason).toContain("wrong vehicle");
    }
  });

  it("refuses when there are more VINs than registrations", () => {
    expect(pairByPosition(three, Array.from({ length: 4 }, (_, i) => `WF0AXXTTRAPY0000${i}`)).ok).toBe(false);
  });
});
