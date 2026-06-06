import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { stockVehicles } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";

// Brokers never see a real VIN, dealer code, or order number — they see
// a unique reference that maps back deterministically. The mapping is a
// truncated SHA-256 of the VIN, so the same vehicle keeps the same
// reference across uploads (the autoincrement id resets each replace —
// hashing VIN is the stable handle).
//
// Eight base-32-ish characters give us ~10^12 buckets, enough to make
// guessing a valid reference impractical without ever needing a DB
// lookup to mint a new one.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // base32 minus look-alikes

function encode(bytes: Uint8Array, length: number): string {
  let out = "";
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && out.length < length) {
      const idx = (buffer >>> (bits - 5)) & 0x1f;
      out += ALPHABET[idx];
      bits -= 5;
    }
  }
  return out;
}

export function vehicleReferenceFromVin(vin: string): string {
  const norm = vin.trim().toUpperCase();
  if (!norm) return "TF-UNKNOWN";
  const hash = createHash("sha256").update(norm).digest();
  return `TF-${encode(new Uint8Array(hash), 8)}`;
}

// Resolve a broker reference back to a VIN. Scans all in-stock vehicles
// (small set — typically < 5k rows) and rehashes. Indexable later by
// adding a derived column if perf ever calls for it; for now an in-memory
// pass over ~1000 rows is well under a millisecond.
export async function findVinByReference(ref: string): Promise<string | null> {
  const cleanRef = ref.trim().toUpperCase();
  if (!cleanRef.startsWith("TF-")) return null;
  const rows = await db
    .select({ vin: stockVehicles.vin })
    .from(stockVehicles)
    .where(isNotNull(stockVehicles.vin));
  for (const r of rows) {
    if (!r.vin) continue;
    if (vehicleReferenceFromVin(r.vin) === cleanRef) return r.vin;
  }
  return null;
}

// Resolve back to the raw stockVehicles row — useful when the broker
// clicks "Get quote" and we need every field on the source vehicle to
// drive the quote engine. Returns null when no match (vehicle sold /
// removed since the reference was minted).
export async function findVehicleByReference(ref: string) {
  const vin = await findVinByReference(ref);
  if (!vin) return null;
  const [row] = await db.select().from(stockVehicles).where(eq(stockVehicles.vin, vin)).limit(1);
  return row ?? null;
}
