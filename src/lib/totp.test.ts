import { describe, it, expect } from "vitest";
import {
  base32Decode, base32Encode, formatSecretForDisplay, generateTotpSecret,
  hotp, otpauthUri, totp, verifyTotp,
} from "./totp";

// The RFC 6238 reference secret: the ASCII string "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

describe("base32", () => {
  it("round-trips", () => {
    for (const s of ["", "a", "ab", "abc", "abcd", "abcde", "hello world", "12345678901234567890"]) {
      expect(base32Decode(base32Encode(Buffer.from(s))).toString()).toBe(s);
    }
  });

  it("matches the known encoding of the RFC secret", () => {
    // If this drifts, every already-enrolled authenticator stops working.
    expect(RFC_SECRET_B32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("tolerates spaces and lower case, because people retype these by hand", () => {
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").toString()).toBe("12345678901234567890");
  });

  it("rejects a character outside the alphabet rather than decoding nonsense", () => {
    expect(() => base32Decode("GEZD1NBV")).toThrow();
  });
});

// RFC 6238 Appendix B, SHA-1 rows. The RFC prints 8 digits; an authenticator
// app shows the last 6 of the same number. These are the numbers Microsoft
// Authenticator will produce, so if this test fails, real logins fail.
describe("RFC 6238 test vectors (SHA-1)", () => {
  const VECTORS: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  it("produces the published 8-digit codes", () => {
    for (const [seconds, expected] of VECTORS) {
      expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8), `T=${seconds}`).toBe(expected);
    }
  });

  it("produces the 6-digit codes an authenticator app shows", () => {
    for (const [seconds, expected] of VECTORS) {
      expect(totp(RFC_SECRET_B32, seconds * 1000), `T=${seconds}`).toBe(expected.slice(-6));
    }
  });
});

describe("verifyTotp", () => {
  const at = 1_700_000_000_000;

  it("accepts the current code", () => {
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, at), at)).toBe(true);
  });

  it("accepts one step either side, for a slow typist and a drifting phone clock", () => {
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, at - 30_000), at)).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, at + 30_000), at)).toBe(true);
  });

  it("rejects two steps out — the window must not creep", () => {
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, at - 90_000), at)).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, at + 90_000), at)).toBe(false);
  });

  it("rejects a code from a different secret", () => {
    expect(verifyTotp(RFC_SECRET_B32, totp(generateTotpSecret(), at), at)).toBe(false);
  });

  it("ignores spaces, since apps display codes as '123 456'", () => {
    const code = totp(RFC_SECRET_B32, at);
    expect(verifyTotp(RFC_SECRET_B32, `${code.slice(0, 3)} ${code.slice(3)}`, at)).toBe(true);
  });

  it("rejects anything that is not six digits without throwing", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34", "<script>"]) {
      expect(verifyTotp(RFC_SECRET_B32, bad, at)).toBe(false);
    }
  });
});

describe("enrolment plumbing", () => {
  it("mints a 32-character base32 secret (160 bits, the SHA-1 block size)", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s).length).toBe(20);
  });

  it("mints a different secret each time", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it("builds an otpauth URI an authenticator will accept", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "dan@acme.co.uk", "Stock Portal");
    expect(uri.startsWith("otpauth://totp/Stock%20Portal%3Adan%40acme.co.uk?")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Stock+Portal");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("groups the manual-entry key in fours", () => {
    expect(formatSecretForDisplay("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
  });
});
