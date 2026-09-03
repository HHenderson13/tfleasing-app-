import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cache } from "react";
import { db } from "@/db";
import { stockReferenceSecret } from "@/db/schema";
import { eq } from "drizzle-orm";
import { REF_LENGTH, REF_PREFIX, encodeReference } from "./stock-reference";

// ─── Why the hash is keyed ─────────────────────────────────────────────────
//
// A plain hash of the inputs is reversible here, not because SHA-256 is weak
// but because the inputs are guessable. Dealer codes and order numbers are
// short and enumerable: the entire reference space maps in well under a
// second on a laptop. Anyone who worked out the scheme could then read the
// dealer code off any reference — one of the things brokers are deliberately
// not shown.
//
// HMAC with a secret nobody outside the server has closes that: the mapping
// cannot be built without the key, however well the algorithm is understood.
//
// The secret is generated once and stored in the DATABASE, not an env var.
// It must survive forever — change it and every reference in circulation
// stops resolving — so it belongs where the backups are rather than
// somewhere it can be lost or mismatched between environments.
export const getStockReferenceSecret = cache(async function getStockReferenceSecret(): Promise<string> {
  const [row] = await db.select().from(stockReferenceSecret).where(eq(stockReferenceSecret.id, 1)).limit(1);
  if (row?.secret) return row.secret;
  // First mint on this installation. INSERT OR IGNORE semantics via the
  // primary key: if two requests race, one wins and both then read it back.
  const fresh = randomBytes(32).toString("base64url");
  await db.insert(stockReferenceSecret)
    .values({ id: 1, secret: fresh, createdAt: new Date() })
    .onConflictDoNothing();
  const [stored] = await db.select().from(stockReferenceSecret).where(eq(stockReferenceSecret.id, 1)).limit(1);
  return stored?.secret ?? fresh;
});

function mint(secret: string, input: string): string {
  const hash = createHmac("sha256", secret).update(input).digest();
  return `${REF_PREFIX}${encodeReference(new Uint8Array(hash), REF_LENGTH)}`;
}

// Server-only half of the reference scheme — see stock-reference.ts for
// what a reference is and why it looks the way it does. Split out because
// node:crypto cannot be bundled into a client component, and the search
// box needs the reading rules on the client.

// 8 chars over a 32-symbol alphabet is 40 bits — one collision expected
// somewhere around 1.5m vehicles, so on a stock list of a few thousand
// the odds are ~1 in 90,000. If the list ever grows by orders of
// magnitude, lengthen REF_LENGTH for NEW references only and keep
// resolving the old ones by prefix.
export function vehicleReferenceFromVin(vin: string, secret: string): string {
  const norm = vin.trim().toUpperCase();
  if (!norm) return `${REF_PREFIX}UNKNOWN`;
  return mint(secret, `VIN:${norm}`);
}

// ─── Vehicles with no VIN ──────────────────────────────────────────────────
//
// Ford assigns a VIN when a vehicle is built, so ORDERBANK stock has none —
// 2,264 rows in a recent upload, all with an ETA and all sellable. They still
// need a reference, because the reference is the ONLY handle a broker has on
// a vehicle: without one the "broker quotes it, TF searches it" loop breaks
// for everything not yet built.
//
// The key is the dealer code (column B) plus the order number (column AF).
// Confirmed by TF and verified against a real upload: unique across all
// 25,066 rows, with zero duplicates, and present on every VIN-less vehicle.
//
// The order number ALONE does not work — it is a batch code in this export,
// and 'C0057' covers sixteen vehicles including a Capri, a Puma, a Ranger
// and a Transit. It only becomes an identity once paired with the dealer.
//
// Nor does hashing the specification, which was the first attempt: a colour
// correction or an added option would mint a new reference and silently
// break one a broker was already holding. Dealer + order number is what the
// vehicle IS, not what it currently looks like, so it survives every
// correction Ford makes between now and the build.
export function vehicleIdentityKey(dealerRaw: string | null | undefined, orderNo: string | null | undefined): string | null {
  const dealer = (dealerRaw ?? "").trim().toUpperCase();
  const order = (orderNo ?? "").trim().toUpperCase();
  if (!dealer || !order) return null; // unreferenceable — caller drops the row
  return `${dealer}|${order}`;
}

// Namespaced with "ORD:" so an identity key can never collide with a VIN
// hash. VIN references are minted from the bare VIN and must keep the exact
// bytes they have always had, because brokers are holding them.
export function vehicleReferenceFromIdentity(identityKey: string, secret: string): string {
  return mint(secret, `ORD:${identityKey}`);
}
