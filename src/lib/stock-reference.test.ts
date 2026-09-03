import { describe, it, expect } from "vitest";
import { normaliseReferenceQuery } from "./stock-reference";
import { vehicleReferenceFromVin } from "./stock-reference-mint";

// A broker may be holding a reference written down weeks ago. These tests
// pin the output format so a refactor can't silently re-point every
// reference already in the wild.
describe("vehicleReferenceFromVin", () => {
  it("mints a stable, known reference for a known VIN", () => {
    // Golden value — if this fails, the hashing changed and every
    // reference a broker holds now points at nothing. Do not "fix" the
    // expectation; fix the code.
    expect(vehicleReferenceFromVin("WF0AXXTTRAPY12345")).toBe("TF-2GG495H9");
  });

  it("is deterministic across calls", () => {
    const a = vehicleReferenceFromVin("WF0AXXTTRAPY12345");
    const b = vehicleReferenceFromVin("WF0AXXTTRAPY12345");
    expect(a).toBe(b);
  });

  it("normalises case and surrounding space, so the same vehicle never gets two references", () => {
    expect(vehicleReferenceFromVin("  wf0axxttrapy12345 ")).toBe(vehicleReferenceFromVin("WF0AXXTTRAPY12345"));
  });

  it("gives different VINs different references", () => {
    expect(vehicleReferenceFromVin("WF0AXXTTRAPY12345")).not.toBe(vehicleReferenceFromVin("WF0AXXTTRAPY12346"));
  });

  it("always emits TF- plus 8 chars from the unambiguous alphabet", () => {
    for (const vin of ["WF0AXXTTRAPY12345", "SADHA2S18N1234567", "A", "ZZZZZZZZZZZZZZZZZ"]) {
      expect(vehicleReferenceFromVin(vin)).toMatch(/^TF-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("never emits look-alike characters that get mis-read down the phone", () => {
    for (let i = 0; i < 500; i++) {
      const ref = vehicleReferenceFromVin(`WF0AXXTTRAPY${String(i).padStart(5, "0")}`);
      expect(ref.slice(3)).not.toMatch(/[IO01]/);
    }
  });

  it("flags a blank VIN rather than minting a collidable reference", () => {
    expect(vehicleReferenceFromVin("   ")).toBe("TF-UNKNOWN");
  });
});

describe("normaliseReferenceQuery", () => {
  it("accepts the reference as printed", () => {
    expect(normaliseReferenceQuery("TF-2GG495H9")).toBe("TF-2GG495H9");
  });

  it("accepts it lower-case, spaced, or without the prefix", () => {
    expect(normaliseReferenceQuery("tf-2gg495h9")).toBe("TF-2GG495H9");
    expect(normaliseReferenceQuery("  TF-2GG495H9  ")).toBe("TF-2GG495H9");
    expect(normaliseReferenceQuery("2GG495H9")).toBe("TF-2GG495H9");
    expect(normaliseReferenceQuery("TF- 2GG4 95H9")).toBe("TF-2GG495H9");
  });

  it("rejects anything that isn't a reference, so ordinary searches fall through", () => {
    expect(normaliseReferenceQuery("Focus")).toBeNull();
    expect(normaliseReferenceQuery("")).toBeNull();
    expect(normaliseReferenceQuery("TF-SHORT")).toBe(null);
    expect(normaliseReferenceQuery("TF-TOOLONGREF")).toBeNull();
    // 8 chars but contains a look-alike the alphabet never emits.
    expect(normaliseReferenceQuery("TF-2GG495H0")).toBeNull();
  });
});
