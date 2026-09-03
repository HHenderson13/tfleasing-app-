// RFC 6238 TOTP — the six-digit code a broker reads out of Microsoft
// Authenticator, Google Authenticator, 1Password or Authy.
//
// Written out rather than pulled in: it is ~60 lines of HMAC and base32, the
// algorithm has not changed since 2011, and a dependency in the sign-in path
// is a dependency that can be compromised into seeing every second factor.
//
// SHA-1, 6 digits, 30-second step — not a choice, that is what every
// authenticator app assumes when the otpauth:// URI omits them, and several
// ignore the parameters even when present.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DIGITS = 6;
const STEP_SECONDS = 30;
// How many steps either side of now to accept. One means a code stays good
// for about 90 seconds, which covers a slow typist and a phone clock a few
// seconds out without meaningfully widening the guessing window.
const SKEW_STEPS = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 20 bytes = 160 bits, the SHA-1 block size and what every authenticator
// expects. Longer is not stronger here.
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

// The counter-based core. Exported so the tests can drive it with the RFC
// vectors, which are specified against absolute timestamps.
export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  // Dynamic truncation, RFC 4226 §5.3.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function totp(secretBase32: string, atMs: number = Date.now(), digits = DIGITS): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter, digits);
}

// Accepts a code within SKEW_STEPS either side of now. Compares in constant
// time — a six-digit space is small enough that a timing signal would help.
export function verifyTotp(secretBase32: string, code: string, atMs: number = Date.now()): boolean {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const a = Buffer.from(given);
  for (let i = -SKEW_STEPS; i <= SKEW_STEPS; i++) {
    const b = Buffer.from(hotp(secret, counter + i));
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// The string behind the enrolment QR. Label and issuer both appear in the
// app's list; issuer is what stops "Stock Portal" colliding with some other
// account the broker already has.
export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// Base32 in groups of four, which is how every app displays a manual-entry
// key and how a person reads it off a screen without losing their place.
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, "$1 ").trim();
}
