// The single handle a vehicle can be referred to by outside TF.
//
// Brokers never see a VIN, an order number, a dealer or a destination —
// they see a reference like "TF-2GG495H9". A broker quotes that back to
// us over the phone or by email and the TF side pastes it into the /stock
// search box to land on the exact vehicle.
//
// The reference is a truncated SHA-256 of the VIN, so:
//   • it is stable — the same vehicle keeps the same reference across
//     stock uploads (the stockVehicles autoincrement id is replaced on
//     every upload, so hashing the VIN is the only durable handle);
//   • it is opaque — it encodes nothing about the VIN, the dealer, the
//     model or the arrival date, and cannot be reversed;
//   • it needs no table and no round trip — minting one is a hash, and
//     TF-side lookup is a plain match on the already-loaded stock list.
//
// This file is the CLIENT-SAFE half: the alphabet and the rules for
// reading a reference back off a human. Minting needs node:crypto and
// lives in stock-reference-mint.ts, which the browser must never import.
//
// NEVER change the alphabet or the length. A broker may be holding a
// reference written down weeks ago, and any change silently re-points
// every one of them. stock-reference.test.ts pins the format.

// base32 minus the look-alikes — no I, O, 0 or 1 — because these get read
// down the phone and written on a pad.
export const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REF_LENGTH = 8;
export const REF_PREFIX = "TF-";

export function encodeReference(bytes: Uint8Array, length: number): string {
  let out = "";
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && out.length < length) {
      const idx = (buffer >>> (bits - 5)) & 0x1f;
      out += REF_ALPHABET[idx];
      bits -= 5;
    }
  }
  return out;
}

// Turn whatever the user typed into a canonical reference, or null if it
// isn't one. Deliberately forgiving, because the input is usually being
// copied off an email or read aloud: case is ignored, spaces anywhere are
// dropped, and the "TF-" prefix is optional.
//
// Returning null is the normal case — it means "this is ordinary search
// text", and the caller falls back to a substring search.
export function normaliseReferenceQuery(q: string): string | null {
  const clean = q.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!clean) return null;
  const body = clean.startsWith("TF") ? clean.slice(2) : clean;
  if (body.length !== REF_LENGTH) return null;
  for (const ch of body) if (!REF_ALPHABET.includes(ch)) return null;
  return `${REF_PREFIX}${body}`;
}
