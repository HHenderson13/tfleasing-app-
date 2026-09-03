import { describe, it, expect } from "vitest";
import { normaliseReferenceQuery } from "./stock-reference";
import { vehicleIdentityKey, vehicleReferenceFromIdentity, vehicleReferenceFromVin } from "./stock-reference-mint";

// The reference is an HMAC, so a golden value is only meaningful against a
// known key. This fixed secret pins the ALGORITHM; the real key is generated
// per installation and stored in the database.
const SECRET = "test-secret-do-not-use-in-production";
const GOLDEN_VIN_REF = "TF-MWPC2UNL";

// A broker may be holding a reference written down weeks ago. These tests
// pin the output format so a refactor can't silently re-point every
// reference already in the wild.
describe("vehicleReferenceFromVin", () => {
  it("mints a stable, known reference for a known VIN", () => {
    // Golden value — if this fails, the hashing changed and every
    // reference a broker holds now points at nothing. Do not "fix" the
    // expectation; fix the code.
    expect(vehicleReferenceFromVin("WF0AXXTTRAPY12345", SECRET)).toBe(GOLDEN_VIN_REF);
  });

  it("is deterministic across calls", () => {
    const a = vehicleReferenceFromVin("WF0AXXTTRAPY12345", SECRET);
    const b = vehicleReferenceFromVin("WF0AXXTTRAPY12345", SECRET);
    expect(a).toBe(b);
  });

  it("normalises case and surrounding space, so the same vehicle never gets two references", () => {
    expect(vehicleReferenceFromVin("  wf0axxttrapy12345 ", SECRET)).toBe(vehicleReferenceFromVin("WF0AXXTTRAPY12345", SECRET));
  });

  it("gives different VINs different references", () => {
    expect(vehicleReferenceFromVin("WF0AXXTTRAPY12345", SECRET)).not.toBe(vehicleReferenceFromVin("WF0AXXTTRAPY12346", SECRET));
  });

  it("always emits TF- plus 8 chars from the unambiguous alphabet", () => {
    for (const vin of ["WF0AXXTTRAPY12345", "SADHA2S18N1234567", "A", "ZZZZZZZZZZZZZZZZZ"]) {
      expect(vehicleReferenceFromVin(vin, SECRET)).toMatch(/^TF-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("never emits look-alike characters that get mis-read down the phone", () => {
    for (let i = 0; i < 500; i++) {
      const ref = vehicleReferenceFromVin(`WF0AXXTTRAPY${String(i).padStart(5, "0")}`, SECRET);
      expect(ref.slice(3)).not.toMatch(/[IO01]/);
    }
  });

  it("flags a blank VIN rather than minting a collidable reference", () => {
    expect(vehicleReferenceFromVin("   ", SECRET)).toBe("TF-UNKNOWN");
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

// ─── Vehicles with no VIN ──────────────────────────────────────────────────

describe("vehicleIdentityKey", () => {
  it("combines dealer and order number, since neither identifies a vehicle alone", () => {
    // The order number is a batch code in this export — 'C0057' covers a
    // Capri, a Puma, a Ranger and a Transit. Only the pair is unique.
    expect(vehicleIdentityKey("97702 (Fleet Bristol)", "M0344")).toBe("97702 (FLEET BRISTOL)|M0344");
  });

  it("normalises case and padding, because the export is not consistent", () => {
    expect(vehicleIdentityKey("  97702 (fleet bristol) ", " m0344 ")).toBe("97702 (FLEET BRISTOL)|M0344");
  });

  it("refuses to invent a key when either half is missing", () => {
    // A row we cannot identify gets no reference and is left out, rather than
    // being published with one that dies at the next upload.
    expect(vehicleIdentityKey(null, "M0344")).toBeNull();
    expect(vehicleIdentityKey("97702", null)).toBeNull();
    expect(vehicleIdentityKey("  ", "M0344")).toBeNull();
  });
});

describe("vehicleReferenceFromIdentity", () => {
  const key = vehicleIdentityKey("97702 (Fleet Bristol)", "M0344")!;

  it("pins the format against a known key", () => {
    expect(vehicleReferenceFromIdentity(key, SECRET)).toBe("TF-Y4Z2G93A");
  });

  it("looks exactly like a VIN reference, so neither reveals which it is", () => {
    expect(vehicleReferenceFromIdentity(key, SECRET)).toMatch(/^TF-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("cannot collide with the VIN reference for the same string", () => {
    // The two are namespaced apart, so a VIN that happened to equal an
    // identity key would still mint a different reference.
    expect(vehicleReferenceFromIdentity(key, SECRET)).not.toBe(vehicleReferenceFromVin(key, SECRET));
  });

  it("is stable for the same vehicle and different for another", () => {
    expect(vehicleReferenceFromIdentity(key, SECRET)).toBe(vehicleReferenceFromIdentity(key, SECRET));
    const other = vehicleIdentityKey("97702 (Fleet Bristol)", "M0345")!;
    expect(vehicleReferenceFromIdentity(other, SECRET)).not.toBe(vehicleReferenceFromIdentity(key, SECRET));
  });
});

describe("the key is what makes a reference unguessable", () => {
  // Dealer codes and order numbers are short and enumerable: an unkeyed hash
  // of them maps in under a second, handing out the dealer code behind any
  // reference. These assert the key actually participates.
  const key = vehicleIdentityKey("97702 (Fleet Bristol)", "M0344")!;

  it("changes every reference when the key changes", () => {
    expect(vehicleReferenceFromIdentity(key, "another-secret")).not.toBe(vehicleReferenceFromIdentity(key, SECRET));
    expect(vehicleReferenceFromVin("WF0AXXTTRAPY12345", "another-secret")).not.toBe(GOLDEN_VIN_REF);
  });

  it("does not leak its inputs into the output", () => {
    const ref = vehicleReferenceFromIdentity(key, SECRET);
    expect(ref).not.toContain("97702");
    expect(ref).not.toContain("M0344");
  });
});
