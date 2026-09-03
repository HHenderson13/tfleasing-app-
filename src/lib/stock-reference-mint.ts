import "server-only";
import { createHash } from "node:crypto";
import { REF_LENGTH, REF_PREFIX, encodeReference } from "./stock-reference";

// Server-only half of the reference scheme — see stock-reference.ts for
// what a reference is and why it looks the way it does. Split out because
// node:crypto cannot be bundled into a client component, and the search
// box needs the reading rules on the client.

// 8 chars over a 32-symbol alphabet is 40 bits — one collision expected
// somewhere around 1.5m vehicles, so on a stock list of a few thousand
// the odds are ~1 in 90,000. If the list ever grows by orders of
// magnitude, lengthen REF_LENGTH for NEW references only and keep
// resolving the old ones by prefix.
export function vehicleReferenceFromVin(vin: string): string {
  const norm = vin.trim().toUpperCase();
  if (!norm) return `${REF_PREFIX}UNKNOWN`;
  const hash = createHash("sha256").update(norm).digest();
  return `${REF_PREFIX}${encodeReference(new Uint8Array(hash), REF_LENGTH)}`;
}
